import { NextResponse } from "next/server";
import { DEFAULT_CITY, isCitySlug } from "@/lib/cities";
import { loadListings } from "@/lib/listings-db";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("city");
  const city = raw === "all" ? "all" : isCitySlug(raw) ? raw : DEFAULT_CITY;
  try {
    return NextResponse.json(await loadListings(city), {
      // Matches the in-process TTL in listings-db: a reload or a city switch back
      // should not re-download ~1 MB of JSON.
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("Failed to load listings:", error);
    return NextResponse.json({ error: "Failed to load listings" }, { status: 500 });
  }
}
