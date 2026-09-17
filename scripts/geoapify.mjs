// Same buckets/radii as the old data/livability-sources.json + clean-combined-listings.mjs.
export const BUCKETS = [
  { id: "schools", label: "Schools", categories: "education.school", radius: 500 },
  { id: "groceries", label: "Groceries", categories: "commercial.supermarket", radius: 1000 },
  { id: "restaurants", label: "Restaurants", categories: "catering.restaurant", radius: 1000 },
  { id: "cafes", label: "Cafes", categories: "catering.cafe", radius: 1000 },
  { id: "parks", label: "Parks", categories: "leisure.park", radius: 1000 },
  { id: "pharmacies", label: "Pharmacies", categories: "healthcare.pharmacy", radius: 1000 },
  { id: "transit", label: "Transit", categories: "public_transport", radius: 1000 },
];
const LIMIT = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, fetchImpl) {
  let res = await fetchImpl(url);
  if (res.status === 429) {
    await sleep(2000);
    res = await fetchImpl(url);
  }
  if (!res.ok) throw new Error(`geoapify HTTP ${res.status}`);
  return res.json();
}

export async function fetchNearby(lat, lng, { apiKey, fetchImpl = fetch, delayMs = 250 }) {
  const nearby = {};
  for (const b of BUCKETS) {
    const url =
      `https://api.geoapify.com/v2/places?categories=${b.categories}` +
      `&filter=circle:${lng},${lat},${b.radius}&bias=proximity:${lng},${lat}` +
      `&limit=${LIMIT}&apiKey=${apiKey}`;
    const data = await getJson(url, fetchImpl);
    const places = (data.features ?? []).map((f) => ({
      name: f.properties?.name ?? "Unnamed",
      address: f.properties?.formatted ?? null,
      distance_meters: Number.isFinite(f.properties?.distance) ? f.properties.distance : null,
      categories: f.properties?.categories ?? [],
    }));
    nearby[b.id] = { label: b.label, source: "geoapify", radius_meters: b.radius, count: places.length, places };
    if (delayMs) await sleep(delayMs);
  }
  return nearby;
}
