// Toronto listings from RentFaster's public map endpoint (verified 2026-09-17:
// plain HTTPS, 500 per page, no auth). city_id=7 is Toronto.
const BASE = "https://www.rentfaster.ca";
const CITY_ID = 7;
const PAGE_SIZE = 500;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36";

function toInt(v) {
  if (v == null) return null;
  if (/studio/i.test(String(v))) return 0;
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toFloat(v) {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizeRentfaster(r) {
  if (r.city !== "Toronto") return null; // pages bleed a few Calgary rows
  const lat = toFloat(r.latitude);
  const lng = toFloat(r.longitude);
  const monthlyRent = toInt(r.price);
  if (lat == null || lng == null || !monthlyRent) return null;
  const address = (r.intro ?? r.title ?? "").trim() || "Unknown address";
  return {
    id: `rf-${r.id}`,
    source: "rentfaster",
    url: r.link ? `${BASE}${r.link}` : null,
    address,
    fullAddress: `${address}, Toronto`,
    lat,
    lng,
    monthlyRent,
    beds: toInt(r.beds),
    baths: toFloat(r.baths),
    sqft: null,
    propertyType: r.type ?? null,
    photo: r.thumb2 ?? null,
    available: r.availability ?? null,
    leaseTerm: null,
    amenities: [],
  };
}

export async function fetchRentfaster() {
  const out = [];
  for (let page = 0; ; page++) {
    const res = await fetch(`${BASE}/api/map.json?city_id=${CITY_ID}&cur_page=${page}`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`rentfaster page ${page}: HTTP ${res.status}`);
    const { listings = [] } = await res.json();
    for (const r of listings) {
      const row = normalizeRentfaster(r);
      if (row) out.push(row);
    }
    if (listings.length < PAGE_SIZE) break;
  }
  return out;
}
