import { NextResponse } from "next/server";
import { Amenity } from "@/lib/types";
import { loadNearby } from "@/lib/listings-db";
import { amenitiesFromNearby, describeAmenity, fallbackNameForType } from "@/lib/nearby-amenities";

type VitalityPayload = {
  vitalityScore: number;
  amenities: Amenity[];
};

type CacheEntry = {
  expiresAt: number;
  payload: VitalityPayload;
};

// A cold listing can spend 15s+ waiting on Overpass; keep Vercel from killing the
// function before the mirror loop and the fallback get to answer.
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const vitalityCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<VitalityPayload>>();

// Overpass is a volunteer service that IP-bans clients who keep hitting it while
// it is failing, so a run of misses has to back off. But one slow answer is not an
// outage: tripping on the first miss blanked every other listing for a full minute,
// which is what left the amenity tethers empty for the listing the user clicked.
const BREAKER_MS = 30 * 1000;
const BREAKER_AFTER = 3;
let overpassDownUntil = 0;
let consecutiveFailures = 0;

// maxDuration is 30s and one wedged mirror must not eat all of it. Cap each
// attempt, and stop starting mirrors once the budget cannot cover another —
// a 20s-per-mirror abort let a single bad request run past 28s and time out.
// A healthy mirror answers this query in 3-8s, so 10s is generous; two of them
// still fit in the budget.
const MIRROR_TIMEOUT_MS = 10000;
const TOTAL_BUDGET_MS = 22000;
// kumi.systems is left out on purpose: it timed out on every probe, and sitting
// second in the list it ate the whole remaining budget before lz4 — which answers
// in ~4s — was ever tried. These two fail independently enough to be worth both.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

type OverpassElement = {
  id: number | string;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string | undefined>;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

async function fetchOverpassJson(query: string): Promise<OverpassResponse> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (deadline - Date.now() < MIRROR_TIMEOUT_MS) break;
    const controller = new AbortController();
    // Long enough to outlive the query's own [timeout:15] plus queueing, short
    // enough that two mirrors still fit inside the budget.
    const timeout = setTimeout(() => controller.abort(), MIRROR_TIMEOUT_MS);
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        // Shared Next data cache (Vercel Data Cache in prod): every instance and
        // every user reuses one Overpass answer per listing for a week. Only 200s
        // are stored, so a bad day at Overpass is not cached.
        next: { revalidate: 7 * 24 * 60 * 60 },
        // Overpass policy requires an identifying User-Agent; the .de mirrors answer
        // Node's default with 406 / a reset, which left only kumi.systems serving us.
        headers: { "User-Agent": "Canopi/1.0 (+https://github.com/ZhuBryan/HackCanada)" },
      });
      // A 429 or 504 from one mirror says nothing about the other — in practice one
      // serves the exact query the other just refused — so spend the budget on it.
      // Sustained rate-limiting is what the breaker below is for.
      if (!response.ok) continue;
      return (await response.json()) as OverpassResponse;
    } catch {
      // Mirror health varies independently — .de answers while kumi/lz4 hang — so
      // a timeout here is worth passing to the next mirror, which the budget bounds.
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("All Overpass endpoints failed");
}

