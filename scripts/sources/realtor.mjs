// Key a RentCast listing to its Realtor.com rental page. RentCast gives no listing URL, but
// Realtor.com's address autocomplete (the endpoint its own search box calls; undocumented,
// no key) returns the property id, and the rental page URL is built from that id.
// Verified 2026-09-30: 8/8 sampled SF listings resolved (6 to the unit, 2 to the building
// when RentCast has no unit). The page is then read once for its lead photo and amenities (best effort).
const SUGGEST = "https://parser-external.geo.moveaws.com/suggest";

// Unit designators are dropped so "Apt 5", "Unit 5" and "#5" compare equal (Realtor writes
// "338 Spear St Unit 5B" where RentCast has "338 Spear St, #5B"):
// "637 Natoma St, Apt 5" -> "637 natoma st 5"
export const normLine = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(apt|unit|ste|suite)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "637 Natoma St, Apt 5, San Francisco, CA 94103" -> { line: "637 Natoma St Apt 5", zip: "94103" }
export function splitAddress(fullAddress) {
  const parts = String(fullAddress).split(",").map((s) => s.trim());
  if (parts.length < 3) return null;
  const zip = parts.at(-1).split(/\s+/).at(-1);
  if (!/^\d{5}$/.test(zip)) return null;
  return { line: parts.slice(0, -2).join(" "), zip };
}

// Realtor.com finds the page by the M-id; the slug only has to look like theirs.
export function realtorRentalUrl(hit) {
  const id = String(hit.mpr_id);
  const slug = [hit.line, hit.city, hit.state_code, hit.postal_code].map((s) => String(s).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")).join("_");
  return `https://www.realtor.com/rentals/details/${slug}_M${id.slice(0, 5)}-${id.slice(5)}`;
}

// A hit only counts when it is the same address line (unit included) and zip, and is listed for rent.
export function pickRentalHit(autocomplete, { line, zip }) {
  const want = normLine(line);
  return (autocomplete ?? []).find(
    (h) => h.mpr_id && normLine(h.line) === want && h.postal_code === zip && (h.prop_status ?? []).includes("for_rent")
  ) ?? null;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36";
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim();

// og:image is the listing's lead photo; amenities are the <li>s under "Amenities and Community Features".
export function parseRealtorPage(html) {
  const photo = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
  const at = html.indexOf("Amenities and Community Features");
  const list = at === -1 ? "" : html.slice(at, html.indexOf("</ul>", at));
  const amenities = [...list.matchAll(/<li[^>]*>([^<]+)<\/li>/g)].map((m) => decode(m[1])).filter(Boolean);
  return { photo, amenities: amenities.length ? amenities : null };
}

// Same contract as fetchRentfasterDetail: resolves to a detail object ({ url }) or null, never throws.
export async function resolveRealtorUrl(fullAddress, { fetchImpl = fetch, onStatus } = {}) {
  const addr = splitAddress(fullAddress);
  if (!addr) return null;
  try {
    const input = encodeURIComponent(fullAddress.replace(/,/g, ""));
    const res = await fetchImpl(`${SUGGEST}?client_id=rdc-home&area_types=address&limit=5&input=${input}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000), // normally answers in well under a second
    });
    onStatus?.(res.status);
    if (!res.ok) return null;
    const hit = pickRentalHit((await res.json()).autocomplete, addr);
    if (!hit) return null;
    const url = realtorRentalUrl(hit);
    // The page is only a bonus (photo + amenities): if it is blocked or odd, the link alone still counts.
    try {
      const page = await fetchImpl(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
      if (page.ok) return { url, ...parseRealtorPage(await page.text()) };
    } catch {}
    return { url };
  } catch {
    onStatus?.(0);
    return null;
  }
}
