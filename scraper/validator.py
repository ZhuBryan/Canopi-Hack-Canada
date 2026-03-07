"""Aggressive listing validator for RentFaster data.

Filters out fake, junk, and suspicious listings before they reach the app.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


MIN_PRICE = 500
SUSPICIOUS_APARTMENT_PRICE = 800


@dataclass
class FilterReport:
    total_input: int = 0
    total_output: int = 0
    removed_no_price: int = 0
    removed_price_zero: int = 0
    removed_price_too_low: int = 0
    removed_suspicious_price: int = 0
    removed_missing_title: int = 0
    removed_missing_location: int = 0
    removed_missing_photo: int = 0
    removed_duplicate_id: int = 0
    removed_duplicate_title_price: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "total_input": self.total_input,
            "total_output": self.total_output,
            "total_removed": self.total_input - self.total_output,
            "removed_no_price": self.removed_no_price,
            "removed_price_zero": self.removed_price_zero,
            "removed_price_too_low": self.removed_price_too_low,
            "removed_suspicious_price": self.removed_suspicious_price,
            "removed_missing_title": self.removed_missing_title,
            "removed_missing_location": self.removed_missing_location,
            "removed_missing_photo": self.removed_missing_photo,
            "removed_duplicate_id": self.removed_duplicate_id,
            "removed_duplicate_title_price": self.removed_duplicate_title_price,
        }


def parse_price(raw: str | None) -> int:
    """Extract numeric price from strings like '$1,200' or '1200'."""
    if not raw:
        return 0
    digits = re.sub(r"[^0-9]", "", raw)
    try:
        return int(digits)
    except ValueError:
        return 0


def validate_listings(
    listings: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], FilterReport]:
    """Run all filters and return (clean_listings, report)."""
    report = FilterReport(total_input=len(listings))
    seen_ids: set[str] = set()
    seen_title_price: set[str] = set()
    clean: list[dict[str, Any]] = []

    for item in listings:
        listing_id = str(item.get("listing_id") or item.get("id") or "")

        # --- Duplicate listing ID ---
        if listing_id and listing_id in seen_ids:
            report.removed_duplicate_id += 1
            continue
        if listing_id:
            seen_ids.add(listing_id)

        # --- Missing essential fields ---
        title = (item.get("title") or "").strip()
        if not title:
            report.removed_missing_title += 1
            continue

        location = (item.get("location") or "").strip()
        if not location:
            report.removed_missing_location += 1
            continue

        photo = (item.get("photo") or "").strip()
        if not photo:
            report.removed_missing_photo += 1
            continue

        # --- Price checks ---
        price_raw = item.get("price")
        price = parse_price(price_raw)

        if not price_raw or price_raw.strip() in ("", "$"):
            report.removed_no_price += 1
            continue

        if price == 0:
            report.removed_price_zero += 1
            continue

        if price < MIN_PRICE:
            report.removed_price_too_low += 1
            continue

        if price < SUSPICIOUS_APARTMENT_PRICE:
            report.removed_suspicious_price += 1
            continue

        # --- Duplicate title+price (spam detection) ---
        title_price_key = f"{title.lower()}|{price}"
        if title_price_key in seen_title_price:
            report.removed_duplicate_title_price += 1
            continue
        seen_title_price.add(title_price_key)

        clean.append(item)

    report.total_output = len(clean)
    return clean, report
