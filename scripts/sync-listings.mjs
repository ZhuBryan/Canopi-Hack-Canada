#!/usr/bin/env node
// Sync one city's rental listings into Supabase.
//   node scripts/sync-listings.mjs --city toronto|sf [--limit 200] [--detail-limit 300] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEOAPIFY_API_KEY, RENTCAST_API_KEY (sf only)
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchNearby } from "./geoapify.mjs";
import { fetchRentfasterDetail } from "./sources/rentfaster.mjs";
import { resolveRealtorUrl } from "./sources/realtor.mjs";

const SOURCES = {
  toronto: async () => (await import("./sources/rentfaster.mjs")).fetchRentfaster(),
  sf: async () => (await import("./sources/rentcast.mjs")).fetchRentcast({ apiKey: process.env.RENTCAST_API_KEY }),
};
const MIN_RENT = 500;
const BATCH = 500;
// ponytail: rows carry up to ~60KB of nearby JSON each; 500 per upsert (~20MB) hit the
// statement timeout. 50 keeps each statement ~2-3MB.
const UPSERT_BATCH = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const cellKey = (lat, lng) => `${lat.toFixed(3)}|${lng.toFixed(3)}`;

export function toRow(raw, city, nearby) {
  return {
    id: raw.id,
    city,
    source: raw.source,
    url: raw.url,
    address: raw.address,
    full_address: raw.fullAddress,
    lat: raw.lat,
    lng: raw.lng,
    monthly_rent: raw.monthlyRent,
    beds: raw.beds,
    baths: raw.baths,
    sqft: raw.sqft,
    property_type: raw.propertyType,
    photo: raw.photo,
    available: raw.available,
    lease_term: raw.leaseTerm,
    description: raw.description ?? null,
    amenities: raw.amenities,
    nearby,
    active: true,
    seen_at: new Date().toISOString(),
  };
}

