# HackCanada RentFaster Pipeline

This repo turns RentFaster rental snapshots into a geocoded dataset and prepares a livability-enrichment layer on top of it.

## Current Data Flow

1. Merge raw snapshots from the workspace root into `data/rentfaster-listings.unique.json`
2. Geocode listings into `data/rentfaster-listings.map-ready.json`
3. Enrich nearby amenities into `data/rentfaster-listings.livable-data.json`

## Livability Source Selection

- Primary nearby places: `Geoapify Places API`
- Schools: `Geoapify Places API` school category lookup
- Transit context: `TTC Open Data / GTFS`
- Demographics and access context: `Statistics Canada Proximity Measures`
- Optional safety context: `Toronto Police Service Open Data`

The selected provider stack is stored in `data/livability-sources.json`.

## Commands

```bash
npm run merge:rentfaster
npm run geocode:rentfaster
npm run enrich:places
```

## Environment

The places enrichment step requires:

```bash
GEOAPIFY_API_KEY=your_key_here
```

## Notes

- The enrichment script reads from the existing geocoded file, so `lat` and `lng` must already be present.
- The merge script excludes the known bad Milton match so it does not re-enter the generated files.