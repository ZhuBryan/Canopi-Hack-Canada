# Canopi — Multi-city listings DB, automated sync, redeploy

Date: 2026-09-17

## Goals

1. Redeploy Canopi under Ryan's Vercel account with fresh API keys.
2. Replace the manual scrape → 7-script → JSON-in-git pipeline with a scheduled sync into a real database.
3. Refresh Toronto (current data is stale) and add San Francisco. City is a first-class parameter so more cities are cheap.

Non-goals (deferred): crime/safety data (the UI's "safety" axis is pharmacies+transit today — no parity loss), ISR caching on `/api/listings`, cities beyond Toronto and SF, real listing photos for SF.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 / React 19 / TS / Tailwind 4 | unchanged |
| DB | Supabase Postgres, new `listings` table | already hosts auth, saved listings, chat history; RLS; HTTP client works from serverless; free tier fits (~40 MB) |
| Pipeline | Node `.mjs` scripts + `@supabase/supabase-js` (already installed) | matches existing scripts; no new deps |
| Scheduler | GitHub Actions cron (weekly) + `workflow_dispatch` | free; no infra; secrets in repo settings |
| Toronto source | RentFaster `GET https://www.rentfaster.ca/api/map.json?city_id=7&cur_page=N` | verified 2026-09-17: plain HTTPS, 500/page, 3,425 listings, no browser needed |
| SF source | RentCast `GET /v1/listings/rental?city=San Francisco&state=CA&status=Active&limit=500` | official API; free tier 50 calls/mo, 1 call per run |
| Amenities | Geoapify Places (unchanged categories) | worldwide; free 3,000 calls/day |
| SF photo fallback | Mapbox Static Images URL | RentCast has no photos; Mapbox token already required |
| Hosting | Vercel via CLI (`vercel --prod`) | no dependency on GitHub-app access to teammate's repo |

Secrets — app (Vercel env): `GEMINI_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.
Secrets — pipeline (GitHub Actions): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEOAPIFY_API_KEY`, `RENTCAST_API_KEY`.

## Architecture

```
GitHub Actions (weekly)
  └─ node scripts/sync-listings.mjs --city toronto
  └─ node scripts/sync-listings.mjs --city sf
        ├─ sources/rentfaster.mjs | sources/rentcast.mjs   → raw records
        ├─ normalize → row shape
        ├─ enrich new rows: reuse `nearby` from an existing row in the same
        │  ~100 m lat/lng cell, else Geoapify (7 buckets, 250 ms apart)
        └─ upsert into Supabase `listings`; deactivate ids not seen this run

Vercel (Next.js)
  /api/listings?city=sf  → select from listings where city=$1 and active → score → Listing[]
  /api/chat              → body.city → prompt built from src/lib/cities.ts
  UI                     → city toggle in header; map re-centers; stored in avenuex-store + localStorage
```

## Database

```sql
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
  nearby        jsonb not null default '{}',   -- {schools:{count,places:[{name,distance_meters,…}]},…}; doubles as Geoapify cache
  active        boolean not null default true,
  seen_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index listings_city_active_idx on public.listings (city) where active;
alter table public.listings enable row level security;
create policy "public read active" on public.listings for select using (active);
```

Writes only via service-role key from the pipeline. Scoring (bucket caps → score/band/status) stays in `/api/listings` — derived, not stored. Appended to `supabase-schema.sql`.

## Pipeline — `scripts/sync-listings.mjs`

CLI: `--city <slug>` (required), `--limit N` (cap new-listing enrichment per run; default 400 — Geoapify daily budget), `--dry-run` (print upserts, no writes).

Sources return a common raw shape: `{ id, url, address, fullAddress, lat, lng, monthlyRent, beds, baths, sqft, propertyType, photo, available, leaseTerm, amenities }`.

- `sources/rentfaster.mjs`: page `cur_page=0..` until `listings.length < 500`; filter `city === 'Toronto'` (page bleed observed); map `link`→url, `intro`→address, `thumb2`→photo, `price`→rent, `beds`/`baths`/`type`/`availability`. Sqft/lease not in payload → null.
- `sources/rentcast.mjs`: one request, header `X-Api-Key`; map `id`, `formattedAddress`, `latitude/longitude`, `price`, `bedrooms/bathrooms/squareFootage`, `propertyType`, `listedDate`; photo = Mapbox static URL built from lat/lng.

Sync steps:
1. Fetch raw → normalize; drop rows with missing lat/lng/url or rent < 500.
2. `select id, lat, lng, nearby from listings where city=$1` → existing map.
3. For new ids: cell key = `lat.toFixed(3)|lng.toFixed(3)`; copy `nearby` from any existing row in that cell; else Geoapify (up to `--limit` rows per run; the rest are inserted with `nearby={}` and picked up next run).
4. Upsert in batches of 500 (`onConflict: 'id'`), `seen_at=now()`, `active=true`.
5. `update listings set active=false where city=$1 and id not in (seen ids)`.

Errors: any source fetch failure aborts the run before writes (no partial deactivation). Geoapify 429 → sleep 2 s and retry once, then leave `nearby={}` for that row.

`.github/workflows/sync-listings.yml`: `schedule: '0 9 * * 1'` + `workflow_dispatch`; `npm ci`; runs both cities; secrets above.

## App changes

- `src/lib/cities.ts`: `CITIES = { toronto: {...}, sf: {...} }` — `label`, `region` ("ON"/"CA"), `center`, `zoom`, `maskRadiusKm`, `promptBlurb`, `landmarks[]`. GTA hand-coded polygon in `MapboxMap.tsx` replaced by a circle from center+radius.
- `src/app/api/listings/route.ts`: fs read → Supabase query by `?city=`; delete `RawListing`/fs code; keep scoring helpers; `extractCity` hardcode → `city.label, city.region`.
- `src/app/api/chat/route.ts`, `api/suggestions/route.ts`: "Toronto" literals → `cities[body.city]`.
- `src/lib/avenuex-store.tsx`: `city` state, default `toronto`, persisted to localStorage; `page.tsx` and `saved/page.tsx` fetch with `?city=`.
- City toggle: two-button segmented control in the existing header next to `UserMenu`.
- Delete: `data/*.json`, `data/*.csv`, `scripts/*` (old 7), `rentfaster_console_scraper.js`, `scraper/`. README pipeline section rewritten.

## Roadmap (order of work)

| # | Step | Blocked by |
|---|---|---|
| 1 | Supabase: new project, run `supabase-schema.sql` (existing + `listings`) | you: create project |
| 2 | `scripts/sync-listings.mjs` + `sources/rentfaster.mjs`; `--dry-run` against live RentFaster | — |
| 3 | Real sync of Toronto into Supabase | 1, Geoapify key |
| 4 | `sources/rentcast.mjs`; dry-run then real SF sync | RentCast key |
| 5 | App: `cities.ts`, listings route → Supabase, chat/suggestions prompt, store + toggle, map center/mask | 3 |
| 6 | Delete old data/scripts; update README | 5 |
| 7 | GitHub Action workflow + repo secrets | 3, 4 |
| 8 | Vercel: `vercel link`, env vars, `vercel --prod`; Supabase auth redirect URL | Gemini/Mapbox/ElevenLabs keys |
| 9 | Google OAuth provider in Supabase (optional) | 8 |

## Testing

- `node --test scripts/sync-listings.test.mjs`: fixtures for one RentFaster record and one RentCast record → assert normalized row; assert cell-key cache reuse skips Geoapify (stub fetch).
- Manual: `--dry-run` per city; real run; `npm run dev`, toggle cities, open a listing, save one, check `/saved`.
- `npm run build` green before deploy.