// Rows enriched before Geoapify coordinates were captured have places but no lat/lon,
// so the app cannot draw tethers to them. Treat those as unenriched and let the normal
// per-run limit backfill them, rather than forcing one big re-sync through the quota.
export function hasPlaceCoords(nearby) {
  if (!nearby) return false;
  const buckets = Object.values(nearby);
  if (buckets.length === 0) return false;
  const places = buckets.flatMap((b) => b?.places ?? []);
  // A bucket can legitimately be empty in a sparse area; only claim the row is stale
  // when it has places and none of them carry coordinates.
  if (places.length === 0) return true;
  return places.some((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
}

// existing: Map<id, {lat, lng, nearby}> for rows already in the DB for this city.
export function planEnrichment(raws, existing, limit) {
  const byCell = new Map();
  for (const e of existing.values()) {
    if (e.nearby && Object.keys(e.nearby).length && hasPlaceCoords(e.nearby)) {
      byCell.set(cellKey(e.lat, e.lng), e.nearby);
    }
  }
  const reuse = new Map();
  const fresh = [];
  for (const r of raws) {
    const prev = existing.get(r.id);
    if (prev && prev.nearby && Object.keys(prev.nearby).length && hasPlaceCoords(prev.nearby)) continue;
    const cached = byCell.get(cellKey(r.lat, r.lng));
    if (cached) reuse.set(r.id, cached);
    else if (fresh.length < limit) fresh.push(r.id);
    // ponytail: rows past `limit` are inserted with nearby={} and enriched on a later run —
    // Geoapify free tier is 3,000 calls/day and each listing costs 7.
  }
  return { reuse, fresh };
}

// RentCast rows start out linking to a Google search for the address (see rentcast.mjs).
export const isSearchFallback = (url) => !url || url.startsWith("https://www.google.com/search");

// rentfaster raws without a description on file, and rentcast raws not yet keyed to a listing page.
export function planDetail(raws, existing) {
  return raws
    .filter((r) => {
      const prev = existing.get(r.id);
      if (r.source === "rentfaster") return !prev?.description;
      if (r.source === "rentcast") return isSearchFallback(prev?.url);
      return false;
    })
    .map((r) => r.id);
}

// Per-source detail fetcher: (raw, { onStatus }) => Promise<detail | null>, never throws.
// pauseMs paces requests: RentFaster pages challenge a fast run; a Realtor lookup is one small JSON call.
const DETAIL_SOURCES = {
  rentfaster: { fetch: (r, opts) => fetchRentfasterDetail(r.url, opts), pauseMs: 3000 },
  rentcast: { fetch: (r, opts) => resolveRealtorUrl(r.fullAddress, opts), pauseMs: 1000 },
};

// Challenged, rate-limited, erroring or timed out (status 0): after 10 in a row, stop the pass so
// the run still reaches the upsert instead of burning the job's time limit.
export const isBlockedStatus = (status) => status === 0 || status === 403 || status === 429 || status >= 500;

// Cap detail-page fetches per run — RentFaster 403s a run that fetches too many too fast.
// Ids past the cap are simply not attempted; planDetail picks them up again next run.
export function takeDetailIds(ids, limit) {
  return ids.slice(0, limit);
}

// Fill sqft/amenities/lease_term/photo/description from a freshly fetched detail page,
// falling back to the existing DB row so a re-sync never overwrites them with nulls.
export function mergeDetail(row, detail, prev) {
  const pick = (detailVal, prevVal, rowVal) => (detailVal !== undefined && detailVal !== null ? detailVal : prevVal ?? rowVal);
  return {
    ...row,
    sqft: pick(detail?.sqft, prev?.sqft, row.sqft),
    amenities: pick(detail?.amenities, prev?.amenities, row.amenities),
    lease_term: pick(detail?.leaseTerm, prev?.lease_term, row.lease_term),
    photo: pick(detail?.photo, prev?.photo, row.photo),
    description: pick(detail?.description, prev?.description, row.description),
    // A resolved listing link beats the source's Google-search fallback, and once stored it
    // must survive re-syncs that rebuild the row with the fallback again.
    url: detail?.url ?? (isSearchFallback(row.url) && !isSearchFallback(prev?.url) ? prev.url : row.url),
  };
}

async function main() {
  const { values: opts } = parseArgs({
    options: {
      city: { type: "string" },
      limit: { type: "string", default: "200" },
      "detail-limit": { type: "string", default: "300" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const city = opts.city;
  if (!SOURCES[city]) throw new Error(`--city must be one of: ${Object.keys(SOURCES).join(", ")}`);
  const limit = parseInt(opts.limit, 10);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("--limit must be a non-negative integer");
  const detailLimit = parseInt(opts["detail-limit"], 10);
  if (!Number.isFinite(detailLimit) || detailLimit < 0) throw new Error("--detail-limit must be a non-negative integer");
  const dry = opts["dry-run"];

  const raws = (await SOURCES[city]()).filter((r) => r.monthlyRent >= MIN_RENT);
  console.log(`[${city}] fetched ${raws.length} listings`);
  if (raws.length === 0) throw new Error("source returned nothing; aborting before any writes");

  const supabase = dry ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const existing = new Map();
  if (supabase) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("listings")
        .select("id, url, lat, lng, nearby, sqft, amenities, lease_term, photo, description")
        .eq("city", city)
        .range(from, from + 999);
      if (error) throw error;
      for (const r of data) existing.set(r.id, r);
      if (data.length < 1000) break;
    }
  }

  const { reuse, fresh } = planEnrichment(raws, existing, limit);
  console.log(`[${city}] new: ${raws.length - [...raws].filter((r) => existing.has(r.id)).length}, reuse cell cache: ${reuse.size}, geoapify: ${fresh.length}`);
  const detailIds = planDetail(raws, existing);
  const detailIdsToFetch = takeDetailIds(detailIds, detailLimit);
  if (dry) {
    console.log(
      `[${city}] detail pages: ${detailIdsToFetch.length} would fetch, ${detailIds.length - detailIdsToFetch.length} skipped (limit)`
    );
    console.log(JSON.stringify(raws.slice(0, 3), null, 2));
    return;
  }

  const byId = new Map(raws.map((r) => [r.id, r]));
  const enriched = new Map(reuse);
  console.log(`[${city}] enriching ${fresh.length} listings via Geoapify…`);
  for (let i = 0; i < fresh.length; i++) {
    const id = fresh[i];
    const r = byId.get(id);
    try {
      enriched.set(id, await fetchNearby(r.lat, r.lng, { apiKey: process.env.GEOAPIFY_API_KEY }));
    } catch (err) {
      console.warn(`[${city}] geoapify failed for ${id}: ${err.message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`[${city}] geoapify ${i + 1}/${fresh.length}`);
  }
  console.log(`[${city}] geoapify ${fresh.length}/${fresh.length}`);

  const details = new Map();
  let fetched = 0;
  let failed = 0;
  let consecutiveBlocked = 0;
  console.log(`[${city}] fetching ${detailIdsToFetch.length} detail pages…`);
  for (let i = 0; i < detailIdsToFetch.length; i++) {
    const id = detailIdsToFetch[i];
    const r = byId.get(id);
    const { fetch: fetchDetail, pauseMs } = DETAIL_SOURCES[r.source];
    let status = null;
    const detail = await fetchDetail(r, { onStatus: (s) => (status = s) });
    if (isBlockedStatus(status)) {
      consecutiveBlocked++;
      console.log(`[${city}] detail: ${status || "timeout/network error"}; skipping`);
    } else {
      consecutiveBlocked = 0;
    }
    details.set(id, detail);
    if (detail) fetched++;
    else failed++;
    if (consecutiveBlocked >= 10) {
      console.log(`[${city}] detail: 10 consecutive blocked/failed requests, stopping detail pass (${fetched} fetched)`);
      break;
    }
    if ((fetched + failed) % 50 === 0) console.log(`[${city}] detail pages: ${fetched + failed}/${detailIdsToFetch.length}`);
    if (status !== null) await sleep(pauseMs + Math.random() * (pauseMs / 2)); // no request made, nothing to pace
  }
  const skipped = detailIds.length - fetched - failed;
  console.log(`[${city}] detail pages: fetched ${fetched}, failed ${failed}, skipped ${skipped} (limit)`);

  const rows = raws.map((r) => mergeDetail(toRow(r, city, enriched.get(r.id) ?? existing.get(r.id)?.nearby ?? {}), details.get(r.id), existing.get(r.id)));
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const { error } = await supabase.from("listings").upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: "id" });
    if (error) throw error;
  }

  const seen = new Set(rows.map((r) => r.id));
  const stale = [...existing.keys()].filter((id) => !seen.has(id));
  for (let i = 0; i < stale.length; i += BATCH) {
    const { error } = await supabase.from("listings").update({ active: false }).in("id", stale.slice(i, i + BATCH));
    if (error) throw error;
  }
  console.log(`[${city}] upserted ${rows.length}, deactivated ${stale.length}`);
}

// ponytail: the brief's guard (`import.meta.url.endsWith(basename)`) false-positives whenever
// argv[1]'s basename happens to match this file's name, e.g. under a test runner that sets
// argv[1] to a same-named path elsewhere. Exact URL comparison is one line and correct.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
