import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Listing, ScoreBand } from "@/lib/avenuex-data";

// ── Types for the scraped JSON ──────────────────────────────────────────────

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
  address: string | null;
  city: string | null;
  province: string | null;
  community: string | null;
  price: string | null;
  photo: string | null;
  photo_large: string | null;
  beds: string | null;
  den: string | null;
  baths: string | null;
  sqft: string | null;
  property_type: string | null;
  lat: string | number | null;
  lng: string | number | null;
  availability: string | null;
  lease_term: string | null;
  pets: "pets_ok" | "cats_ok" | "dogs_ok" | "no_pets" | null;
  smoking: string | null;
  utilities_included: string[];
  features: string[];
  date_listed: string | null;
  // Legacy fields from enriched data (optional)
  nearby?: {
    schools?: NearbyBucket;
    groceries?: NearbyBucket;
    restaurants?: NearbyBucket;
    cafes?: NearbyBucket;
    parks?: NearbyBucket;
    pharmacies?: NearbyBucket;
    transit?: NearbyBucket;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function parsePrice(raw: string | null | undefined): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^0-9]/g, "");
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseNum(raw: string | number | null | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function extractCity(item: RawListing): string {
  if (item.city) return `${item.city}, ON`;
  if (!item.location) return "Toronto, ON";
  const parts = item.location.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "Toronto";
  return `${city}, ON`;
}

function extractAddress(item: RawListing): string {
  if (item.address) return item.address;
  if (!item.location) return "Unknown address";
  const parts = item.location.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[0] ?? item.location;
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

function mapPropertyType(raw: string | null | undefined): Listing["propertyType"] {
  const normalized = (raw ?? "").toLowerCase();
  if (normalized.includes("condo")) return "Condo";
  if (normalized.includes("house") || normalized.includes("town")) return "House";
  return "Apartment";
}

function buildAmenities(item: RawListing, nearbyCounts: Record<string, number>): string[] {
  const amenities: string[] = [];

  // Building features from the scraper
  if (item.features && item.features.length > 0) {
    amenities.push(...item.features);
  }

  // Pet policy
  if (item.pets === "pets_ok") amenities.push("Pet-friendly");
  else if (item.pets === "cats_ok") amenities.push("Cats OK");
  else if (item.pets === "dogs_ok") amenities.push("Dogs OK");
  else if (item.pets === "no_pets") amenities.push("No pets");

  // Utilities
  if (item.utilities_included && item.utilities_included.length > 0) {
    amenities.push(`Utilities: ${item.utilities_included.join(", ")}`);
  }

  // Den
  if (item.den === "Yes") amenities.push("Den");

  // Nearby counts (from enriched data, if available)
  if (nearbyCounts.schools > 0) amenities.push(`${nearbyCounts.schools} schools nearby (1km)`);
  if (nearbyCounts.groceries > 0) amenities.push(`${nearbyCounts.groceries} grocery stores (1km)`);
  if (nearbyCounts.parks > 0) amenities.push(`${nearbyCounts.parks} parks (1km)`);
  if (nearbyCounts.transit > 0) amenities.push(`${nearbyCounts.transit} transit stops (1km)`);

  return amenities;
}

// ── Data loading ─────────────────────────────────────────────────────────────

let cachedListings: Listing[] | null = null;

async function loadListings(): Promise<Listing[]> {
  if (cachedListings) return cachedListings;

  const filePath = path.join(process.cwd(), "data", "rentfaster-listings.merged.json");
  const raw = await readFile(filePath, "utf8");
  const items: RawListing[] = JSON.parse(raw);

  cachedListings = items
    .filter((item) => {
      const lat = parseNum(item.lat);
      const lng = parseNum(item.lng);
      return lat !== 0 && lng !== 0;
    })
    .map((item): Listing => {
      const monthlyRent = parsePrice(item.price);
      const city = extractCity(item);
      const address = extractAddress(item);
      const lat = parseNum(item.lat);
      const lng = parseNum(item.lng);

      // Vitality scoring from nearby data (if enriched data is present)
      const nearby = item.nearby ?? {};
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

      const nearbyCounts = {
        schools: schoolsCount,
        groceries: groceriesCount,
        restaurants: restaurantsCount,
        cafes: cafesCount,
        parks: parksCount,
        pharmacies: pharmaciesCount,
        transit: transitCount,
      };

      return {
        id: `rf-${item.listing_id}`,
        address,
        city,
        fullAddress: item.location ?? address,
        monthlyRent,
        priceLabel: `$${monthlyRent.toLocaleString()}/mo`,
        shortPrice: formatShortPrice(monthlyRent),
        beds: parseNum(item.beds),
        baths: parseNum(item.baths),
        sqft: parseNum(item.sqft),
        propertyType: mapPropertyType(item.property_type),
        score,
        scoreStatus: deriveStatus(scoreBand),
        scoreBand,
        image: item.photo ?? "",
        pinX: "50%",
        pinY: "50%",
        lat,
        lng,
        availableDate: item.availability ?? "Available now",
        leaseTerm: item.lease_term ?? "12 months",
        about: item.title ?? "",
        amenities: buildAmenities(item, nearbyCounts),
        categoryScores: { foodDrink, health, groceryParks, education, emergency },
        incomeNeeded: computeIncomeNeeded(monthlyRent),
      };
    });

  return cachedListings;
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
