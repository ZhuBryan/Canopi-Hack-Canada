import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Listing, ScoreBand } from "@/lib/avenuex-data";

// ── Raw data types (same shape as /api/listings) ─────────────────────────────

interface NearbyBucket {
  count: number;
  places?: {
    distance_meters: number | null;
  }[];
}

interface RawListing {
  listing_id: string;
  url: string | null;
  title: string | null;
  location: string | null;
  price: string | null;
  photo: string | null;
  lat: number | null;
  lng: number | null;
  nearby?: {
    schools?: NearbyBucket;
    groceries?: NearbyBucket;
    restaurants?: NearbyBucket;
    cafes?: NearbyBucket;
    parks?: NearbyBucket;
    pharmacies?: NearbyBucket;
    transit?: NearbyBucket;
  };
  details?: {
    bedsMin: number | null;
    bedsMax: number | null;
    bedsLabel: string | null;
    bathsMin: number | null;
    bathsMax: number | null;
    bathsLabel?: string | null;
    sqft: number | null;
    pets: "pets_ok" | "cats_ok" | "dogs_ok" | "no_pets" | null;
    availability: string | null;
    leaseTerm?: string | null;
    propertyType: string | null;
    utilitiesIncluded?: string[];
    features?: string[];
    buildingAmenities?: string[];
  } | null;
}

// ── Bucket definitions ───────────────────────────────────────────────────────

const BUCKET_KEYS = [
  "schools",
  "groceries",
  "restaurants",
  "cafes",
  "parks",
  "pharmacies",
  "transit",
] as const;

type BucketKey = (typeof BUCKET_KEYS)[number];

const BUCKET_LABELS: Record<BucketKey, string> = {
  schools: "Schools",
  groceries: "Grocery",
  restaurants: "Restaurants",
  cafes: "Cafes",
  parks: "Parks",
  pharmacies: "Pharmacies",
  transit: "Transit",
};

const EFFECTIVE_RADIUS_METERS = 1000;

const BUCKET_CAPS = {
  schools: 5,
  groceries: 5,
  restaurants: 15,
  cafes: 10,
  parks: 5,
  pharmacies: 5,
  transit: 10,
} as const;

// ── Helpers (duplicated minimally to keep this route self-contained) ─────────

function parsePrice(raw: string | null | undefined): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^0-9]/g, "");
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function extractCity(location: string | null | undefined): string {
  if (!location) return "Toronto, ON";
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "Toronto";
  return `${city}, ON`;
}

function extractAddress(location: string | null | undefined): string {
  if (!location) return "Unknown address";
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[0] ?? location;
}

function countWithinRadius(bucket: NearbyBucket | undefined): number {
  if (!bucket) return 0;

  if (Array.isArray(bucket.places) && bucket.places.length > 0) {
    return bucket.places.filter((place) => {
      if (!Number.isFinite(place.distance_meters)) return false;
      return (place.distance_meters ?? Infinity) <= EFFECTIVE_RADIUS_METERS;
    }).length;
  }

  return bucket.count ?? 0;
}

function bucketScore(
  key: keyof typeof BUCKET_CAPS,
  count: number,
): number {
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
  if (rent >= 1000) return `$${(rent / 1000).toFixed(1)}K`;
  return `$${rent}`;
}

function computeIncomeNeeded(monthlyRent: number): number {
  return Math.round((monthlyRent / 0.3) * 12 / 1000) * 1000;
}

// ── Personal scoring ─────────────────────────────────────────────────────────

interface Weights {
  schools: number;
  groceries: number;
  restaurants: number;
  cafes: number;
  parks: number;
  pharmacies: number;
  transit: number;
}

