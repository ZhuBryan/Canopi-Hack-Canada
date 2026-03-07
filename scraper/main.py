"""RentFaster scraper API.

Continuously scrapes Toronto rental listings from the RentFaster JSON API,
runs them through aggressive validation, and exposes clean data via REST endpoints.

Usage:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from validator import FilterReport, validate_listings

# ── Config ────────────────────────────────────────────────────────────────────

SCRAPE_INTERVAL_SECONDS = int(os.getenv("SCRAPE_INTERVAL_SECONDS", "300"))
RENTFASTER_API = "https://www.rentfaster.ca/api/search.json"
RENTFASTER_LANDING = "https://www.rentfaster.ca/on/toronto/rentals/"
RESULTS_PER_PAGE = 50
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data"
OUTPUT_FILE = OUTPUT_DIR / "rentfaster-listings.scraped.json"
COOKIE_FILE = Path(__file__).resolve().parent / ".rf_cookies.txt"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("scraper")

# ── State ─────────────────────────────────────────────────────────────────────

listings_cache: list[dict[str, Any]] = []
last_report: dict[str, int] = {}
last_scraped: str | None = None
scrape_running: bool = False

# ── Scraper ───────────────────────────────────────────────────────────────────


def refresh_session_cookies() -> None:
    """Visit the Toronto landing page to get a session cookie.

    RentFaster's API is region-locked: it returns listings matching the
    `lastcity` cookie, which is set when you visit a city's landing page.
    """
    log.info("Refreshing session cookies from %s ...", RENTFASTER_LANDING)
    result = subprocess.run(
        [
            "curl", "-s", "-c", str(COOKIE_FILE),
            "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "-o", os.devnull,
            RENTFASTER_LANDING,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        log.warning("Cookie refresh failed (exit %d)", result.returncode)


def fetch_page(page: int) -> dict[str, Any]:
    """Fetch a single page from the RentFaster search API using curl.

    Uses session cookies from the Toronto landing page to get Ontario listings.
    """
    params = urlencode({
        "proximity_type": "location-city",
        "novacancy": "0",
        "cur_page": str(page),
        "results_per_page": str(RESULTS_PER_PAGE),
    })
    url = f"{RENTFASTER_API}?{params}"

    result = subprocess.run(
        [
            "curl", "-s", "-f",
            "-b", str(COOKIE_FILE),
            "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "-H", "Accept: application/json, text/plain, */*",
            "-H", "Accept-Language: en-US,en;q=0.9",
            "-H", "Referer: https://www.rentfaster.ca/on/toronto/rentals/",
            url,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        raise RuntimeError(f"curl failed (exit {result.returncode}): {result.stderr}")

    return json.loads(result.stdout)


def _pets_label(raw: dict[str, Any]) -> str | None:
    cats = raw.get("cats")
    dogs = raw.get("dogs")
    if cats and dogs:
        return "pets_ok"
    if cats:
        return "cats_ok"
    if dogs:
        return "dogs_ok"
    if cats is False and dogs is False:
        return "no_pets"
    return None


def normalize_listing(raw: dict[str, Any]) -> dict[str, Any]:
    """Map RentFaster API fields to our standard format with full details."""
    listing_id = str(raw.get("id") or raw.get("ref_id") or "")
    price_val = raw.get("price")
    price_str = f"${price_val}" if price_val else None

    photo = raw.get("thumb") or raw.get("photo") or ""
    if photo and not photo.startswith("http"):
        photo = f"https://www.rentfaster.ca{photo}"

    slide = raw.get("slide") or ""
    if slide and not slide.startswith("http"):
        slide = f"https://www.rentfaster.ca{slide}"

    title = raw.get("title") or raw.get("intro") or ""
    address = raw.get("address") or ""
    city = raw.get("city") or ""
    province = raw.get("province") or raw.get("prov") or ""
    location = address
    if city and location and city not in location:
        location = f"{location}, {city}"

    link = raw.get("link") or ""
    url = f"https://www.rentfaster.ca{link}" if link else None

    return {
        "listing_id": listing_id,
        "url": url,
        "title": title,
        "location": location,
        "address": address,
        "city": city,
        "province": province,
        "community": raw.get("community") or None,
        "price": price_str,
        "photo": photo,
        "photo_large": slide or None,
        "beds": raw.get("bedrooms"),
        "den": raw.get("den"),
        "baths": raw.get("baths"),
        "sqft": raw.get("sq_feet") or None,
        "property_type": raw.get("type") or None,
        "lat": raw.get("latitude"),
        "lng": raw.get("longitude"),
        "availability": raw.get("availability") or raw.get("avdate") or None,
        "lease_term": raw.get("lease_term") or None,
        "pets": _pets_label(raw),
        "smoking": raw.get("smoking") or None,
        "utilities_included": raw.get("utilities_included") or [],
        "features": raw.get("features") or [],
        "date_listed": raw.get("date") or None,
    }


def scrape_all() -> list[dict[str, Any]]:
    """Fetch all pages of Toronto listings from RentFaster."""
    refresh_session_cookies()

    all_listings: list[dict[str, Any]] = []
    page = 1

    log.info("Starting scrape for Toronto ...")

    while True:
        try:
            data = fetch_page(page)
        except Exception as exc:
            log.error("Failed to fetch page %d: %s", page, exc)
            break

        results = data.get("listings") or data.get("results") or []
        if not results:
            log.info("No more results at page %d, done.", page)
            break

        for raw in results:
            all_listings.append(normalize_listing(raw))

        total = data.get("total") or data.get("total_results") or 0
        log.info("Page %d: got %d listings (total available: %s)", page, len(results), total)

        # Stop if we've fetched everything
        if total and len(all_listings) >= int(total):
            break

        page += 1
        # Be polite — small delay between pages
        time.sleep(1.0)

    log.info("Scrape complete: %d listings fetched.", len(all_listings))
    return all_listings


def run_scrape_and_validate() -> tuple[list[dict[str, Any]], FilterReport]:
    """Scrape + validate in one call."""
    raw = scrape_all()
    clean, report = validate_listings(raw)

    # Persist to disk
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(clean, indent=2), encoding="utf-8")
    log.info(
        "Wrote %d clean listings to %s (filtered %d)",
        report.total_output,
        OUTPUT_FILE.name,
        report.total_input - report.total_output,
    )

    return clean, report


# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="RentFaster Scraper API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def poll_loop() -> None:
    """Background task that scrapes on an interval."""
    global listings_cache, last_report, last_scraped, scrape_running

    while True:
        if not scrape_running:
            scrape_running = True
            try:
                clean, report = await asyncio.to_thread(run_scrape_and_validate)
                listings_cache = clean
                last_report = report.to_dict()
                last_scraped = datetime.now(timezone.utc).isoformat()
            except Exception:
                log.exception("Scrape failed")
            finally:
                scrape_running = False

        await asyncio.sleep(SCRAPE_INTERVAL_SECONDS)


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(poll_loop())


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/listings")
def get_listings() -> list[dict[str, Any]]:
    return listings_cache


@app.get("/listings/stats")
def get_stats() -> dict[str, Any]:
    return {
        "count": len(listings_cache),
        "last_scraped": last_scraped,
        "is_scraping": scrape_running,
        "filter_report": last_report,
    }


@app.post("/scrape")
async def trigger_scrape() -> dict[str, Any]:
    global listings_cache, last_report, last_scraped, scrape_running

    if scrape_running:
        return {"status": "already_running"}

    scrape_running = True
    try:
        clean, report = await asyncio.to_thread(run_scrape_and_validate)
        listings_cache = clean
        last_report = report.to_dict()
        last_scraped = datetime.now(timezone.utc).isoformat()
    finally:
        scrape_running = False

    return {
        "status": "done",
        "count": len(listings_cache),
        "filter_report": last_report,
    }
