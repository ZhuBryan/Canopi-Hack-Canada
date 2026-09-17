import { NextResponse } from "next/server";
import { DEFAULT_CITY, isCitySlug } from "@/lib/cities";
import { loadListings } from "@/lib/listings-db";
import { BUCKET_CAPS, BUCKET_KEYS, type BucketKey } from "@/lib/listing-score";
import type { Listing } from "@/lib/avenuex-data";

type Weights = Record<BucketKey, number>;

const BUCKET_LABELS: Record<BucketKey, string> = {
  schools: "Schools",
  groceries: "Groceries",
  restaurants: "Restaurants",
  cafes: "Cafes",
  parks: "Parks",
  pharmacies: "Pharmacies",
  transit: "Transit",
};

function parseWeight(raw: string | null): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 5;
}

function normalized(listing: Listing, key: BucketKey): number {
  const count = listing.nearbyServices?.[key] ?? 0;
  return Math.min(count, BUCKET_CAPS[key]) / BUCKET_CAPS[key];
}

function computePersonalScore(listing: Listing, weights: Weights): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of BUCKET_KEYS) {
    const w = weights[key];
    if (w <= 0) continue;
    weightedSum += w * normalized(listing, key);
    totalWeight += w;
  }
  return totalWeight === 0 ? 0 : Math.round((weightedSum / totalWeight) * 100);
}

function buildMatchReason(listing: Listing, weights: Weights): string {
  const top = BUCKET_KEYS.map((key) => ({ key, contribution: weights[key] * normalized(listing, key) }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .filter((s) => s.contribution > 0);
  if (top.length === 0) return "Limited data for your priorities";
  return `Strong ${top.map((s) => BUCKET_LABELS[s.key].toLowerCase()).join(" and ")} access`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cityParam = searchParams.get("city");
    const city = isCitySlug(cityParam) ? cityParam : DEFAULT_CITY;
    const maxRent = searchParams.has("maxRent") ? parseInt(searchParams.get("maxRent")!, 10) : Infinity;
    const weights = Object.fromEntries(BUCKET_KEYS.map((k) => [k, parseWeight(searchParams.get(`w_${k}`))])) as Weights;

    const results = (await loadListings(city))
      .filter((l) => (Number.isFinite(maxRent) ? l.monthlyRent <= maxRent : true))
      .map((l) => ({ ...l, personalScore: computePersonalScore(l, weights), matchReason: buildMatchReason(l, weights) }))
      .sort((a, b) => b.personalScore - a.personalScore);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to compute suggestions:", error);
    return NextResponse.json({ error: "Failed to compute suggestions" }, { status: 500 });
  }
}
