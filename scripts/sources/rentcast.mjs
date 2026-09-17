// San Francisco listings from RentCast (https://developers.rentcast.io). One call per run.
const ENDPOINT = "https://api.rentcast.io/v1/listings/rental";

export function normalizeRentcast(r) {
  const lat = Number(r.latitude);
  const lng = Number(r.longitude);
  const monthlyRent = Math.round(Number(r.price));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !monthlyRent) return null;
  const fullAddress = r.formattedAddress ?? "";
  return {
    id: `rc-${r.id ?? fullAddress}`,
    source: "rentcast",
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`,
    address: r.addressLine1 ?? fullAddress.split(",")[0] ?? "Unknown address",
    fullAddress,
    lat,
    lng,
    monthlyRent,
    beds: Number.isFinite(r.bedrooms) ? r.bedrooms : null,
    baths: Number.isFinite(r.bathrooms) ? r.bathrooms : null,
    sqft: Number.isFinite(r.squareFootage) ? r.squareFootage : null,
    propertyType: r.propertyType ?? null,
    photo: null, // RentCast has no photos; the app falls back to a Mapbox static image
    available: "Available now",
    leaseTerm: null,
    amenities: [],
  };
}

export async function fetchRentcast({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("RENTCAST_API_KEY is required for --city sf");
  const url = `${ENDPOINT}?city=San%20Francisco&state=CA&status=Active&limit=500`;
  const res = await fetchImpl(url, { headers: { accept: "application/json", "X-Api-Key": apiKey } });
  if (!res.ok) throw new Error(`rentcast HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.map(normalizeRentcast).filter(Boolean);
}
