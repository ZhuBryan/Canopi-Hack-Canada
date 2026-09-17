# Multi-city Listings DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move listings from JSON-in-git to a Supabase `listings` table fed by a scheduled sync script (RentFaster for Toronto, RentCast for SF), make city a runtime parameter in the app, and redeploy.

**Architecture:** One Node script (`scripts/sync-listings.mjs`) pulls a city's listings from a source adapter, enriches new rows with Geoapify amenity counts (reusing `nearby` from neighbours in the same ~100 m cell), and upserts into Supabase. The app reads rows through one shared server module (`src/lib/listings-db.ts`) that all three API routes use, replacing three duplicated fs-read transforms. City config lives in `src/lib/cities.ts`; a `CityProvider` holds the selected city client-side.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (`@supabase/supabase-js` already installed), Node 24 (`node:test`, native `fetch`, type-stripping), GitHub Actions, RentFaster `api/map.json`, RentCast API, Geoapify Places, Mapbox GL + Static Images.

**Spec:** `docs/superpowers/specs/2026-09-17-multi-city-listings-db-design.md`

## Global Constraints

- No new npm dependencies.
- Node ≥ 24 (tests run with `node --test`; `.ts` test files rely on built-in type stripping).
- Pipeline writes only with `SUPABASE_SERVICE_ROLE_KEY`; the app reads with the anon key under RLS `select using (active)`.
- Geoapify budget: default `--limit 400` new-listing enrichments per run; 250 ms between calls; one retry on 429.
- Listing ids: `rf-<rentfaster id>` and `rc-<rentcast id>`.
- `nearby` jsonb shape: `{ [bucket]: { label, source, radius_meters, count, places: [{ name, address, distance_meters, categories }] } }` — identical to today's JSON so scoring code is unchanged.
- Commit after every task. Do not push (remote is a teammate's repo; user pushes).
- Windows dev machine: use Bash tool paths (`/c/Users/...`); npm scripts must work on both Windows and Linux CI.

---

## File map

| File | Responsibility |
|---|---|
| `supabase-schema.sql` (modify) | + `listings` table, index, RLS |
| `scripts/sources/rentfaster.mjs` (create) | fetch + normalize Toronto listings |
| `scripts/sources/rentcast.mjs` (create) | fetch + normalize SF listings |
| `scripts/geoapify.mjs` (create) | `fetchNearby(lat, lng)` → `nearby` object |
| `scripts/sync-listings.mjs` (create) | CLI; diff, enrich, upsert, deactivate |
| `scripts/sync-listings.test.mjs` (create) | normalizers + cell reuse |
| `src/lib/cities.ts` (create) | city config table |
| `src/lib/listing-score.ts` (create) | pure `rowToListing` + scoring helpers (moved from routes) |
| `src/lib/listing-score.test.ts` (create) | scoring test |
| `src/lib/listings-db.ts` (create) | `loadListings(city)` with cache |
| `src/lib/city-context.tsx` (create) | `CityProvider`, `useCity()` |
| `src/app/api/listings/route.ts` (rewrite) | `?city=` → `loadListings` |
| `src/app/api/suggestions/route.ts` (rewrite) | personal score over `Listing.nearbyServices` |
| `src/app/api/chat/route.ts` (modify) | listings + prompt from city |
| `src/components/avenuex/primitives.tsx` (modify) | city toggle in navbar |
| `src/components/avenuex/MapboxMap.tsx` (modify) | city-driven center/bounds/mask |
| `src/components/avenuex/ChatPanel.tsx`, `UserPriorityPanel.tsx`, `src/app/page.tsx`, `src/app/saved/page.tsx`, `src/app/layout.tsx` (modify) | pass city through |
| `.github/workflows/sync-listings.yml` (create) | weekly cron |
| `data/`, old `scripts/*.mjs`, `rentfaster_console_scraper.js`, `scraper/`, `README.md` | delete / rewrite |

---

### Task 1: `listings` table schema

**Files:**
- Modify: `supabase-schema.sql` (append)

**Interfaces:**
- Produces: table `public.listings` with columns used by Task 4 (`toRow`) and Task 7 (`rowToListing`).

- [ ] **Step 1: Append the table**

Append to the end of `supabase-schema.sql`:

```sql

-- ── Listings (written by scripts/sync-listings.mjs with the service-role key) ──
create table public.listings (
  id            text primary key,              -- 'rf-593209' | 'rc-<rentcast id>'
  city          text not null,                 -- 'toronto' | 'sf'
  source        text not null,                 -- 'rentfaster' | 'rentcast'
  url           text,
  address       text not null,
  full_address  text not null,
  lat           double precision not null,
  lng           double precision not null,
  monthly_rent  int not null,
  beds          int,
  baths         numeric,
  sqft          int,
  property_type text,
  photo         text,
  available     text,
  lease_term    text,
  amenities     text[] not null default '{}',
  nearby        jsonb not null default '{}',   -- Geoapify buckets; doubles as the enrichment cache
  active        boolean not null default true,
  seen_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index listings_city_active_idx on public.listings (city) where active;
alter table public.listings enable row level security;
create policy "public read active listings" on public.listings
  for select using (active);
```

- [ ] **Step 2: Commit**

```bash
git add supabase-schema.sql
git commit -m "Add listings table to Supabase schema"
```

The user runs the full file in Supabase SQL Editor when the new project exists (Roadmap step 1). Nothing else in this plan blocks on it until Task 4 Step 8.

---

### Task 2: RentFaster source adapter

**Files:**
- Create: `scripts/sources/rentfaster.mjs`
- Create: `scripts/sync-listings.test.mjs`
- Modify: `package.json` (add `"test"` script)

**Interfaces:**
- Produces: `normalizeRentfaster(record) → RawListing | null` and `fetchRentfaster() → Promise<RawListing[]>` where

```ts
type RawListing = {
  id: string;            // 'rf-593209'
  source: 'rentfaster' | 'rentcast';
  url: string | null;
  address: string;
  fullAddress: string;
  lat: number; lng: number;
  monthlyRent: number;
  beds: number | null; baths: number | null; sqft: number | null;
  propertyType: string | null;
  photo: string | null;
  available: string | null;
  leaseTerm: string | null;
  amenities: string[];
}
```

- [ ] **Step 1: Add the test script and write the failing test**

In `package.json` `"scripts"` add:

```json
"test": "node --test scripts/*.test.mjs src/lib/*.test.ts"
```

Create `scripts/sync-listings.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRentfaster } from "./sources/rentfaster.mjs";

const RF_RECORD = {
  id: 593209,
  city: "Toronto",
  availability: "Immediate",
  latitude: 43.6532,
  longitude: -79.3832,
  link: "/properties/10-bergamot-ave-toronto-593209",
  thumb2: "https://rf-images-prod-bcdn.rentfaster.ca/593209/thumber_1.jpg",
  type: "Apartment",
  price: "2160",
  title: "Ask Us About Free Early Move In!",
  intro: "10 Bergamot Ave",
  beds: "1",
  baths: "1.5",
};

test("normalizeRentfaster maps a map.json record to a RawListing", () => {
  const row = normalizeRentfaster(RF_RECORD);
  assert.deepEqual(row, {
    id: "rf-593209",
    source: "rentfaster",
    url: "https://www.rentfaster.ca/properties/10-bergamot-ave-toronto-593209",
    address: "10 Bergamot Ave",
    fullAddress: "10 Bergamot Ave, Toronto",
    lat: 43.6532,
    lng: -79.3832,
    monthlyRent: 2160,
    beds: 1,
    baths: 1.5,
    sqft: null,
    propertyType: "Apartment",
    photo: "https://rf-images-prod-bcdn.rentfaster.ca/593209/thumber_1.jpg",
    available: "Immediate",
    leaseTerm: null,
    amenities: [],
  });
});

test("normalizeRentfaster treats Studio as 0 beds and drops non-Toronto / unpriced rows", () => {
  assert.equal(normalizeRentfaster({ ...RF_RECORD, beds: "Studio" }).beds, 0);
  assert.equal(normalizeRentfaster({ ...RF_RECORD, city: "Calgary" }), null);
  assert.equal(normalizeRentfaster({ ...RF_RECORD, price: "" }), null);
  assert.equal(normalizeRentfaster({ ...RF_RECORD, latitude: null }), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './sources/rentfaster.mjs'`

- [ ] **Step 3: Implement the adapter**

Create `scripts/sources/rentfaster.mjs`:

```js
// Toronto listings from RentFaster's public map endpoint (verified 2026-09-17:
// plain HTTPS, 500 per page, no auth). city_id=7 is Toronto.
const BASE = "https://www.rentfaster.ca";
const CITY_ID = 7;
const PAGE_SIZE = 500;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36";

function toInt(v) {
  if (v == null) return null;
  if (/studio/i.test(String(v))) return 0;
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toFloat(v) {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizeRentfaster(r) {
  if (r.city !== "Toronto") return null; // pages bleed a few Calgary rows
  const lat = toFloat(r.latitude);
  const lng = toFloat(r.longitude);
  const monthlyRent = toInt(r.price);
  if (lat == null || lng == null || !monthlyRent) return null;
  const address = (r.intro ?? r.title ?? "").trim() || "Unknown address";
  return {
    id: `rf-${r.id}`,
    source: "rentfaster",
    url: r.link ? `${BASE}${r.link}` : null,
    address,
    fullAddress: `${address}, Toronto`,
    lat,
    lng,
    monthlyRent,
    beds: toInt(r.beds),
    baths: toFloat(r.baths),
    sqft: null,
    propertyType: r.type ?? null,
    photo: r.thumb2 ?? null,
    available: r.availability ?? null,
    leaseTerm: null,
    amenities: [],
  };
}

export async function fetchRentfaster() {
  const out = [];
  for (let page = 0; ; page++) {
    const res = await fetch(`${BASE}/api/map.json?city_id=${CITY_ID}&cur_page=${page}`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`rentfaster page ${page}: HTTP ${res.status}`);
    const { listings = [] } = await res.json();
    for (const r of listings) {
      const row = normalizeRentfaster(r);
      if (row) out.push(row);
    }
    if (listings.length < PAGE_SIZE) break;
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: 2 passing.

- [ ] **Step 5: Smoke the live endpoint**

Run: `node -e "import('./scripts/sources/rentfaster.mjs').then(async m=>{const r=await m.fetchRentfaster();console.log(r.length, r[0])})"`
Expected: ~3,000+ rows; first row has `id` starting `rf-`, numeric `lat`/`lng`, `monthlyRent > 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/sources/rentfaster.mjs scripts/sync-listings.test.mjs
git commit -m "Add RentFaster source adapter for Toronto listings"
```

---

### Task 3: Geoapify enrichment module

**Files:**
- Create: `scripts/geoapify.mjs`

**Interfaces:**
- Produces: `fetchNearby(lat, lng, { apiKey, fetchImpl = fetch }) → Promise<Nearby>` where `Nearby` matches the Global Constraints `nearby` shape. Exported `BUCKETS` array.

- [ ] **Step 1: Write the failing test**

Append to `scripts/sync-listings.test.mjs`:

```js
import { fetchNearby, BUCKETS } from "./geoapify.mjs";

test("fetchNearby builds one bucket per category from Geoapify features", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          { properties: { name: "Cafe A", formatted: "1 Main St", distance: 120, categories: ["catering.cafe"] } },
        ],
      }),
    };
  };
  const nearby = await fetchNearby(43.65, -79.38, { apiKey: "k", fetchImpl, delayMs: 0 });
  assert.equal(calls.length, BUCKETS.length);
  assert.match(calls[0], /filter=circle:-79\.38,43\.65,500/); // schools radius 500
  assert.equal(nearby.cafes.count, 1);
  assert.deepEqual(nearby.cafes.places[0], {
    name: "Cafe A", address: "1 Main St", distance_meters: 120, categories: ["catering.cafe"],
  });
  assert.equal(nearby.cafes.radius_meters, 1000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './geoapify.mjs'`

- [ ] **Step 3: Implement**

Create `scripts/geoapify.mjs`:

```js
// Same buckets/radii as the old data/livability-sources.json + clean-combined-listings.mjs.
export const BUCKETS = [
  { id: "schools", label: "Schools", categories: "education.school", radius: 500 },
  { id: "groceries", label: "Groceries", categories: "commercial.supermarket", radius: 1000 },
  { id: "restaurants", label: "Restaurants", categories: "catering.restaurant", radius: 1000 },
  { id: "cafes", label: "Cafes", categories: "catering.cafe", radius: 1000 },
  { id: "parks", label: "Parks", categories: "leisure.park", radius: 1000 },
  { id: "pharmacies", label: "Pharmacies", categories: "healthcare.pharmacy", radius: 1000 },
  { id: "transit", label: "Transit", categories: "public_transport", radius: 1000 },
];
const LIMIT = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, fetchImpl) {
  let res = await fetchImpl(url);
  if (res.status === 429) {
    await sleep(2000);
    res = await fetchImpl(url);
  }
  if (!res.ok) throw new Error(`geoapify HTTP ${res.status}`);
  return res.json();
}

