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

- **AI chat assistant** — Conversational matching that reads between the lines. Supports English and French. Voice input/output via ElevenLabs STT/TTS.
- **Interactive map** — Mapbox GL map showing 200+ real Canadian rentals with price pins, listing cards, and fly-to animations when the AI recommends a property.
- **8-axis preference radar** — Live spider chart that updates as Canopi learns what matters to you.
- **Neighborhood scores** — Amenity counts (schools, cafés, parks, groceries, transit, pharmacies, restaurants) within 1 km of every listing.
- **3D diorama view** — Three.js spatial visualization of neighborhood vitality around a selected listing.
- **Saved listings** — Bookmark favorites with Supabase-backed persistence across sessions.
- **Auth** — Email/password and Google OAuth via Supabase.

---

## How we built the data pipeline

Getting structured, enriched rental data at scale was one of our core technical challenges. We used a multi-stage AI-assisted pipeline:

1. **Scraping** — We pulled raw rental listings from RentFaster.ca, collecting addresses, prices, unit details, and geographic coordinates across Canadian cities.

2. **AI parsing & normalization** — Raw listing data is inconsistent: mixed formats, missing fields, non-standard descriptions. We used Gemini to parse and normalize listing text into a consistent schema — extracting bedroom counts, amenity mentions, building types, and income thresholds even when listings didn't follow any standard format.

3. **Geospatial enrichment** — For each listing, we queried the Overpass API (OpenStreetMap) to count nearby amenities within a 1 km radius: cafés, gyms, parks, grocery stores, pharmacies, schools, transit stops, and restaurants. This turned raw coordinates into neighborhood lifestyle scores.

4. **Caching** — Enriched data is cached locally (`data/geoapify-places-cache.json`) to avoid redundant API calls and keep the app fast.

The result: 200+ listings each carrying a rich neighborhood profile that the AI can reason about when making personalized recommendations.

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
| Voice | ElevenLabs STT/TTS |
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
ELEVENLABS_API_KEY=your_elevenlabs_key
```

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
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `ELEVENLABS_API_KEY` | No | ElevenLabs key for voice input/output |

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
│       ├── vitality/route.ts     # Amenity data via Overpass
│       ├── tts/route.ts          # ElevenLabs text-to-speech
│       └── stt/route.ts          # ElevenLabs speech-to-text
├── components/
│   ├── avenuex/                  # UI components (map, chat, navbar, spider chart)
│   └── three/                    # 3D diorama components
└── lib/
    ├── spider-prefs-context.tsx  # 8-axis preference state
    ├── auth-context.tsx          # Supabase auth provider
    └── avenuex-data.ts           # Listing types and scoring
data/
├── rentfaster-listings.combined.json      # ~200 Canadian rental listings
├── rentfaster-listings.livable-data.json  # AI-enriched listings for chat
└── geoapify-places-cache.json             # Cached OSM amenity data
scripts/
├── enrich-rentfaster-listings-with-places.mjs   # Geospatial enrichment
└── clean-combined-listings.mjs                  # AI normalization pass
```

---

## Re-running the data pipeline

```bash
npm run enrich:places   # Pull amenity data from Overpass API
npm run clean:combined  # Normalize and AI-parse raw listings
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run enrich:places` | Re-enrich listings with Overpass amenity data |
| `npm run clean:combined` | Clean, normalize, and AI-parse combined listings |