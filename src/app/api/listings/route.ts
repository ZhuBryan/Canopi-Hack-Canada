import { NextResponse } from "next/server";
import { DEFAULT_CITY, isCitySlug } from "@/lib/cities";
import { loadListings } from "@/lib/listings-db";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("city");
  const city = raw === "all" ? "all" : isCitySlug(raw) ? raw : DEFAULT_CITY;
  try {
    return NextResponse.json(await loadListings(city));
  } catch (error) {
    console.error("Failed to load listings:", error);
    return NextResponse.json({ error: "Failed to load listings" }, { status: 500 });
  }
}