export async function fetchNearby(lat, lng, { apiKey, fetchImpl = fetch, delayMs = 250 }) {
  const nearby = {};
  for (const b of BUCKETS) {
    const url =
      `https://api.geoapify.com/v2/places?categories=${b.categories}` +
      `&filter=circle:${lng},${lat},${b.radius}&bias=proximity:${lng},${lat}` +
      `&limit=${LIMIT}&apiKey=${apiKey}`;
    const data = await getJson(url, fetchImpl);
    const places = (data.features ?? []).map((f) => ({
      name: f.properties?.name ?? "Unnamed",
      address: f.properties?.formatted ?? null,
      distance_meters: Number.isFinite(f.properties?.distance) ? f.properties.distance : null,
      categories: f.properties?.categories ?? [],
    }));
    nearby[b.id] = { label: b.label, source: "geoapify", radius_meters: b.radius, count: places.length, places };
    if (delayMs) await sleep(delayMs);
  }
  return nearby;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/geoapify.mjs scripts/sync-listings.test.mjs
git commit -m "Add Geoapify nearby-amenities fetcher for the sync pipeline"
```

---

### Task 4: `sync-listings.mjs` — diff, enrich, upsert, deactivate

**Files:**
- Create: `scripts/sync-listings.mjs`
- Modify: `scripts/sync-listings.test.mjs`
- Modify: `package.json` (add `"sync"` script)

**Interfaces:**
- Consumes: `fetchRentfaster` (Task 2), `fetchNearby` (Task 3), `fetchRentcast` (Task 5 — imported lazily so Task 4 runs before Task 5 exists).
- Produces: exported pure helpers `cellKey(lat, lng) → string`, `toRow(raw, city, nearby) → DbRow`, `planEnrichment(raws, existing, limit) → { reuse: Map<id, nearby>, fresh: string[] }`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/sync-listings.test.mjs`:

```js
import { cellKey, toRow, planEnrichment } from "./sync-listings.mjs";

const RAW = {
  id: "rf-1", source: "rentfaster", url: "https://x/1", address: "1 A St", fullAddress: "1 A St, Toronto",
  lat: 43.65321, lng: -79.38329, monthlyRent: 2000, beds: 1, baths: 1, sqft: null,
  propertyType: "Apartment", photo: null, available: "Immediate", leaseTerm: null, amenities: [],
};

test("cellKey rounds to ~100 m", () => {
  assert.equal(cellKey(43.65321, -79.38329), "43.653|-79.383");
  assert.equal(cellKey(43.65349, -79.38251), "43.653|-79.383");
});

test("toRow maps RawListing to a listings row", () => {
  const row = toRow(RAW, "toronto", { cafes: { count: 2 } });
  assert.equal(row.id, "rf-1");
  assert.equal(row.city, "toronto");
  assert.equal(row.full_address, "1 A St, Toronto");
  assert.equal(row.monthly_rent, 2000);
  assert.deepEqual(row.nearby, { cafes: { count: 2 } });
  assert.equal(row.active, true);
  assert.equal(typeof row.seen_at, "string");
});

test("planEnrichment reuses a neighbour's nearby and caps fresh fetches", () => {
  const existing = new Map([["rf-old", { lat: 43.65340, lng: -79.38300, nearby: { cafes: { count: 9 } } }]]);
  const raws = [
    RAW,                                              // same cell as rf-old → reuse
    { ...RAW, id: "rf-2", lat: 43.70, lng: -79.40 },  // new cell → fresh
    { ...RAW, id: "rf-3", lat: 43.71, lng: -79.41 },  // new cell → over limit
    { ...RAW, id: "rf-old" },                          // already in DB → skip
  ];
  const plan = planEnrichment(raws, existing, 1);
  assert.deepEqual(plan.reuse.get("rf-1"), { cafes: { count: 9 } });
  assert.deepEqual(plan.fresh, ["rf-2"]);
  assert.equal(plan.reuse.has("rf-old"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './sync-listings.mjs'`

- [ ] **Step 3: Implement**

Create `scripts/sync-listings.mjs`:

```js
#!/usr/bin/env node
// Sync one city's rental listings into Supabase.
//   node scripts/sync-listings.mjs --city toronto|sf [--limit 400] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEOAPIFY_API_KEY, RENTCAST_API_KEY (sf only)
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { fetchNearby } from "./geoapify.mjs";

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
    if (existing.has(r.id)) continue;
    const cached = byCell.get(cellKey(r.lat, r.lng));
    if (cached) reuse.set(r.id, cached);
    else if (fresh.length < limit) fresh.push(r.id);
    // ponytail: rows past `limit` are inserted with nearby={} and enriched on a later run —
    // Geoapify free tier is 3,000 calls/day and each listing costs 7.
  }
  return { reuse, fresh };
}

async function main() {
  const { values: opts } = parseArgs({
    options: {
      city: { type: "string" },
      limit: { type: "string", default: "400" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const city = opts.city;
  if (!SOURCES[city]) throw new Error(`--city must be one of: ${Object.keys(SOURCES).join(", ")}`);
  const limit = parseInt(opts.limit, 10);
  const dry = opts["dry-run"];

  const raws = (await SOURCES[city]()).filter((r) => r.monthlyRent >= MIN_RENT);
  console.log(`[${city}] fetched ${raws.length} listings`);
  if (raws.length === 0) throw new Error("source returned nothing; aborting before any writes");

  const supabase = dry ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const existing = new Map();
  if (supabase) {
    const { data, error } = await supabase.from("listings").select("id, lat, lng, nearby").eq("city", city);
    if (error) throw error;
    for (const r of data) existing.set(r.id, r);
  }

  const { reuse, fresh } = planEnrichment(raws, existing, limit);
  console.log(`[${city}] new: ${raws.length - [...raws].filter((r) => existing.has(r.id)).length}, reuse cell cache: ${reuse.size}, geoapify: ${fresh.length}`);
  if (dry) {
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

  const rows = raws.map((r) => toRow(r, city, enriched.get(r.id) ?? existing.get(r.id)?.nearby ?? {}));
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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

Add to `package.json` scripts: `"sync": "node scripts/sync-listings.mjs"`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 6 passing.

- [ ] **Step 5: Dry-run Toronto against the live source**

Run: `npm run sync -- --city toronto --dry-run`
Expected: `[toronto] fetched 3xxx listings`, then `new: 3xxx, reuse cell cache: 0, geoapify: 400`, then three sample rows. No env vars needed.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/sync-listings.mjs scripts/sync-listings.test.mjs
git commit -m "Add sync-listings script: diff, Geoapify enrich, upsert into Supabase"
```

- [ ] **Step 7: (When Supabase + Geoapify keys exist) real Toronto sync**

Create `.env.sync` (git-ignored by the existing `.env*` rule):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
GEOAPIFY_API_KEY=...
RENTCAST_API_KEY=...
```

Run: `node --env-file=.env.sync scripts/sync-listings.mjs --city toronto`
Expected: `[toronto] upserted 3xxx, deactivated 0`. Takes ~12 min (400 × 7 calls × 250 ms). Re-run daily until `geoapify: 0` if you want every listing enriched.

---

### Task 5: RentCast source adapter (SF)

**Files:**
- Create: `scripts/sources/rentcast.mjs`
- Modify: `scripts/sync-listings.test.mjs`

**Interfaces:**
- Produces: `normalizeRentcast(record) → RawListing | null`, `fetchRentcast({ apiKey, fetchImpl = fetch }) → Promise<RawListing[]>`. Photo is `null` (the app builds a Mapbox static image in Task 7).

- [ ] **Step 1: Write the failing test**

Append to `scripts/sync-listings.test.mjs`:

```js
import { normalizeRentcast } from "./sources/rentcast.mjs";

test("normalizeRentcast maps a RentCast rental listing to a RawListing", () => {
  const row = normalizeRentcast({
    id: "123-Main-St,-San-Francisco,-CA-94105",
    formattedAddress: "123 Main St, San Francisco, CA 94105",
    addressLine1: "123 Main St",
    latitude: 37.7912,
    longitude: -122.3934,
    propertyType: "Condo",
    bedrooms: 2,
    bathrooms: 1.5,
    squareFootage: 900,
    price: 4200,
    status: "Active",
    listedDate: "2026-09-01T00:00:00.000Z",
  });
  assert.deepEqual(row, {
    id: "rc-123-Main-St,-San-Francisco,-CA-94105",
    source: "rentcast",
    url: "https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20San%20Francisco%2C%20CA%2094105",
    address: "123 Main St",
    fullAddress: "123 Main St, San Francisco, CA 94105",
    lat: 37.7912,
    lng: -122.3934,
    monthlyRent: 4200,
    beds: 2,
    baths: 1.5,
    sqft: 900,
    propertyType: "Condo",
    photo: null,
    available: "Available now",
    leaseTerm: null,
    amenities: [],
  });
  assert.equal(normalizeRentcast({ formattedAddress: "x", latitude: 1, longitude: 2, price: 0 }), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './sources/rentcast.mjs'`

- [ ] **Step 3: Implement**

Create `scripts/sources/rentcast.mjs`:

```js
// San Francisco listings from RentCast (https://developers.rentcast.io). One call per run.
const ENDPOINT = "https://api.rentcast.io/v1/listings/rental";

export function normalizeRentcast(r) {
  const lat = Number(r.latitude);
  const lng = Number(r.longitude);
  const monthlyRent = Math.round(Number(r.price));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !monthlyRent) return null;
  const fullAddress = r.formattedAddress ?? "";
  return {
    id: `rc-${r.id ?? fullAddress}`,
    source: "rentcast",
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`,
    address: r.addressLine1 ?? fullAddress.split(",")[0] ?? "Unknown address",
    fullAddress,
    lat,
    lng,
    monthlyRent,
    beds: Number.isFinite(r.bedrooms) ? r.bedrooms : null,
    baths: Number.isFinite(r.bathrooms) ? r.bathrooms : null,
    sqft: Number.isFinite(r.squareFootage) ? r.squareFootage : null,
    propertyType: r.propertyType ?? null,
    photo: null, // RentCast has no photos; the app falls back to a Mapbox static image
    available: "Available now",
    leaseTerm: null,
    amenities: [],
  };
}

export async function fetchRentcast({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("RENTCAST_API_KEY is required for --city sf");
  const url = `${ENDPOINT}?city=San%20Francisco&state=CA&status=Active&limit=500`;
  const res = await fetchImpl(url, { headers: { accept: "application/json", "X-Api-Key": apiKey } });
  if (!res.ok) throw new Error(`rentcast HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.map(normalizeRentcast).filter(Boolean);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/rentcast.mjs scripts/sync-listings.test.mjs
git commit -m "Add RentCast source adapter for San Francisco listings"
```

- [ ] **Step 6: (When RentCast key exists) dry-run then real SF sync**

Run: `node --env-file=.env.sync scripts/sync-listings.mjs --city sf --dry-run`
Expected: `[sf] fetched N listings` (N ≤ 500). If the field names in the sample differ from the fixture (RentCast may rename), adjust `normalizeRentcast` and the fixture together.

Run: `node --env-file=.env.sync scripts/sync-listings.mjs --city sf`
Expected: `[sf] upserted N, deactivated 0`.

---

### Task 6: City config

**Files:**
- Create: `src/lib/cities.ts`

**Interfaces:**
- Produces:

```ts
export type CitySlug = "toronto" | "sf";
export type CityConfig = {
  slug: CitySlug; label: string; region: string; country: "CA" | "US";
  center: [number, number]; // [lng, lat]
  zoom: number; maskRadiusKm: number;
  promptBlurb: string; landmarks: string;
};
export const CITIES: Record<CitySlug, CityConfig>;
export const DEFAULT_CITY: CitySlug = "toronto";
export function isCitySlug(v: unknown): v is CitySlug;
```

- [ ] **Step 1: Create the file**

```ts
export type CitySlug = "toronto" | "sf";

export type CityConfig = {
  slug: CitySlug;
  label: string;
  region: string;
  country: "CA" | "US";
  center: [number, number]; // [lng, lat]
  zoom: number;
  maskRadiusKm: number;
  promptBlurb: string;
  landmarks: string;
};

export const CITIES: Record<CitySlug, CityConfig> = {
  toronto: {
    slug: "toronto",
    label: "Toronto",
    region: "ON",
    country: "CA",
    center: [-79.3832, 43.6532],
    zoom: 14,
    maskRadiusKm: 25,
    promptBlurb: "a Toronto rental platform",
    landmarks:
      "CN Tower (43.643, -79.387), Union Station (43.645, -79.381), U of T (43.663, -79.396), King & Spadina (43.644, -79.396)",
  },
  sf: {
    slug: "sf",
    label: "San Francisco",
    region: "CA",
    country: "US",
    center: [-122.4194, 37.7749],
    zoom: 13,
    maskRadiusKm: 12,
    promptBlurb: "a San Francisco rental platform",
    landmarks:
      "Ferry Building (37.795, -122.393), Dolores Park (37.760, -122.427), Golden Gate Park (37.769, -122.486), Salesforce Tower (37.790, -122.397)",
  },
};

export const DEFAULT_CITY: CitySlug = "toronto";

export function isCitySlug(v: unknown): v is CitySlug {
  return typeof v === "string" && v in CITIES;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cities.ts
git commit -m "Add city config for Toronto and San Francisco"
```

---

### Task 7: `listing-score.ts` + `listings-db.ts` + `/api/listings` from Supabase

**Files:**
- Create: `src/lib/listing-score.ts`
- Create: `src/lib/listing-score.test.ts`
- Create: `src/lib/listings-db.ts`
- Rewrite: `src/app/api/listings/route.ts`

**Interfaces:**
- Consumes: `CITIES`, `CitySlug`, `isCitySlug` (Task 6); `Listing` from `@/lib/avenuex-data`.
- Produces:
  - `listing-score.ts`: `type DbRow`, `rowToListing(row: DbRow, city: CityConfig, mapboxToken: string): Listing`, `BUCKET_KEYS`, `BUCKET_CAPS`, `countWithinRadius`.
  - `listings-db.ts`: `loadListings(city: CitySlug | "all"): Promise<Listing[]>` (sorted by score desc, cached 10 min per city).

- [ ] **Step 1: Write the failing test**

Create `src/lib/listing-score.test.ts` (relative imports only — `@/` aliases don't resolve under plain `node --test`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToListing } from "./listing-score.ts";
import { CITIES } from "./cities.ts";

const ROW = {
  id: "rf-1", city: "toronto", source: "rentfaster", url: "https://x/1",
  address: "1 A St", full_address: "1 A St, Toronto", lat: 43.65, lng: -79.38,
  monthly_rent: 2000, beds: 1, baths: 1.5, sqft: null, property_type: "Townhouse",
  photo: null, available: "Immediate", lease_term: null, amenities: ["Parking"],
  nearby: {
    cafes: { count: 10, places: Array.from({ length: 10 }, (_, i) => ({ distance_meters: i * 90 })) },
    restaurants: { count: 15, places: Array.from({ length: 15 }, () => ({ distance_meters: 100 })) },
    transit: { count: 3, places: [{ distance_meters: 50 }, { distance_meters: 1500 }, { distance_meters: null }] },
  },
};

test("rowToListing scores buckets, maps fields, and falls back to a Mapbox static image", () => {
  const l = rowToListing(ROW as never, CITIES.toronto, "tok");
  assert.equal(l.id, "rf-1");
  assert.equal(l.city, "Toronto, ON");
  assert.equal(l.priceLabel, "$2,000/mo");
  assert.equal(l.shortPrice, "$2.0K");
  assert.equal(l.propertyType, "House");
  assert.equal(l.beds, 1);
  assert.equal(l.baths, 1.5);
  assert.equal(l.sqft, 0);
  assert.equal(l.nearbyServices?.cafes, 10);
  assert.equal(l.nearbyServices?.transit, 1); // only distances <= 1000 count
  assert.equal(l.categoryScores.foodDrink, 100);
  assert.equal(l.categoryScores.education, 0);
  assert.match(l.image, /^https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\/streets-v12\/static\/.*access_token=tok$/);
  assert.equal(l.incomeNeeded, 80000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../listing-score.ts'`

- [ ] **Step 3: Implement `listing-score.ts`**

Move the helpers from `src/app/api/listings/route.ts` (lines 60–200 today) into this file, keyed on the DB row instead of `RawListing`:

```ts
import type { Listing, ScoreBand } from "./avenuex-data";
import type { CityConfig } from "./cities";

export type NearbyBucket = {
  label?: string;
  source?: string;
  radius_meters?: number;
  count?: number;
  places?: { name?: string; address?: string | null; distance_meters: number | null; categories?: string[] }[];
};

export type DbRow = {
  id: string;
  city: string;
  source: string;
  url: string | null;
  address: string;
  full_address: string;
  lat: number;
  lng: number;
  monthly_rent: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  property_type: string | null;
  photo: string | null;
  available: string | null;
  lease_term: string | null;
  amenities: string[];
  nearby: Partial<Record<BucketKey, NearbyBucket>>;
};

export const BUCKET_CAPS = {
  schools: 5,
  groceries: 5,
  restaurants: 15,
  cafes: 10,
  parks: 5,
  pharmacies: 5,
  transit: 10,
} as const;
export type BucketKey = keyof typeof BUCKET_CAPS;
export const BUCKET_KEYS = Object.keys(BUCKET_CAPS) as BucketKey[];

const EFFECTIVE_RADIUS_METERS = 1000;

export function countWithinRadius(bucket: NearbyBucket | undefined): number {
  if (!bucket) return 0;
  if (Array.isArray(bucket.places) && bucket.places.length > 0) {
    return bucket.places.filter(
      (p) => Number.isFinite(p.distance_meters) && (p.distance_meters ?? Infinity) <= EFFECTIVE_RADIUS_METERS,
    ).length;
  }
  return bucket.count ?? 0;
}

export function bucketScore(key: BucketKey, count: number): number {
  const cap = BUCKET_CAPS[key];
  return Math.round((Math.min(count, cap) / cap) * 100);
}

function deriveBand(score: number): ScoreBand {
  if (score >= 70) return "great";
  if (score >= 45) return "medium";
  return "warning";
}

function deriveStatus(band: ScoreBand): string {
  if (band === "great") return "Great neighborhood access";
  if (band === "medium") return "Moderate neighborhood access";
  return "Limited neighborhood access";
}

function formatShortPrice(rent: number): string {
  return rent >= 1000 ? `$${(rent / 1000).toFixed(1)}K` : `$${rent}`;
}

function mapPropertyType(raw: string | null | undefined): Listing["propertyType"] {
  const n = (raw ?? "").toLowerCase();
  if (n.includes("condo")) return "Condo";
  if (n.includes("house") || n.includes("town") || n.includes("family")) return "House";
  return "Apartment";
}

function staticMapImage(lat: number, lng: number, token: string): string {
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+d97706(${lng},${lat})/${lng},${lat},15,0/600x400@2x?access_token=${token}`;
}

export function rowToListing(row: DbRow, city: CityConfig, mapboxToken: string): Listing {
  const nearby = row.nearby ?? {};
  const counts = Object.fromEntries(BUCKET_KEYS.map((k) => [k, countWithinRadius(nearby[k])])) as Record<BucketKey, number>;

  const foodDrink = Math.round((bucketScore("restaurants", counts.restaurants) + bucketScore("cafes", counts.cafes)) / 2);
  const health = bucketScore("pharmacies", counts.pharmacies);
  const groceryParks = Math.round((bucketScore("groceries", counts.groceries) + bucketScore("parks", counts.parks)) / 2);
  const education = bucketScore("schools", counts.schools);
  const emergency = Math.round(health * 0.6 + bucketScore("transit", counts.transit) * 0.4);
  const score = Math.round((foodDrink + health + groceryParks + education + emergency) / 5);
  const scoreBand = deriveBand(score);
  const monthlyRent = row.monthly_rent;

  return {
    id: row.id,
    url: row.url ?? undefined,
    address: row.address,
    city: `${city.label}, ${city.region}`,
    fullAddress: row.full_address,
    monthlyRent,
    priceLabel: `$${monthlyRent.toLocaleString("en-US")}/mo`,
    shortPrice: formatShortPrice(monthlyRent),
    beds: row.beds ?? 1,
    baths: row.baths ?? 1,
    sqft: row.sqft ?? 0,
    propertyType: mapPropertyType(row.property_type),
    score,
    scoreStatus: deriveStatus(scoreBand),
    scoreBand,
    image: row.photo ?? staticMapImage(row.lat, row.lng, mapboxToken),
    pinX: "50%",
    pinY: "50%",
    lat: row.lat,
    lng: row.lng,
    availableDate: row.available ?? "Available now",
    leaseTerm: row.lease_term ?? "12 months",
    about: row.address,
    amenities: row.amenities ?? [],
    nearbyServices: counts,
    categoryScores: { foodDrink, health, groceryParks, education, emergency },
    bathsLabel: row.baths != null ? `${row.baths} ba` : undefined,
    incomeNeeded: Math.round(((monthlyRent / 0.3) * 12) / 1000) * 1000,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: 8 passing.

- [ ] **Step 5: Implement `listings-db.ts`**

```ts
import { supabase } from "@/lib/supabase";
import { CITIES, type CitySlug } from "@/lib/cities";
import { rowToListing, type DbRow } from "@/lib/listing-score";
import type { Listing } from "@/lib/avenuex-data";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<CitySlug, { at: number; listings: Listing[] }>();

async function loadCity(slug: CitySlug): Promise<Listing[]> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.listings;
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.from("listings").select("*").eq("city", slug).eq("active", true);
  if (error) throw error;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const listings = (data as DbRow[]).map((row) => rowToListing(row, CITIES[slug], token)).sort((a, b) => b.score - a.score);
  cache.set(slug, { at: Date.now(), listings });
  return listings;
}

export async function loadListings(city: CitySlug | "all"): Promise<Listing[]> {
  if (city === "all") {
    const all = await Promise.all((Object.keys(CITIES) as CitySlug[]).map(loadCity));
    return all.flat();
  }
  return loadCity(city);
}
```

- [ ] **Step 6: Rewrite `/api/listings`**

Replace the whole of `src/app/api/listings/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { DEFAULT_CITY, isCitySlug } from "@/lib/cities";
import { loadListings } from "@/lib/listings-db";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("city");
  const city = raw === "all" ? "all" : isCitySlug(raw) ? raw : DEFAULT_CITY;
  try {
    return NextResponse.json(await loadListings(city));
  } catch (error) {
    console.error("Failed to load listings:", error);
    return NextResponse.json({ error: "Failed to load listings" }, { status: 500 });
  }
}
```

- [ ] **Step 7: Type-check and smoke**

Run: `npx tsc --noEmit`
Expected: no errors.

If Task 4 Step 7 has been done (rows exist): `npm run dev`, then `curl -s "http://localhost:3000/api/listings?city=toronto" | head -c 600`
Expected: JSON array; first object has `"id":"rf-…"`, `"city":"Toronto, ON"`, numeric `score`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/listing-score.ts src/lib/listing-score.test.ts src/lib/listings-db.ts src/app/api/listings/route.ts
git commit -m "Serve /api/listings from Supabase via shared listings-db module"
```

---

### Task 8: `/api/suggestions` over shared listings

**Files:**
- Rewrite: `src/app/api/suggestions/route.ts`

**Interfaces:**
- Consumes: `loadListings` (Task 7), `BUCKET_KEYS`, `BUCKET_CAPS`, `BucketKey` (Task 7), `isCitySlug`, `DEFAULT_CITY` (Task 6).
- Produces: same JSON as before — `Listing & { personalScore, matchReason }[]` sorted by `personalScore` desc; new optional `?city=` param.

- [ ] **Step 1: Rewrite the route**

Replace the whole file with:

```ts
import { NextResponse } from "next/server";
import { DEFAULT_CITY, isCitySlug } from "@/lib/cities";
import { loadListings } from "@/lib/listings-db";
import { BUCKET_CAPS, BUCKET_KEYS, type BucketKey } from "@/lib/listing-score";
import type { Listing } from "@/lib/avenuex-data";

type Weights = Record<BucketKey, number>;

const BUCKET_LABELS: Record<BucketKey, string> = {
  schools: "Schools",
  groceries: "Groceries",
  restaurants: "Restaurants",
  cafes: "Cafes",
  parks: "Parks",
  pharmacies: "Pharmacies",
  transit: "Transit",
};

function parseWeight(raw: string | null): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 5;
}

function normalized(listing: Listing, key: BucketKey): number {
  const count = listing.nearbyServices?.[key] ?? 0;
  return Math.min(count, BUCKET_CAPS[key]) / BUCKET_CAPS[key];
}

function computePersonalScore(listing: Listing, weights: Weights): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of BUCKET_KEYS) {
    const w = weights[key];
    if (w <= 0) continue;
    weightedSum += w * normalized(listing, key);
    totalWeight += w;
  }
  return totalWeight === 0 ? 0 : Math.round((weightedSum / totalWeight) * 100);
}

function buildMatchReason(listing: Listing, weights: Weights): string {
  const top = BUCKET_KEYS.map((key) => ({ key, contribution: weights[key] * normalized(listing, key) }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .filter((s) => s.contribution > 0);
  if (top.length === 0) return "Limited data for your priorities";
  return `Strong ${top.map((s) => BUCKET_LABELS[s.key].toLowerCase()).join(" and ")} access`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cityParam = searchParams.get("city");
    const city = isCitySlug(cityParam) ? cityParam : DEFAULT_CITY;
    const maxRent = searchParams.has("maxRent") ? parseInt(searchParams.get("maxRent")!, 10) : Infinity;
    const weights = Object.fromEntries(BUCKET_KEYS.map((k) => [k, parseWeight(searchParams.get(`w_${k}`))])) as Weights;

    const results = (await loadListings(city))
      .filter((l) => (Number.isFinite(maxRent) ? l.monthlyRent <= maxRent : true))
      .map((l) => ({ ...l, personalScore: computePersonalScore(l, weights), matchReason: buildMatchReason(l, weights) }))
      .sort((a, b) => b.personalScore - a.personalScore);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to compute suggestions:", error);
    return NextResponse.json({ error: "Failed to compute suggestions" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/suggestions/route.ts
git commit -m "Compute suggestions from shared listings-db instead of JSON file"
```

---

### Task 9: `/api/chat` city-aware

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Interfaces:**
- Consumes: `loadListings`, `CITIES`, `isCitySlug`, `DEFAULT_CITY`, `BUCKET_KEYS`.
- Produces: request body gains optional `city: CitySlug`; response unchanged.

- [ ] **Step 1: Replace data loading and the Toronto literals**

1. Delete lines 2–3 (`readFile`, `path` imports) and the whole `RawListing` interface, `parsePrice`, `extractAddress`, `cachedRaw`, `loadRaw` block (currently lines ~16–56). Add imports:

```ts
import { loadListings } from "@/lib/listings-db";
import { CITIES, DEFAULT_CITY, isCitySlug, type CitySlug } from "@/lib/cities";
import { BUCKET_KEYS } from "@/lib/listing-score";
```

2. Add `city?: CitySlug;` to `ChatRequest`.

3. Change `buildSystemPrompt(language: "en" | "fr" = "en")` to `buildSystemPrompt(language: "en" | "fr", city: CitySlug)` and replace its first lines with:

```ts
    const cfg = CITIES[city];
    const listings = await loadListings(city);
    const summaries = listings
        .map((l) => {
            const counts = BUCKET_KEYS.map((k) => l.nearbyServices?.[k] ?? 0).join(",");
            return `${l.id}|${l.address}|$${l.monthlyRent}|${l.lat.toFixed(3)},${l.lng.toFixed(3)}|${counts}`;
        })
        .join("\n");
```

4. In the prompt text, replace:
   - `"…AI assistant for a Toronto rental platform…"` → `` `…AI assistant for ${cfg.promptBlurb}…` `` (English), and `"…plateforme de location à Toronto…"` → `` `…plateforme de location à ${cfg.label}…` `` (French).
   - `who happens to know Toronto deeply` → `` who happens to know ${cfg.label} deeply ``
   - `${validListings.length} real Toronto rentals` → `${listings.length} real ${cfg.label} rentals`
   - `4. Toronto landmarks: CN Tower (…)…` → `` 4. ${cfg.label} landmarks: ${cfg.landmarks}. ``
   - `the rf-XXXXX IDs` → `the listing IDs (rf-… or rc-…)`

5. Every caller of `buildSystemPrompt(language)` (inside `geminiResponse`) passes `city` through: change `geminiResponse(messages, language)` signature to `geminiResponse(messages, language, city)` and in `POST` add:

```ts
        const city: CitySlug = isCitySlug(body.city) ? body.city : DEFAULT_CITY;
        const result = await geminiResponse(messages, language, city);
```

- [ ] **Step 2: Type-check and grep**

Run: `npx tsc --noEmit && grep -n "Toronto\|readFile\|rf-XXXXX" src/app/api/chat/route.ts`
Expected: tsc clean; grep returns nothing.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "Make chat prompt and listing context city-aware"
```

---

### Task 10: City context, navbar toggle, and client plumbing

**Files:**
- Create: `src/lib/city-context.tsx`
- Modify: `src/app/layout.tsx:39-43`
- Modify: `src/components/avenuex/primitives.tsx:66-133` (DesktopNavbar)
- Modify: `src/app/page.tsx:340-357` (fetch), `src/app/saved/page.tsx:63-70` (fetch)
- Modify: `src/components/avenuex/ChatPanel.tsx:205`, `src/components/avenuex/UserPriorityPanel.tsx:49`

**Interfaces:**
- Produces: `useCity(): { city: CitySlug; config: CityConfig; setCity(slug: CitySlug): void }`.

- [ ] **Step 1: Create the context**

`src/lib/city-context.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CITIES, DEFAULT_CITY, isCitySlug, type CityConfig, type CitySlug } from "@/lib/cities";

const STORAGE_KEY = "canopi-city";

type Ctx = { city: CitySlug; config: CityConfig; setCity: (slug: CitySlug) => void };
const CityContext = createContext<Ctx>({ city: DEFAULT_CITY, config: CITIES[DEFAULT_CITY], setCity: () => {} });

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState<CitySlug>(DEFAULT_CITY);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isCitySlug(saved)) setCityState(saved);
    } catch {}
  }, []);

  const setCity = (slug: CitySlug) => {
    setCityState(slug);
    try { window.localStorage.setItem(STORAGE_KEY, slug); } catch {}
  };

  return <CityContext.Provider value={{ city, config: CITIES[city], setCity }}>{children}</CityContext.Provider>;
}

export const useCity = () => useContext(CityContext);
```

- [ ] **Step 2: Mount the provider**

In `src/app/layout.tsx` add `import { CityProvider } from "@/lib/city-context";` and wrap:

```tsx
        <AvenueXProvider>
          <AuthProvider>
            <CityProvider>
              <SavedListingsProvider>{children}</SavedListingsProvider>
            </CityProvider>
          </AuthProvider>
        </AvenueXProvider>
```

- [ ] **Step 3: Add the toggle to `DesktopNavbar`**

In `src/components/avenuex/primitives.tsx`, add imports at the top:

```tsx
import { useCity } from "@/lib/city-context";
import { CITIES, type CitySlug } from "@/lib/cities";
```

Inside `DesktopNavbar`, after the existing `const router = useRouter();` line, add `const { city, setCity } = useCity();`. Then insert this block as the first child of the right-hand `<div className="flex items-center gap-4">` (before the Saved button):

```tsx
        <div className="flex rounded-full border p-0.5 text-xs" style={{ borderColor: "var(--line)" }} role="group" aria-label="City">
          {(Object.keys(CITIES) as CitySlug[]).map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => setCity(slug)}
              className="rounded-full px-3 py-1 transition"
              style={
                city === slug
                  ? { backgroundColor: "var(--brand)", color: "white" }
                  : { color: "var(--muted)" }
              }
            >
              {CITIES[slug].label}
            </button>
          ))}
        </div>
```

- [ ] **Step 4: Fetch by city in `page.tsx`**

In `src/app/page.tsx` add `import { useCity } from "@/lib/city-context";`, inside the component add `const { city } = useCity();`, and change the listings effect:

```tsx
  useEffect(() => {
    let cancelled = false;
    setLoadingListings(true);
    (async () => {
      try {
        const res = await fetch(`/api/listings?city=${city}`);
        if (!res.ok) throw new Error("Failed to fetch listings");
        const data: Listing[] = await res.json();
        if (!cancelled) { setListings(data); setSelectedId(null); }
      } catch (error) {
        console.error("Failed to load listings:", error);
      } finally {
        if (!cancelled) setLoadingListings(false);
      }
    })();
    return () => { cancelled = true; };
  }, [city]);
```

(If `setSelectedId` is named differently in that file, use the existing setter for the selected listing id.)

- [ ] **Step 5: Saved page fetches all cities**

In `src/app/saved/page.tsx` change `fetch("/api/listings")` → `fetch("/api/listings?city=all")`.

- [ ] **Step 6: Pass city to chat and suggestions**

`ChatPanel.tsx`: add `import { useCity } from "@/lib/city-context";`, inside the component `const { city } = useCity();`, and in the `/api/chat` fetch body add `city`:

```ts
body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })), language, city })
```

`UserPriorityPanel.tsx`: same import + hook; where `params` is built before line 49 add `params.set("city", city);`. Add `city` to that effect's dependency array.

- [ ] **Step 7: Type-check, build, click through**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

Run `npm run dev`; toggle Toronto ↔ San Francisco in the navbar. Expected: listing list reloads; toggle persists across reload.

- [ ] **Step 8: Commit**

```bash
git add src/lib/city-context.tsx src/app/layout.tsx src/components/avenuex/primitives.tsx src/app/page.tsx src/app/saved/page.tsx src/components/avenuex/ChatPanel.tsx src/components/avenuex/UserPriorityPanel.tsx
git commit -m "Add city selector and thread city through listings, chat, and suggestions"
```

---

### Task 11: Map follows the city

**Files:**
- Modify: `src/components/avenuex/MapboxMap.tsx:26-57` (mask constants), `:159-170` (map init), `:435-441` (mask source)

**Interfaces:**
- Consumes: `useCity()` (Task 10).

- [ ] **Step 1: Replace the hand-coded GTA ring with a generated circle**

Delete `GTA_MASK_CENTER`, `GTA_MASK_RADIUS_SCALE`, `GTA_MASK_INNER_RING`, and `scaleRing` (lines 26–57). Add:

```ts
import { useCity } from "@/lib/city-context";
import type { CityConfig } from "@/lib/cities";

// Approximate circle in lng/lat degrees; good enough for a viewport mask.
function circleRing(center: [number, number], radiusKm: number, steps = 48): [number, number][] {
  const [lng, lat] = center;
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI;
    return [lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)] as [number, number];
  });
}

function maskGeoJson(cfg: CityConfig): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]],
        circleRing(cfg.center, cfg.maskRadiusKm),
      ],
    },
  };
}

function maxBounds(cfg: CityConfig): [[number, number], [number, number]] {
  const ring = circleRing(cfg.center, cfg.maskRadiusKm * 1.2, 4);
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
```

- [ ] **Step 2: Use the city in map init and the mask**

Inside `MapboxMap`, add `const { config: cityConfig } = useCity();` and `const cityRef = useRef(cityConfig);`.

In the `new mapboxgl.Map({...})` call replace `center: [-79.3832, 43.6532]`, `zoom: 14`, and `maxBounds: [[-79.65, 43.55], [-79.10, 43.85]]` with:

```ts
      center: cityRef.current.center,
      zoom: cityRef.current.zoom,
      maxBounds: maxBounds(cityRef.current),
```

In the mask block replace the `data: { … }` object with `data: maskGeoJson(cityRef.current),`.

- [ ] **Step 3: React to city changes**

Add an effect after the map-init effect:

```ts
  useEffect(() => {
    cityRef.current = cityConfig;
    const map = mapRef.current;
    if (!map) return;
    map.setMaxBounds(null);
    map.jumpTo({ center: cityConfig.center, zoom: cityConfig.zoom });
    map.setMaxBounds(maxBounds(cityConfig));
    const src = map.getSource("gta-mask") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(maskGeoJson(cityConfig));
  }, [cityConfig]);
```

- [ ] **Step 4: Type-check and eyeball**

Run: `npx tsc --noEmit`
Expected: clean. `npm run dev`, toggle city: map jumps to SF, grey mask circle re-centres, pins for SF appear (once SF rows exist).

- [ ] **Step 5: Commit**

```bash
git add src/components/avenuex/MapboxMap.tsx
git commit -m "Centre map, bounds, and mask on the selected city"
```

---

### Task 12: Delete the old pipeline and data; rewrite README pipeline section

**Files:**
- Delete: `data/` (all), `scripts/build-combined-listings.mjs`, `scripts/build-detailed-from-merged.mjs`, `scripts/clean-combined-listings.mjs`, `scripts/enrich-rentfaster-listings-with-places.mjs`, `scripts/extract-listing-details-from-html.mjs`, `scripts/geocode-rentfaster-listings.mjs`, `scripts/merge-rentfaster-listings.mjs`, `scripts/prepare-merged-listings.mjs`, `rentfaster_console_scraper.js`, `scraper/`, `test-chat.mjs`, `test-error.mjs`, `*.log`, `tsc*.txt`, `changed_files.txt`, `error.html`
- Modify: `package.json` (remove `enrich:places`, `clean:combined`), `README.md`

- [ ] **Step 1: Confirm nothing imports the deleted files**

Run: `grep -rn "data/\|rentfaster-listings\|livable-data" src scripts --include="*.ts" --include="*.tsx" --include="*.mjs"`
Expected: no matches (Tasks 7–9 removed them). If any remain, fix them first.

- [ ] **Step 2: Delete**

```bash
git rm -r -q data scraper rentfaster_console_scraper.js test-chat.mjs test-error.mjs \
  scripts/build-combined-listings.mjs scripts/build-detailed-from-merged.mjs scripts/clean-combined-listings.mjs \
  scripts/enrich-rentfaster-listings-with-places.mjs scripts/extract-listing-details-from-html.mjs \
  scripts/geocode-rentfaster-listings.mjs scripts/merge-rentfaster-listings.mjs scripts/prepare-merged-listings.mjs
git rm -q --cached build.log build2.log build_output.log dev_live.err.log tsc.txt tsc_output.txt changed_files.txt error.html 2>/dev/null; rm -f build*.log dev_live.err.log tsc.txt tsc_output.txt changed_files.txt error.html
```

Add `*.log` and `.env.sync` to `.gitignore`. Remove `enrich:places` and `clean:combined` from `package.json`.

- [ ] **Step 3: README**

Replace the "How we built the data pipeline" section with:

```markdown
## Data pipeline

Listings live in a Supabase `listings` table and are refreshed weekly by a GitHub Action (`.github/workflows/sync-listings.yml`) running:

```bash
node scripts/sync-listings.mjs --city toronto   # RentFaster public map API
node scripts/sync-listings.mjs --city sf        # RentCast API
```

Each run pulls the city's active listings, enriches new ones with nearby amenities from Geoapify (schools, groceries, restaurants, cafés, parks, pharmacies, transit within 1 km — reusing results for listings in the same ~100 m cell), upserts them, and deactivates listings that disappeared. `--dry-run` prints without writing; `--limit N` caps Geoapify calls per run.

Env for the script: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEOAPIFY_API_KEY`, `RENTCAST_API_KEY`.
```

Update the "Getting started" env block to list only the six app vars, and add `Run supabase-schema.sql in the Supabase SQL editor` as a step. Replace "200+ real Canadian rentals" in Features with "real rentals in Toronto and San Francisco".

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Remove JSON data pipeline and stale artifacts; document DB-backed sync"
```

---

### Task 13: GitHub Actions weekly sync

**Files:**
- Create: `.github/workflows/sync-listings.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Sync listings

on:
  schedule:
    - cron: "0 9 * * 1" # Mondays 09:00 UTC
  workflow_dispatch:
    inputs:
      limit:
        description: "Max new listings to enrich via Geoapify per city"
        default: "400"

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      GEOAPIFY_API_KEY: ${{ secrets.GEOAPIFY_API_KEY }}
      RENTCAST_API_KEY: ${{ secrets.RENTCAST_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: node scripts/sync-listings.mjs --city toronto --limit ${{ inputs.limit || '400' }}
      - run: node scripts/sync-listings.mjs --city sf --limit ${{ inputs.limit || '400' }}
        if: always()
```

- [ ] **Step 2: Validate YAML locally**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/sync-listings.yml','utf8');console.log(y.split('\n').length,'lines')"` — then push and use **Actions → Sync listings → Run workflow** once the four repo secrets are set (Settings → Secrets and variables → Actions).
Expected: green run; logs show `[toronto] upserted …` and `[sf] upserted …`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync-listings.yml
git commit -m "Add weekly GitHub Action to sync listings into Supabase"
```

---

### Task 14: Deploy to Vercel (manual, user-driven)

**Files:** none in repo.

- [ ] **Step 1: Fill `.env.local`** with the six app vars (new Supabase URL/anon key, Gemini, Mapbox, ElevenLabs ×2). `npm run dev` → app loads listings from the new DB.

- [ ] **Step 2: Vercel**

```bash
npx vercel login
npx vercel link          # create new project under your account
for k in GEMINI_API_KEY NEXT_PUBLIC_MAPBOX_TOKEN NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY ELEVENLABS_API_KEY ELEVENLABS_VOICE_ID; do
  grep "^$k=" .env.local | cut -d= -f2- | npx vercel env add $k production
done
npx vercel --prod
```

Expected: a `https://<project>.vercel.app` URL that loads Toronto listings.

- [ ] **Step 3: Supabase auth**

Supabase → Authentication → URL Configuration: set Site URL to the Vercel URL and add `https://<project>.vercel.app/**` to Redirect URLs. (Google provider is optional — email/password works without it.)

- [ ] **Step 4: Verify**

Open the URL, toggle cities, sign up, save a listing, open `/saved`. Expected: all work; no console errors about Supabase or Mapbox.

---

## Self-review

**Spec coverage:** DB table (T1); sources (T2, T5); enrichment + cell reuse + limit + 429 retry (T3, T4); abort-before-writes on empty source (T4 `raws.length === 0` throw); deactivate (T4); cities config + circle mask (T6, T11); listings/suggestions/chat routes off the filesystem (T7–T9); city toggle + localStorage + saved page across cities (T10); Mapbox static fallback photo (T7); delete old pipeline + README (T12); Action (T13); Vercel + auth redirect (T14). Testing section: `node --test` for normalizers, cell reuse, scoring (T2–T5, T7); manual dry-run/dev/build steps inline.

**Placeholders:** none — every step has code or an exact command.

**Type consistency:** `RawListing` field names (`fullAddress`, `monthlyRent`, `propertyType`, `leaseTerm`) match between T2/T5 normalizers and T4 `toRow`; `DbRow` snake_case in T7 matches T1 columns and T4 `toRow` output; `nearbyServices` keys = `BUCKET_KEYS` in T7/T8/T9; `useCity()` returns `{ city, config, setCity }` used identically in T10/T11.