function computePersonalScore(
  nearby: RawListing["nearby"],
  weights: Weights
): number {
  if (!nearby) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of BUCKET_KEYS) {
    const w = weights[key];
    if (w <= 0) continue;
    const count = countWithinRadius(nearby[key]);
    const cap = BUCKET_CAPS[key];
    const normalized = Math.min(count, cap) / cap;
    weightedSum += w * normalized;
    totalWeight += w;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

function buildMatchReason(nearby: RawListing["nearby"], weights: Weights): string {
  if (!nearby) return "No nearby data available";

  const scored: { key: BucketKey; contribution: number }[] = [];

  for (const key of BUCKET_KEYS) {
    const w = weights[key];
    const count = countWithinRadius(nearby[key]);
    const cap = BUCKET_CAPS[key];
    const normalized = Math.min(count, cap) / cap;
    scored.push({ key, contribution: w * normalized });
  }

  scored.sort((a, b) => b.contribution - a.contribution);

  const top = scored.slice(0, 2).filter((s) => s.contribution > 0);
  if (top.length === 0) return "Limited data for your priorities";

  const labels = top.map((s) => BUCKET_LABELS[s.key].toLowerCase());
  return `Strong ${labels.join(" and ")} access`;
}

// ── Data loading ─────────────────────────────────────────────────────────────

let cachedRaw: RawListing[] | null = null;

async function loadRaw(): Promise<RawListing[]> {
  if (cachedRaw) return cachedRaw;
  const filePath = path.join(process.cwd(), "data", "rentfaster-listings.detailed.json");
  const raw = await readFile(filePath, "utf8");
  cachedRaw = JSON.parse(raw);
  return cachedRaw!;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const maxRent = searchParams.has("maxRent")
      ? parseInt(searchParams.get("maxRent")!, 10)
      : Infinity;

    const weights: Weights = {
      schools: parseWeight(searchParams.get("w_schools")),
      groceries: parseWeight(searchParams.get("w_groceries")),
      restaurants: parseWeight(searchParams.get("w_restaurants")),
      cafes: parseWeight(searchParams.get("w_cafes")),
      parks: parseWeight(searchParams.get("w_parks")),
      pharmacies: parseWeight(searchParams.get("w_pharmacies")),
      transit: parseWeight(searchParams.get("w_transit")),
    };

    const rawListings = await loadRaw();

    const results: (Listing & { personalScore: number; matchReason: string })[] = rawListings
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .map((item) => {
        const monthlyRent = parsePrice(item.price);
        const city = extractCity(item.location);
        const address = extractAddress(item.location);
        const nearby = item.nearby ?? {};
        const details = item.details ?? null;
        const schoolsCount = countWithinRadius(nearby.schools);
        const groceriesCount = countWithinRadius(nearby.groceries);
        const restaurantsCount = countWithinRadius(nearby.restaurants);
        const cafesCount = countWithinRadius(nearby.cafes);
        const parksCount = countWithinRadius(nearby.parks);
        const pharmaciesCount = countWithinRadius(nearby.pharmacies);
        const transitCount = countWithinRadius(nearby.transit);

        const foodDrink = Math.round(
          (bucketScore("restaurants", restaurantsCount) + bucketScore("cafes", cafesCount)) / 2
        );
        const health = bucketScore("pharmacies", pharmaciesCount);
        const groceryParks = Math.round(
          (bucketScore("groceries", groceriesCount) + bucketScore("parks", parksCount)) / 2
        );
        const education = bucketScore("schools", schoolsCount);
        const emergency = Math.round(health * 0.6 + bucketScore("transit", transitCount) * 0.4);

        const score = Math.round((foodDrink + health + groceryParks + education + emergency) / 5);
        const scoreBand = deriveBand(score);

        const personalScore = computePersonalScore(nearby, weights);
        const matchReason = buildMatchReason(nearby, weights);

        return {
          id: `rf-${item.listing_id}`,
          address,
          city,
          fullAddress: item.location ?? address,
          monthlyRent,
          priceLabel: `$${monthlyRent.toLocaleString()}/mo`,
          shortPrice: formatShortPrice(monthlyRent),
          beds: details?.bedsMin ?? (/studio/i.test(details?.bedsLabel ?? "") ? 0 : 1),
          baths: details?.bathsMin ?? 1,
          sqft: details?.sqft ?? 0,
          propertyType: mapPropertyType(details?.propertyType),
          score,
          scoreStatus: deriveStatus(scoreBand),
          scoreBand,
          image: item.photo ?? "",
          pinX: "50%",
          pinY: "50%",
          lat: item.lat!,
          lng: item.lng!,
          availableDate: details?.availability ?? "Available now",
          leaseTerm: details?.leaseTerm ?? "12 months",
          about: item.title ?? "",
          amenities: buildBuildingAmenities(item.title, details),
          nearbyServices: {
            schools: schoolsCount,
            groceries: groceriesCount,
            restaurants: restaurantsCount,
            cafes: cafesCount,
            parks: parksCount,
            pharmacies: pharmaciesCount,
            transit: transitCount,
          },
          categoryScores: { foodDrink, health, groceryParks, education, emergency },
          bedsLabel: details?.bedsLabel ?? undefined,
          bathsLabel: details?.bathsLabel ?? buildBathsLabel(details?.bathsMin, details?.bathsMax),
          incomeNeeded: computeIncomeNeeded(monthlyRent),
          personalScore,
          matchReason,
        };
      })
      .filter((listing) => Number.isFinite(maxRent) ? listing.monthlyRent <= maxRent : true)
      .sort((a, b) => b.personalScore - a.personalScore);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to compute suggestions:", error);
    return NextResponse.json({ error: "Failed to compute suggestions" }, { status: 500 });
  }
}

