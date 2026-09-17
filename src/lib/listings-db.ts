import { supabase } from "@/lib/supabase";
import { CITIES, type CitySlug } from "@/lib/cities";
import { rowToListing, type DbRow, BUCKET_KEYS } from "@/lib/listing-score";
import type { Listing } from "@/lib/avenuex-data";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<CitySlug, { at: number; listings: Listing[] }>();

const COLUMNS =
  "id,city,source,url,address,full_address,lat,lng,monthly_rent,beds,baths,sqft,property_type,photo,available,lease_term,amenities," +
  BUCKET_KEYS.map((k) => `${k}:nearby->${k}->count`).join(",");

async function loadCity(slug: CitySlug): Promise<Listing[]> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.listings;
  if (!supabase) throw new Error("Supabase is not configured");

  const rows: DbRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("listings").select(COLUMNS).eq("city", slug).eq("active", true).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as unknown as DbRow[]));
    if (data.length < 1000) break;
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const listings = rows.map((row) => rowToListing(row, CITIES[slug], token)).sort((a, b) => b.score - a.score);
  cache.set(slug, { at: Date.now(), listings });
  return listings;
}

export async function loadListings(city: CitySlug | "all"): Promise<Listing[]> {
  if (city === "all") {
    const all = await Promise.all((Object.keys(CITIES) as CitySlug[]).map(loadCity));
    return all.flat().sort((a, b) => b.score - a.score);
  }
  return loadCity(city);
}
