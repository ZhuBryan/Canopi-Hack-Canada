import type { Listing, ScoreBand } from "./avenuex-data";
import type { CityConfig } from "./cities";

export type NearbyBucket = {
  label?: string;
  source?: string;
  radius_meters?: number;
  count?: number;
  places?: { name?: string; address?: string | null; distance_meters: number | null; categories?: string[] }[];
};

export type DbRow = {
  id: string;
  city: string;
  source: string;
  url: string | null;
  address: string;
  full_address: string;
  lat: number;
  lng: number;
  monthly_rent: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  property_type: string | null;
  photo: string | null;
  available: string | null;
  lease_term: string | null;
  amenities: string[];
  nearby: Partial<Record<BucketKey, NearbyBucket>>;
};

export const BUCKET_CAPS = {
  schools: 5,
  groceries: 5,
  restaurants: 15,
  cafes: 10,
  parks: 5,
  pharmacies: 5,
  transit: 10,
} as const;
export type BucketKey = keyof typeof BUCKET_CAPS;
export const BUCKET_KEYS = Object.keys(BUCKET_CAPS) as BucketKey[];

const EFFECTIVE_RADIUS_METERS = 1000;

export function countWithinRadius(bucket: NearbyBucket | undefined): number {
  if (!bucket) return 0;
  if (Array.isArray(bucket.places) && bucket.places.length > 0) {
    return bucket.places.filter(
      (p) => Number.isFinite(p.distance_meters) && (p.distance_meters ?? Infinity) <= EFFECTIVE_RADIUS_METERS,
    ).length;
  }
  return bucket.count ?? 0;
}

export function bucketScore(key: BucketKey, count: number): number {
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
  return rent >= 1000 ? `$${(rent / 1000).toFixed(1)}K` : `$${rent}`;
}

function mapPropertyType(raw: string | null | undefined): Listing["propertyType"] {
  const n = (raw ?? "").toLowerCase();
  if (n.includes("condo")) return "Condo";
  if (n.includes("house") || n.includes("town") || n.includes("family")) return "House";
  return "Apartment";
}

function staticMapImage(lat: number, lng: number, token: string): string {
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+d97706(${lng},${lat})/${lng},${lat},15,0/600x400@2x?access_token=${token}`;
}

export function rowToListing(row: DbRow, city: CityConfig, mapboxToken: string): Listing {
  const nearby = row.nearby ?? {};
  const counts = Object.fromEntries(BUCKET_KEYS.map((k) => [k, countWithinRadius(nearby[k])])) as Record<BucketKey, number>;

  const foodDrink = Math.round((bucketScore("restaurants", counts.restaurants) + bucketScore("cafes", counts.cafes)) / 2);
  const health = bucketScore("pharmacies", counts.pharmacies);
  const groceryParks = Math.round((bucketScore("groceries", counts.groceries) + bucketScore("parks", counts.parks)) / 2);
  const education = bucketScore("schools", counts.schools);
  const emergency = Math.round(health * 0.6 + bucketScore("transit", counts.transit) * 0.4);
  const score = Math.round((foodDrink + health + groceryParks + education + emergency) / 5);
  const scoreBand = deriveBand(score);
  const monthlyRent = row.monthly_rent;

  return {
    id: row.id,
    url: row.url ?? undefined,
    address: row.address,
    city: `${city.label}, ${city.region}`,
    fullAddress: row.full_address,
    monthlyRent,
    priceLabel: `$${monthlyRent.toLocaleString("en-US")}/mo`,
    shortPrice: formatShortPrice(monthlyRent),
    beds: row.beds ?? 1,
    baths: row.baths ?? 1,
    sqft: row.sqft ?? 0,
    propertyType: mapPropertyType(row.property_type),
    score,
    scoreStatus: deriveStatus(scoreBand),
    scoreBand,
    image: row.photo ?? staticMapImage(row.lat, row.lng, mapboxToken),
    pinX: "50%",
    pinY: "50%",
    lat: row.lat,
    lng: row.lng,
    availableDate: row.available ?? "Available now",
    leaseTerm: row.lease_term ?? "12 months",
    about: row.address,
    amenities: row.amenities ?? [],
    nearbyServices: counts,
    categoryScores: { foodDrink, health, groceryParks, education, emergency },
    bathsLabel: row.baths != null ? `${row.baths} ba` : undefined,
    incomeNeeded: Math.round(((monthlyRent / 0.3) * 12) / 1000) * 1000,
  };
}
