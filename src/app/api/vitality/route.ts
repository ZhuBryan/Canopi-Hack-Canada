import { NextResponse } from "next/server";
import { Amenity } from "@/lib/types";

type VitalityPayload = {
  vitalityScore: number;
  amenities: Amenity[];
};

type CacheEntry = {
  expiresAt: number;
  payload: VitalityPayload;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const vitalityCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<VitalityPayload>>();
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
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

function describeAmenity(type: Amenity["type"], distance: number): string {
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

function fallbackNameForType(type: Amenity["type"]): string {
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

async function fetchOverpassJson(query: string): Promise<OverpassResponse> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) continue;
      return (await response.json()) as OverpassResponse;
    } catch {
      // Try next mirror.
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
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const now = Date.now();
  const cached = vitalityCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload);
  }
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    const sharedPayload = await inflight;
    return NextResponse.json(sharedPayload);
  }

  const radius = 500; // Search radius in meters

  // Overpass QL Query: Finding cafes, groceries, transit, and healthcare (clinics)
  const overpassQuery = `
    [out:json][timeout:12];
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

    return NextResponse.json(payload);
  } catch (error) {
    inflightRequests.delete(cacheKey);
    console.error("Overpass API Error:", error);
    if (cached?.payload) {
      return NextResponse.json(cached.payload);
    }
    return NextResponse.json(
      {
        error: "Failed to fetch vitality data from Overpass",
        vitalityScore: 0,
        amenities: [],
      },
      { status: 503 }
    );
  }
}
