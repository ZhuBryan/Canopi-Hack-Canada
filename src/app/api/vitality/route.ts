import { NextResponse } from "next/server";
import { Amenity } from "@/lib/types";

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
  const radius = 500; // Search radius in meters

  // Overpass QL Query: Finding cafes, groceries, transit, and healthcare (clinics)
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["amenity"="cafe"](around:${radius},${lat},${lng});
      node["shop"="supermarket"](around:${radius},${lat},${lng});
      node["shop"="convenience"](around:${radius},${lat},${lng});
      node["highway"="bus_stop"](around:${radius},${lat},${lng});
      node["amenity"="clinic"](around:${radius},${lat},${lng});
      node["amenity"="hospital"](around:${radius},${lat},${lng});
      node["amenity"="pharmacy"](around:${radius},${lat},${lng});
      node["leisure"="park"](around:${radius},${lat},${lng});
    );
    out center;
  `;

  try {
    const response = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
        overpassQuery
      )}`
    );

    if (!response.ok) {
      throw new Error(`Overpass API responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    let rawScore = 0;
    const maxPossibleScore = 150; // Arbitrary cap for calculation
    
    const amenities: Amenity[] = data.elements
      .map((el: any): Amenity | null => {
        if (!el.tags || !el.tags.name) return null; // Skip unnamed nodes
        
        // Determine type based on OSM tags
        let type: Amenity["type"] = "other";
        let weight = 0;

        if (el.tags.amenity === "cafe") {
          type = "cafe";
          weight = 10;
        } else if (el.tags.shop === "supermarket" || el.tags.shop === "convenience") {
          type = "grocery";
          weight = 15;
        } else if (el.tags.highway === "bus_stop") {
          type = "transit";
          weight = 10;
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
        const dLat = (el.lat - lat) * 111000;
        const dLng = (el.lon - lng) * 82000; // approx for ~43 deg N
        const distance = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));

        return {
          id: el.id.toString(), // We keep ID just in case
          name: el.tags.name,
          type,
          coords: [el.lat, el.lon], // [lat, lng]
          distance,
        };
      })
      .filter(Boolean) as Amenity[]; // Filter out nulls (unnamed/unmapped)

    // Deduplicate amenities (sometimes Overpass returns dups for multiple nodes in same building)
    const uniqueAmenities = Array.from(new Map(amenities.map(a => [a.name, a])).values());

    // Final Score Calculation (0-100 curve)
    // We curve it so 0 amenities = 0 score, but ~8 good places = 100 score.
    const scoreFraction = Math.min(rawScore / maxPossibleScore, 1.0);
    const vitalityScore = Math.round(scoreFraction * 100);

    // Limit to top 15 closest/most relevant (in reality we'd sort by distance, here we just array slice for speed)
    const topAmenities = uniqueAmenities.slice(0, 15);

    return NextResponse.json({
      vitalityScore,
      amenities: topAmenities,
    });
  } catch (error) {
    console.error("Overpass API Error:", error);
    // Return a mock fallback if Overpass rate-limits us (common in hackathons)
    return NextResponse.json(
      { 
        error: "Failed to fetch top tier data, using fallback", 
        vitalityScore: 45, 
        amenities: [] 
      },
      { status: 500 }
    );
  }
}