// The "brain" of Avenue-X: Calculates vitality and grabs real places using Overpass
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (!latParam || !lngParam) {
    return NextResponse.json(
      { error: "lat and lng search parameters are required" },
      { status: 400 }
    );
  }

  const lat = parseFloat(latParam);
  const lng = parseFloat(lngParam);

  // Preferred source: the Geoapify buckets the weekly sync already wrote for this
  // listing. No third-party call on the request path, so the tethers draw whether or
  // not Overpass is having a good day. Rows never enriched, rows enriched before
  // coordinates were captured, and the static demo listings all return null here and
  // fall through to Overpass below.
  const id = searchParams.get("id");
  if (id) {
    try {
      const payload = amenitiesFromNearby(await loadNearby(id), lat, lng);
      if (payload) return NextResponse.json(payload);
    } catch (error) {
      console.error("nearby lookup failed, falling back to Overpass:", error);
    }
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const now = Date.now();
  const cached = vitalityCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload);
  }
  // Stale cache if we have it, otherwise an explicit 503 the client already handles.
  const fallback = () =>
    cached?.payload
      ? NextResponse.json(cached.payload)
      : NextResponse.json(
          { error: "Failed to fetch vitality data from Overpass", vitalityScore: 0, amenities: [] },
          { status: 503 }
        );

  if (now < overpassDownUntil) return fallback();

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    // A prefetch and a click for the same listing share one Overpass call. If it
    // fails, answer with the same fallback rather than leaking a 500 or firing a
    // second round at rate-limited mirrors.
    try {
      return NextResponse.json(await inflight);
    } catch {
      return fallback();
    }
  }

  const radius = 500; // Search radius in meters

  // Overpass QL Query: Finding cafes, groceries, transit, and healthcare (clinics)
  const overpassQuery = `
    [out:json][timeout:15];
    (
      nwr["amenity"="cafe"](around:${radius},${lat},${lng});
      nwr["amenity"="restaurant"](around:${radius},${lat},${lng});
      nwr["shop"="supermarket"](around:${radius},${lat},${lng});
      nwr["shop"="convenience"](around:${radius},${lat},${lng});
      nwr["highway"="bus_stop"](around:${radius},${lat},${lng});
      nwr["amenity"="clinic"](around:${radius},${lat},${lng});
      nwr["amenity"="hospital"](around:${radius},${lat},${lng});
      nwr["amenity"="pharmacy"](around:${radius},${lat},${lng});
      nwr["amenity"="school"](around:${radius},${lat},${lng});
      nwr["leisure"="park"](around:${radius},${lat},${lng});
    );
    out center;
  `;

  try {
    const loadPayload = async (): Promise<VitalityPayload> => {
      const data = await fetchOverpassJson(overpassQuery);

      let rawScore = 0;
      const maxPossibleScore = 180; // Slightly higher cap due to broader category coverage

      const amenities: Amenity[] = data.elements
        .map((el: OverpassElement): Amenity | null => {
          if (!el.tags) return null;
          const amenityLat = Number(typeof el.lat === "number" ? el.lat : el.center?.lat);
          const amenityLng = Number(typeof el.lon === "number" ? el.lon : el.center?.lon);
          if (!Number.isFinite(amenityLat) || !Number.isFinite(amenityLng)) return null;

          // Determine type based on OSM tags
          let type: Amenity["type"] = "other";
          let weight = 0;

          if (el.tags.amenity === "cafe") {
            type = "cafe";
            weight = 10;
          } else if (el.tags.amenity === "restaurant") {
            type = "restaurant";
            weight = 12;
          } else if (el.tags.shop === "supermarket" || el.tags.shop === "convenience") {
            type = "grocery";
            weight = 15;
          } else if (el.tags.highway === "bus_stop") {
            type = "transit";
            weight = 10;
          } else if (el.tags.amenity === "school") {
            type = "school";
            weight = 9;
          } else if (el.tags.leisure === "park") {
            type = "park";
            weight = 5;
          } else if (
            el.tags.amenity === "clinic" ||
            el.tags.amenity === "hospital" ||
            el.tags.amenity === "pharmacy"
          ) {
            type = "healthcare"; // We use healthcare for the Vivirion Pink flex
            weight = 25;
          }

          rawScore += weight;

          // Simple haversine distance approx (lat/lng diff to meters)
          const dLat = (amenityLat - lat) * 111000;
          const dLng = (amenityLng - lng) * 82000; // approx for ~43 deg N
          const distance = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));

          return {
            id: el.id.toString(), // We keep ID just in case
            name: el.tags.name || fallbackNameForType(type),
            type,
            coords: [amenityLat, amenityLng], // [lat, lng]
            distance,
            description: describeAmenity(type, distance),
          };
        })
        .filter(Boolean) as Amenity[]; // Filter out nulls (unnamed/unmapped)

      // Deduplicate nearby duplicates using coarse spatial key + type + name.
      const uniqueAmenities = Array.from(
        new Map(
          amenities.map((a) => [
            `${a.type}:${a.name}:${a.coords[0].toFixed(4)}:${a.coords[1].toFixed(4)}`,
            a,
          ])
        ).values()
      );

      // Final Score Calculation (0-100 curve)
      // We curve it so 0 amenities = 0 score, but ~8 good places = 100 score.
      const scoreFraction = Math.min(rawScore / maxPossibleScore, 1.0);
      const vitalityScore = Math.round(scoreFraction * 100);

      // Limit to top 15 closest places
      const topAmenities = uniqueAmenities.sort((a, b) => a.distance - b.distance).slice(0, 15);
      return {
        vitalityScore,
        amenities: topAmenities,
      };
    };

    const requestPromise = loadPayload();
    inflightRequests.set(cacheKey, requestPromise);
    const payload = await requestPromise;
    vitalityCache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    });
    inflightRequests.delete(cacheKey);
    consecutiveFailures = 0;

    return NextResponse.json(payload);
  } catch (error) {
    inflightRequests.delete(cacheKey);
    consecutiveFailures += 1;
    if (consecutiveFailures >= BREAKER_AFTER) {
      overpassDownUntil = Date.now() + BREAKER_MS;
      consecutiveFailures = 0;
      console.error("Overpass API Error (pausing Overpass for 30s):", error);
    } else {
      console.error(`Overpass API Error (${consecutiveFailures}/${BREAKER_AFTER}):`, error);
    }
    return fallback();
  }
}
