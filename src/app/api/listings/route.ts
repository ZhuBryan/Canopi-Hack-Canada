import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Listing, ScoreBand } from "@/lib/avenuex-data";

// ── Types for the raw livable-data JSON ──────────────────────────────────────

interface NearbyBucket {
  label: string;
  source: string;
  radius_meters: number;
  count: number;
  places: {
    name: string;
    address: string | null;
    distance_meters: number | null;
    categories: string[];
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
  geocode_display_name: string | null;
  geocode_found: boolean;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const EFFECTIVE_RADIUS_METERS = 1000;
const MIN_REASONABLE_MONTHLY_RENT = 500;

const BUCKET_CAPS = {
  schools: 5,
  groceries: 5,
  restaurants: 15,
  cafes: 10,
  parks: 5,
  pharmacies: 5,
  transit: 10,
} as const;

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

// ── Data loading ─────────────────────────────────────────────────────────────

let cachedListings: Listing[] | null = null;

async function loadListings(): Promise<Listing[]> {
  if (cachedListings) return cachedListings;

  const filePath = path.join(process.cwd(), "data", "rentfaster-listings.combined.json");
  const raw = await readFile(filePath, "utf8");
  const items: RawListing[] = JSON.parse(raw);

  cachedListings = items
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .filter((item) => Boolean(item.url))
    .filter((item) => parsePrice(item.price) >= MIN_REASONABLE_MONTHLY_RENT)
    .map((item): Listing => {
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

      return {
        id: `rf-${item.listing_id}`,
        url: item.url ?? undefined,
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
      };
    })
    .sort((a, b) => b.score - a.score);

  return cachedListings;
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

function buildAmenityLabels(
  counts: Partial<Record<keyof typeof BUCKET_CAPS, number>>,
): string[] {
  const labels: string[] = [];
  if ((counts.schools ?? 0) > 0) labels.push(`${counts.schools} schools nearby (1km)`);
  if ((counts.groceries ?? 0) > 0) labels.push(`${counts.groceries} grocery stores (1km)`);
  if ((counts.restaurants ?? 0) > 0) labels.push(`${counts.restaurants} restaurants (1km)`);
  if ((counts.cafes ?? 0) > 0) labels.push(`${counts.cafes} cafes (1km)`);
  if ((counts.parks ?? 0) > 0) labels.push(`${counts.parks} parks (1km)`);
  if ((counts.pharmacies ?? 0) > 0) labels.push(`${counts.pharmacies} pharmacies (1km)`);
  if ((counts.transit ?? 0) > 0) labels.push(`${counts.transit} transit stops (1km)`);
  return labels;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const listings = await loadListings();
    return NextResponse.json(listings);
  } catch (error) {
    console.error("Failed to load listings:", error);
    return NextResponse.json({ error: "Failed to load listings" }, { status: 500 });
  }
}

// Export for internal reuse by the suggestions route
export { loadListings };