// ── Small helpers ────────────────────────────────────────────────────────────

function parseWeight(raw: string | null): number {
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.max(0, Math.min(10, n));
}

function buildAmenityLabels(
  counts: Partial<Record<keyof typeof BUCKET_CAPS, number>>
): string[] {
  const labels: string[] = [];
  for (const key of BUCKET_KEYS) {
    const count = counts[key] ?? 0;
    if (count > 0) labels.push(`${count} ${BUCKET_LABELS[key].toLowerCase()} (1km)`);
  }
  return labels;
}

function mapPropertyType(raw: string | null | undefined): Listing["propertyType"] {
  const normalized = (raw ?? "").toLowerCase();
  if (normalized.includes("condo")) return "Condo";
  if (normalized.includes("house") || normalized.includes("town")) return "House";
  return "Apartment";
}

function buildBathsLabel(
  bathsMin: number | null | undefined,
  bathsMax: number | null | undefined,
): string | undefined {
  if (!Number.isFinite(bathsMin) && !Number.isFinite(bathsMax)) return undefined;
  if (bathsMin === bathsMax) return `${bathsMin} ba`;
  return `${bathsMin ?? bathsMax} - ${bathsMax ?? bathsMin} ba`;
}

function buildBuildingAmenities(
  title: string | null | undefined,
  details: RawListing["details"],
): string[] {
  if (details?.buildingAmenities && details.buildingAmenities.length > 0) {
    return details.buildingAmenities;
  }

  const amenities = new Set<string>();
  const titleText = (title ?? "").toLowerCase();

  if (details?.pets === "pets_ok") amenities.add("Pet-friendly");
  if (details?.pets === "cats_ok") amenities.add("Cats OK");
  if (details?.pets === "dogs_ok") amenities.add("Dogs OK");
  if (details?.pets === "no_pets") amenities.add("No pets");

  const keywordAmenities: Array<[RegExp, string]> = [
    [/\bparking\b/i, "Parking"],
    [/\blaundry\b/i, "Laundry"],
    [/\bwasher\b/i, "Laundry"],
    [/\bgym\b/i, "Gym"],
    [/\bfitness\b/i, "Gym"],
    [/\bpool\b/i, "Pool"],
    [/\bbalcony\b/i, "Balcony"],
    [/\bdishwasher\b/i, "Dishwasher"],
    [/\bair conditioning\b|\ba\/c\b/i, "A/C"],
    [/\bstorage\b/i, "Storage"],
    [/\bconcierge\b/i, "Concierge"],
    [/\brooftop\b/i, "Rooftop deck"],
  ];

  for (const [pattern, label] of keywordAmenities) {
    if (pattern.test(titleText)) amenities.add(label);
  }

  return [...amenities];
}
