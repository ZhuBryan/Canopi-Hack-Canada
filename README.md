<p align="center">
  <img src="public/canopi-logo.png" alt="Canopi" width="80" />
</p>

# Canopi

**Find your place — not just an apartment.**

Canopi is an AI-powered rental discovery platform that understands *who you are*, not just what you're searching for. Through lifestyle-revealing conversation, it learns your priorities and surfaces rentals across Canada that actually fit your life.

**Live demo:** https://hack-canada.vercel.app

---

## The Problem

Every rental platform in Canada filters by beds and price. They treat you like a set of constraints. Canopi starts with you — your habits, your energy, what a good day actually looks like — and works backwards to find where you belong.

---

## What it does

An AI assistant asks indirect, personality-driven questions — *"What does a good Sunday morning look like for you?"* — and infers your preferences across 8 lifestyle axes: walkability, nourishment, wellness, greenery, buzz, essentials, safety, and transit. As the conversation evolves, the map re-ranks listings in real time to match your actual life.

---

## Features

- **AI chat assistant** — Conversational matching that reads between the lines. Replies in whatever language you write in.
- **Interactive map** — Mapbox GL map showing real rentals in Toronto and San Francisco with price pins, listing cards, and fly-to animations when the AI recommends a property.
- **8-axis preference radar** — Live spider chart that updates as Canopi learns what matters to you.
- **Neighborhood scores** — Amenity counts (schools, cafés, parks, groceries, transit, pharmacies, restaurants) within 1 km of every listing.
- **3D diorama view** — Three.js spatial visualization of neighborhood vitality around a selected listing.
- **Saved listings** — Bookmark favorites with Supabase-backed persistence across sessions.
- **Auth** — Email/password and Google OAuth via Supabase.

---

## Data pipeline

Listings live in a Supabase `listings` table and are refreshed weekly by a GitHub Action (`.github/workflows/sync-listings.yml`) running:

````bash
node scripts/sync-listings.mjs --city toronto   # RentFaster public map API
node scripts/sync-listings.mjs --city sf        # RentCast API
````

Each run pulls the city's active listings, enriches new ones with nearby amenities from Geoapify (schools, groceries, restaurants, cafés, parks, pharmacies, transit within 1 km — reusing results for listings in the same ~100 m cell), upserts them, and deactivates listings that disappeared. `--dry-run` prints without writing; `--limit N` caps Geoapify calls per run.

Env for the script: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEOAPIFY_API_KEY`, `RENTCAST_API_KEY`.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| AI | Google Gemini 2.5 Flash (structured JSON output) |
| Map | Mapbox GL 3 |
| 3D | Three.js, @react-three/fiber, @react-three/drei |
| Auth & DB | Supabase |
| Styling | Tailwind CSS 4, GSAP |
| Amenity data | Overpass API (OpenStreetMap) |

---

## Getting started

```bash
git clone <repo-url>
cd hackcanada
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
GEMINI_API_KEY=your_gemini_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run `supabase-schema.sql` in the Supabase SQL editor.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Yes | Mapbox GL public token for map rendering |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for the chat assistant |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL — `https://<ref>.supabase.co` (not the REST URL ending in `/rest/v1/`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                  # Main map + chat interface
│   ├── saved/page.tsx            # Saved listings gallery
│   ├── diorama/page.tsx          # 3D neighborhood view
│   └── api/
│       ├── chat/route.ts         # Gemini conversational AI
│       ├── listings/route.ts     # Rental listing data
│       └── vitality/route.ts     # Amenity data via Overpass
├── components/
│   ├── avenuex/                  # UI components (map, chat, navbar, spider chart)
│   └── three/                    # 3D diorama components
└── lib/
    ├── spider-prefs-context.tsx  # 8-axis preference state
    ├── auth-context.tsx          # Supabase auth provider
    ├── avenuex-data.ts           # Listing types and scoring
    └── listings-db.ts            # Supabase listings queries
scripts/
├── sync-listings.mjs             # Weekly listings sync (see Data pipeline)
├── geoapify.mjs                  # Amenity enrichment helper
└── sources/                      # Per-city listing sources (RentFaster, RentCast)
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run sync` | Sync listings into Supabase (see Data pipeline) |