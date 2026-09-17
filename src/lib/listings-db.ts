import { supabase } from "@/lib/supabase";
import { CITIES, type CitySlug } from "@/lib/cities";
import { rowToListing, type DbRow } from "@/lib/listing-score";
import type { Listing } from "@/lib/avenuex-data";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<CitySlug, { at: number; listings: Listing[] }>();

async function loadCity(slug: CitySlug): Promise<Listing[]> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.listings;
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.from("listings").select("*").eq("city", slug).eq("active", true);
  if (error) throw error;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const listings = (data as DbRow[]).map((row) => rowToListing(row, CITIES[slug], token)).sort((a, b) => b.score - a.score);
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
