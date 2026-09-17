// Toronto listings from RentFaster's public map endpoint (verified 2026-09-17:
// plain HTTPS, 500 per page, no auth). city_id=7 is Toronto.
import https from "node:https";

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

function parkingLabel(kind) {
  const k = String(kind).toLowerCase();
  if (k === "underground") return "Underground parking";
  if (k === "garage") return "Garage";
  if (k === "street") return "Street parking";
  return `${kind[0].toUpperCase()}${kind.slice(1)} parking`;
}

function petsLabel(cats, dogs) {
  if (cats && dogs) return "Pet-friendly";
  if (cats) return "Cats OK";
  if (dogs) return "Dogs OK";
  return "No pets";
}

// Brace-walk from the first `{"ref_id":` to its matching `}`, tracking quote
// state so braces inside strings don't throw off the depth count.
function extractRefIdObject(html) {
  const start = html.indexOf('{"ref_id":');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

export function parseRentfasterDetail(html) {
  const json = extractRefIdObject(html);
  if (!json) return null;
  let d;
  try {
    d = JSON.parse(json);
  } catch {
    return null;
  }
  const sqftMatch = String(d.sq_feet ?? "").match(/\d+/);
  const amenities = [];
  for (const f of d.features ?? []) amenities.push(f);
  for (const p of d.parking ?? []) amenities.push(parkingLabel(p));
  amenities.push(petsLabel(d.cats, d.dogs));
  for (const u of d.utilities_included ?? []) amenities.push(`${u} included`);
  return {
    sqft: sqftMatch ? parseInt(sqftMatch[0], 10) : null,
    amenities: [...new Set(amenities)],
    leaseTerm: d.lease_term || null,
    photo: d.slide || null,
    description: d.title || null,
  };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DETAIL_TIMEOUT_MS = 20_000;

// Node's built-in `fetch` (undici) gets Cloudflare-challenged (`cf-mitigated: challenge`)
// on rentfaster.ca/properties/* almost every time; node:https (HTTP/1.1) gets through
// much more often from the same IP. status 0 means the request errored/timed out.
function httpsGet(url) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = https.get(url, { headers: { "user-agent": UA, accept: "text/html" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => done({ status: res.statusCode, body, location: res.headers.location }));
    });
    req.on("error", () => done({ status: 0, body: "" }));
    // `destroy()` alone doesn't guarantee an `error`/`end` event fires — resolve here too.
    req.setTimeout(DETAIL_TIMEOUT_MS, () => {
      req.destroy();
      done({ status: 0, body: "" });
    });
  });
}

// getImpl (test seam): (url) => Promise<{status, body, location?}>.
// onStatus (optional) reports each response's HTTP status so callers can react to
// e.g. a 403 (Cloudflare challenge) without changing this function's return shape.
export async function fetchRentfasterDetail(url, { getImpl = httpsGet, onStatus } = {}) {
  try {
    let current = url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const { status, body, location } = await getImpl(current);
      onStatus?.(status);
      if (REDIRECT_STATUSES.has(status) && location && redirects < 3) {
        current = new URL(location, current).href;
        continue;
      }
      if (status !== 200) return null;
      return parseRentfasterDetail(body);
    }
    return null;
  } catch {
    return null;
  }
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
