#!/usr/bin/env node
// Sync one city's rental listings into Supabase.
//   node scripts/sync-listings.mjs --city toronto|sf [--limit 200] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEOAPIFY_API_KEY, RENTCAST_API_KEY (sf only)
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchNearby } from "./geoapify.mjs";
import { fetchRentfasterDetail } from "./sources/rentfaster.mjs";

const SOURCES = {
  toronto: async () => (await import("./sources/rentfaster.mjs")).fetchRentfaster(),
  sf: async () => (await import("./sources/rentcast.mjs")).fetchRentcast({ apiKey: process.env.RENTCAST_API_KEY }),
};
const MIN_RENT = 500;
const BATCH = 500;

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

// existing: Map<id, {lat, lng, nearby}> for rows already in the DB for this city.
export function planEnrichment(raws, existing, limit) {
  const byCell = new Map();
  for (const e of existing.values()) {
    if (e.nearby && Object.keys(e.nearby).length) byCell.set(cellKey(e.lat, e.lng), e.nearby);
  }
  const reuse = new Map();
  const fresh = [];
  for (const r of raws) {
    const prev = existing.get(r.id);
    if (prev && prev.nearby && Object.keys(prev.nearby).length) continue;
    const cached = byCell.get(cellKey(r.lat, r.lng));
    if (cached) reuse.set(r.id, cached);
    else if (fresh.length < limit) fresh.push(r.id);
    // ponytail: rows past `limit` are inserted with nearby={} and enriched on a later run —
    // Geoapify free tier is 3,000 calls/day and each listing costs 7.
  }
  return { reuse, fresh };
}

// raws whose source is rentfaster and that don't already have a description on file.
export function planDetail(raws, existing) {
  return raws.filter((r) => r.source === "rentfaster" && !existing.get(r.id)?.description).map((r) => r.id);
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
  };
}

async function main() {
  const { values: opts } = parseArgs({
    options: {
      city: { type: "string" },
      limit: { type: "string", default: "200" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const city = opts.city;
  if (!SOURCES[city]) throw new Error(`--city must be one of: ${Object.keys(SOURCES).join(", ")}`);
  const limit = parseInt(opts.limit, 10);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("--limit must be a non-negative integer");
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
        .select("id, lat, lng, nearby, sqft, amenities, lease_term, photo, description")
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
  if (dry) {
    console.log(`[${city}] detail pages: ${detailIds.length} (would fetch)`);
    console.log(JSON.stringify(raws.slice(0, 3), null, 2));
    return;
  }

  const byId = new Map(raws.map((r) => [r.id, r]));
  const enriched = new Map(reuse);
  for (const id of fresh) {
    const r = byId.get(id);
    try {
      enriched.set(id, await fetchNearby(r.lat, r.lng, { apiKey: process.env.GEOAPIFY_API_KEY }));
    } catch (err) {
      console.warn(`[${city}] geoapify failed for ${id}: ${err.message}`);
    }
  }

  const details = new Map();
  for (let i = 0; i < detailIds.length; i++) {
    const id = detailIds[i];
    details.set(id, await fetchRentfasterDetail(byId.get(id).url));
    if ((i + 1) % 100 === 0) console.log(`[${city}] detail pages: ${i + 1}/${detailIds.length}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`[${city}] detail pages: ${detailIds.length}`);

  const rows = raws.map((r) => mergeDetail(toRow(r, city, enriched.get(r.id) ?? existing.get(r.id)?.nearby ?? {}), details.get(r.id), existing.get(r.id)));
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from("listings").upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
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
