import type { Amenity } from "@/lib/types";

// The Geoapify buckets the weekly sync writes into listings.nearby.
export type NearbyPlace = {
  name?: string | null;
  address?: string | null;
  distance_meters?: number | null;
  categories?: string[];
  lat?: number | null;
  lon?: number | null;
};
export type NearbyBucket = { count?: number; radius_meters?: number; places?: NearbyPlace[] };
export type Nearby = Record<string, NearbyBucket>;

// Bucket -> the amenity type and weight the Overpass query used, listed in the order
// that query's if/else chain resolved them. A place that lands in two buckets (a
// supermarket with a pharmacy counter) is typed and scored once, as it was before.
const BUCKET_TYPES: ReadonlyArray<readonly [string, string, number]> = [
  ["cafes", "cafe", 10],
  ["restaurants", "restaurant", 12],
  ["groceries", "grocery", 15],
  ["transit", "transit", 10],
  ["schools", "school", 9],
  ["parks", "park", 5],
  ["pharmacies", "healthcare", 25],
];

// Overpass searched 500m; Geoapify stores up to 1000m for most buckets. Keep the
// tighter radius so the tethers stay the length they have always been.
const RADIUS_M = 500;
const MAX_SCORE = 180;
const MAX_AMENITIES = 15;

export function describeAmenity(type: string, distance: number): string {
  const walk = Math.max(1, Math.round(distance / 80));
  switch (type) {
    case "grocery":
      return `Grocery option about ${walk} min away for quick essentials runs.`;
    case "cafe":
      return `Cafe about ${walk} min away for coffee, study, or casual meetups.`;
    case "transit":
      return `Transit stop around ${walk} min away to support easier commuting.`;
    case "healthcare":
      return `Healthcare access roughly ${walk} min away for prescriptions or urgent needs.`;
    case "park":
      return `Park around ${walk} min away for walks, exercise, and downtime.`;
    default:
      return `Nearby amenity about ${walk} min away.`;
  }
}

export function fallbackNameForType(type: string): string {
  switch (type) {
    case "grocery":
      return "Nearby Grocery";
    case "cafe":
      return "Nearby Cafe";
    case "restaurant":
      return "Nearby Restaurant";
    case "transit":
      return "Nearby Transit";
    case "healthcare":
      return "Nearby Healthcare";
    case "park":
      return "Nearby Park";
    case "school":
      return "Nearby School";
    default:
      return "Nearby Amenity";
  }
}

function metresBetween(lat: number, lng: number, pLat: number, pLng: number): number {
  const dLat = (pLat - lat) * 111000;
  const dLng = (pLng - lng) * 111000 * Math.cos((lat * Math.PI) / 180);
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

/**
 * Build the vitality payload from the Geoapify data the sync already stored, so a
 * listing draws its tethers without calling Overpass at request time.
 *
 * Returns null when this row cannot answer — never enriched, or enriched before
 * geoapify.mjs captured coordinates — so the caller falls back to Overpass.
 */
export function amenitiesFromNearby(
  nearby: Nearby | null | undefined,
  lat: number,
  lng: number
): { vitalityScore: number; amenities: Amenity[] } | null {
  if (!nearby) return null;

  const seen = new Set<string>();
  const amenities: Amenity[] = [];
  let rawScore = 0;
  let sawPlace = false;
  let sawCoords = false;

  for (const [bucket, type, weight] of BUCKET_TYPES) {
    for (const place of nearby[bucket]?.places ?? []) {
      sawPlace = true;
      const pLat = place.lat;
      const pLng = place.lon;
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
      sawCoords = true;

      const distance = Number.isFinite(place.distance_meters)
        ? Math.round(place.distance_meters as number)
        : metresBetween(lat, lng, pLat as number, pLng as number);
      if (distance > RADIUS_M) continue;

      const key = `${(place.name ?? "").toLowerCase()}|${(pLat as number).toFixed(5)}|${(pLng as number).toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rawScore += weight;
      amenities.push({
        id: key,
        name: place.name || fallbackNameForType(type),
        type,
        coords: [pLat as number, pLng as number],
        distance,
        description: describeAmenity(type, distance),
      });
    }
  }

  // No buckets at all, or places with no coordinates: this row cannot answer.
  if (!sawPlace || !sawCoords) return null;

  return {
    vitalityScore: Math.round(Math.min(rawScore / MAX_SCORE, 1) * 100),
    amenities: amenities.sort((a, b) => a.distance - b.distance).slice(0, MAX_AMENITIES),
  };
}
