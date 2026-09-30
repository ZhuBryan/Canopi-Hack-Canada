import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeRentfaster, parseRentfasterDetail, fetchRentfasterDetail } from "./sources/rentfaster.mjs";
import { cellKey, toRow, planEnrichment, planDetail, takeDetailIds, mergeDetail, hasPlaceCoords, isBlockedStatus } from "./sync-listings.mjs";
import { resolveRealtorUrl, pickRentalHit } from "./sources/realtor.mjs";

const RF_RECORD = {
  id: 593209,
  city: "Toronto",
  availability: "Immediate",
  latitude: 43.6532,
  longitude: -79.3832,
  link: "/properties/10-bergamot-ave-toronto-593209",
  thumb2: "https://rf-images-prod-bcdn.rentfaster.ca/593209/thumber_1.jpg",
  type: "Apartment",
  price: "2160",
  title: "Ask Us About Free Early Move In!",
  intro: "10 Bergamot Ave",
  beds: "1",
  baths: "1.5",
};

test("normalizeRentfaster maps a map.json record to a RawListing", () => {
  const row = normalizeRentfaster(RF_RECORD);
  assert.deepEqual(row, {
    id: "rf-593209",
    source: "rentfaster",
    url: "https://www.rentfaster.ca/properties/10-bergamot-ave-toronto-593209",
    address: "10 Bergamot Ave",
    fullAddress: "10 Bergamot Ave, Toronto",
    lat: 43.6532,
    lng: -79.3832,
    monthlyRent: 2160,
    beds: 1,
    baths: 1.5,
    sqft: null,
    propertyType: "Apartment",
    photo: "https://rf-images-prod-bcdn.rentfaster.ca/593209/thumber_1.jpg",
    available: "Immediate",
    leaseTerm: null,
    amenities: [],
  });
});

test("normalizeRentfaster treats Studio as 0 beds and drops non-Toronto / unpriced rows", () => {
  assert.equal(normalizeRentfaster({ ...RF_RECORD, beds: "Studio" }).beds, 0);
  assert.equal(normalizeRentfaster({ ...RF_RECORD, city: "Calgary" }), null);
  assert.equal(normalizeRentfaster({ ...RF_RECORD, price: "" }), null);
  assert.equal(normalizeRentfaster({ ...RF_RECORD, latitude: null }), null);
});

import { fetchNearby, BUCKETS } from "./geoapify.mjs";

test("fetchNearby builds one bucket per category from Geoapify features", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          {
            properties: { name: "Cafe A", formatted: "1 Main St", distance: 120, categories: ["catering.cafe"], lat: 43.651, lon: -79.381 },
            geometry: { type: "Point", coordinates: [-79.381, 43.651] },
          },
        ],
      }),
    };
  };
  const nearby = await fetchNearby(43.65, -79.38, { apiKey: "k", fetchImpl, delayMs: 0 });
  assert.equal(calls.length, BUCKETS.length);
  assert.ok(calls.some((u) => /filter=circle:-79\.38,43\.65,500/.test(u))); // schools radius 500, fired concurrently
  assert.equal(nearby.cafes.count, 1);
  assert.deepEqual(nearby.cafes.places[0], {
    name: "Cafe A", address: "1 Main St", distance_meters: 120, categories: ["catering.cafe"],
    lat: 43.651, lon: -79.381,
  });
  assert.equal(nearby.cafes.radius_meters, 1000);
});

import { normalizeRentcast } from "./sources/rentcast.mjs";

test("normalizeRentcast maps a RentCast rental listing to a RawListing", () => {
  const row = normalizeRentcast({
    id: "123-Main-St,-San-Francisco,-CA-94105",
    formattedAddress: "123 Main St, San Francisco, CA 94105",
    addressLine1: "123 Main St",
    latitude: 37.7912,
    longitude: -122.3934,
    propertyType: "Condo",
    bedrooms: 2,
    bathrooms: 1.5,
    squareFootage: 900,
    price: 4200,
    status: "Active",
    listedDate: "2026-09-01T00:00:00.000Z",
  });
  assert.deepEqual(row, {
    id: "rc-123-Main-St,-San-Francisco,-CA-94105",
    source: "rentcast",
    url: "https://www.google.com/search?q=123%20Main%20St%2C%20San%20Francisco%2C%20CA%2094105%20for%20rent",
    address: "123 Main St",
    fullAddress: "123 Main St, San Francisco, CA 94105",
    lat: 37.7912,
    lng: -122.3934,
    monthlyRent: 4200,
    beds: 2,
    baths: 1.5,
    sqft: 900,
    propertyType: "Condo",
    photo: null,
    available: "Available now",
    leaseTerm: null,
    amenities: [],
  });
  assert.equal(normalizeRentcast({ formattedAddress: "x", latitude: 1, longitude: 2, price: 0 }), null);
});

const RAW = {
  id: "rf-1", source: "rentfaster", url: "https://x/1", address: "1 A St", fullAddress: "1 A St, Toronto",
  lat: 43.65321, lng: -79.38329, monthlyRent: 2000, beds: 1, baths: 1, sqft: null,
  propertyType: "Apartment", photo: null, available: "Immediate", leaseTerm: null, amenities: [],
};

test("cellKey rounds to ~100 m", () => {
  assert.equal(cellKey(43.65321, -79.38329), "43.653|-79.383");
  assert.equal(cellKey(43.65349, -79.38251), "43.653|-79.383");
});

test("toRow maps RawListing to a listings row", () => {
  const row = toRow(RAW, "toronto", { cafes: { count: 2 } });
  assert.equal(row.id, "rf-1");
  assert.equal(row.city, "toronto");
  assert.equal(row.full_address, "1 A St, Toronto");
  assert.equal(row.monthly_rent, 2000);
  assert.deepEqual(row.nearby, { cafes: { count: 2 } });
  assert.equal(row.active, true);
  assert.equal(typeof row.seen_at, "string");
});

const NEARBY_WITH_COORDS = { cafes: { count: 1, places: [{ name: "Cafe A", lat: 43.6534, lon: -79.383 }] } };

test("planEnrichment reuses a neighbour's nearby and caps fresh fetches", () => {
  const existing = new Map([["rf-old", { lat: 43.65340, lng: -79.38300, nearby: NEARBY_WITH_COORDS }]]);
  const raws = [
    RAW,                                              // same cell as rf-old → reuse
    { ...RAW, id: "rf-2", lat: 43.70, lng: -79.40 },  // new cell → fresh
    { ...RAW, id: "rf-3", lat: 43.71, lng: -79.41 },  // new cell → over limit
    { ...RAW, id: "rf-old" },                          // already in DB → skip
  ];
  const plan = planEnrichment(raws, existing, 1);
  assert.deepEqual(plan.reuse.get("rf-1"), NEARBY_WITH_COORDS);
  assert.deepEqual(plan.fresh, ["rf-2"]);
  assert.equal(plan.reuse.has("rf-old"), false);
});

test("planEnrichment re-enriches an existing row whose nearby is still empty", () => {
  // rf-old is already in the DB but was never enriched (nearby: {}); no cell neighbour exists.
  const existing = new Map([["rf-old", { lat: 43.65321, lng: -79.38329, nearby: {} }]]);
  const raws = [{ ...RAW, id: "rf-old" }];
  const plan = planEnrichment(raws, existing, 10);
  assert.ok(plan.fresh.includes("rf-old"));
});

test("planEnrichment re-enriches a row whose places predate coordinate capture", () => {
  // Enriched before geoapify.mjs stored lat/lon: it has places, but none can be drawn.
  const stale = { cafes: { count: 1, places: [{ name: "Cafe A", distance_meters: 120 }] } };
  const existing = new Map([["rf-old", { lat: 43.65321, lng: -79.38329, nearby: stale }]]);
  const plan = planEnrichment([{ ...RAW, id: "rf-old" }], existing, 10);
  assert.ok(plan.fresh.includes("rf-old"));
  // and it must not be handed to a neighbour as a cell-cache hit either
  const neighbour = planEnrichment([{ ...RAW, id: "rf-near" }], existing, 10);
  assert.equal(neighbour.reuse.has("rf-near"), false);
});

test("hasPlaceCoords accepts a sparse area with no places at all", () => {
  // Every bucket empty is a real answer for a rural listing, not a stale row.
  assert.equal(hasPlaceCoords({ cafes: { count: 0, places: [] } }), true);
  assert.equal(hasPlaceCoords({}), false);
  assert.equal(hasPlaceCoords(null), false);
});

const DETAIL_JSON =
  '{"ref_id":1,"sq_feet":"637, 370","features":["Elevator","Fridge"],"parking":["underground"],"cats":true,"dogs":true,"utilities_included":["Heat","Water"],"lease_term":"Long Term","slide":"https:\\/\\/x\\/slide.jpg","title":"Nice place"}';
const DETAIL_HTML = `<html><body><script>var listing = ${DETAIL_JSON};</script><script>var again = ${DETAIL_JSON};</script></body></html>`;

test("parseRentfasterDetail maps the embedded listing object", () => {
  assert.deepEqual(parseRentfasterDetail(DETAIL_HTML), {
    sqft: 637,
    amenities: ["Elevator", "Fridge", "Underground parking", "Pet-friendly", "Heat included", "Water included"],
    leaseTerm: "Long Term",
    photo: "https://x/slide.jpg",
    description: "Nice place",
  });
});

test("parseRentfasterDetail handles blank sq_feet and no pets", () => {
  const json = '{"ref_id":2,"sq_feet":"","features":[],"parking":[],"cats":false,"dogs":false,"utilities_included":[],"lease_term":null,"slide":null,"title":null}';
  const result = parseRentfasterDetail(`<html>${json}</html>`);
  assert.equal(result.sqft, null);
  assert.ok(result.amenities.includes("No pets"));
});

test("parseRentfasterDetail returns null when no embedded object is present", () => {
  assert.equal(parseRentfasterDetail("<html><body>nothing here</body></html>"), null);
});

test("fetchRentfasterDetail returns null on a non-200 response", async () => {
  const getImpl = async () => ({ status: 403, body: "" });
  assert.equal(await fetchRentfasterDetail("https://x/1", { getImpl }), null);
});

test("fetchRentfasterDetail reports each status via onStatus and follows redirects", async () => {
  const statuses = [];
  const getImpl = async (url) => {
    if (url === "https://x/1") return { status: 301, body: "", location: "/moved" };
    if (url === "https://x/moved") return { status: 200, body: DETAIL_HTML };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchRentfasterDetail("https://x/1", { getImpl, onStatus: (s) => statuses.push(s) });
  assert.deepEqual(statuses, [301, 200]);
  assert.equal(result.sqft, 637);
});

test("fetchRentfasterDetail gives up after 3 redirects", async () => {
  let calls = 0;
  const getImpl = async () => {
    calls++;
    return { status: 302, body: "", location: "https://x/next" };
  };
  assert.equal(await fetchRentfasterDetail("https://x/1", { getImpl }), null);
  assert.equal(calls, 4); // initial + 3 redirects
});

test("parseRentfasterDetail parses the saved live sample page", () => {
  const path = fileURLToPath(new URL("../.superpowers/sdd/2026-09-17-multi-city-listings-db/rf-detail-sample.html", import.meta.url));
  const html = fs.readFileSync(path, "utf8");
  const result = parseRentfasterDetail(html);
  assert.equal(result.sqft, 637);
  assert.ok(result.amenities.includes("Elevator"));
});

test("planDetail selects rentfaster raws missing a description and rentcast raws not yet keyed to a listing", () => {
  const raws = [
    { id: "rf-1", source: "rentfaster" },
    { id: "rf-2", source: "rentfaster" },
    { id: "rc-1", source: "rentcast" },
    { id: "rc-2", source: "rentcast" },
    { id: "rc-3", source: "rentcast" },
  ];
  const existing = new Map([
    ["rf-2", { description: "already have it" }],
    ["rc-2", { url: "https://www.google.com/search?q=1%20Main%20St%20for%20rent" }],
    ["rc-3", { url: "https://www.realtor.com/rentals/details/1-Main-St_San-Francisco_CA_94103_M12345-67890" }],
  ]);
  assert.deepEqual(planDetail(raws, existing), ["rf-1", "rc-1", "rc-2"]);
});

test("takeDetailIds caps the ids attempted per run and leaves the rest for next time", () => {
  assert.deepEqual(takeDetailIds(["a", "b", "c"], 2), ["a", "b"]);
  assert.deepEqual(takeDetailIds(["a", "b"], 5), ["a", "b"]);
  assert.deepEqual(takeDetailIds(["a", "b"], 0), []);
});

test("mergeDetail carries forward existing detail fields when no fresh detail was fetched", () => {
  const row = { sqft: null, amenities: [], lease_term: null, photo: null, description: null, url: "https://www.rentfaster.ca/properties/a-1" };
  const prev = { sqft: 500, amenities: ["Elevator"], lease_term: "Long Term", photo: "https://x/old.jpg", description: "Old description", url: "https://www.rentfaster.ca/properties/old-1" };
  assert.deepEqual(mergeDetail(row, undefined, prev), {
    sqft: 500, amenities: ["Elevator"], lease_term: "Long Term", photo: "https://x/old.jpg", description: "Old description",
    url: "https://www.rentfaster.ca/properties/a-1", // a real source URL always wins over the stored one
  });

  const detail = { sqft: 700, amenities: ["Gym"], leaseTerm: "Short Term", photo: "https://x/new.jpg", description: "New description" };
  assert.deepEqual(mergeDetail(row, detail, prev), {
    sqft: 700, amenities: ["Gym"], lease_term: "Short Term", photo: "https://x/new.jpg", description: "New description",
    url: "https://www.rentfaster.ca/properties/a-1",
  });

  assert.deepEqual(mergeDetail(row, undefined, undefined), row);
});

test("mergeDetail keeps a resolved listing link over the Google-search fallback", () => {
  const google = "https://www.google.com/search?q=1%20Main%20St%20for%20rent";
  const realtor = "https://www.realtor.com/rentals/details/1-Main-St_San-Francisco_CA_94103_M12345-67890";
  const row = { sqft: 400, amenities: [], lease_term: null, photo: null, description: null, url: google };
  assert.equal(mergeDetail(row, { url: realtor }, undefined).url, realtor); // freshly resolved
  assert.equal(mergeDetail(row, null, { url: realtor }).url, realtor); // resolved on an earlier run
  assert.equal(mergeDetail(row, null, { url: google }).url, google); // lookup missed: keep the fallback
  assert.equal(mergeDetail(row, null, undefined).url, google);
  // An older stored fallback must not shadow the fresh one.
  assert.equal(mergeDetail(row, null, { url: "https://www.google.com/search?q=old" }).url, google);
});

test("isBlockedStatus counts challenges, rate limits, server errors and timeouts, not misses", () => {
  for (const s of [0, 403, 429, 500, 503]) assert.equal(isBlockedStatus(s), true, String(s));
  for (const s of [null, 200, 301, 404]) assert.equal(isBlockedStatus(s), false, String(s));
});

// Trimmed from live Realtor.com suggest responses captured 2026-09-30.
const NATOMA_HITS = [
  { mpr_id: "2014955772", line: "637 Natoma St Apt 5", city: "San Francisco", state_code: "CA", postal_code: "94103", prop_status: ["for_rent"] },
  { mpr_id: "2534582811", line: "637 Natoma St Apt 6", city: "San Francisco", state_code: "CA", postal_code: "94103", prop_status: ["recently_sold", "off_market"] },
];

test("resolveRealtorUrl keys a listing to its Realtor.com rental page by address, unit and zip", async () => {
  let asked;
  const fetchImpl = async (url) => {
    asked = url;
    return { ok: true, status: 200, json: async () => ({ autocomplete: NATOMA_HITS }) };
  };
  const statuses = [];
  const got = await resolveRealtorUrl("637 Natoma St, Apt 5, San Francisco, CA 94103", { fetchImpl, onStatus: (s) => statuses.push(s) });
  assert.deepEqual(got, { url: "https://www.realtor.com/rentals/details/637-Natoma-St-Apt-5_San-Francisco_CA_94103_M20149-55772" });
  assert.match(asked, /input=637%20Natoma%20St%20Apt%205%20San%20Francisco%20CA%2094103$/);
  assert.deepEqual(statuses, [200]);
});

test("pickRentalHit rejects other units, other zips and listings not for rent", () => {
  assert.equal(pickRentalHit(NATOMA_HITS, { line: "637 Natoma St Apt 6", zip: "94103" }), null); // off market
  assert.equal(pickRentalHit(NATOMA_HITS, { line: "637 Natoma St Apt 5", zip: "94110" }), null);
  assert.equal(pickRentalHit(NATOMA_HITS, { line: "637 Natoma St", zip: "94103" }), null); // building != unit
  assert.equal(pickRentalHit(NATOMA_HITS, { line: "637 Natoma St, Unit 5", zip: "94103" }).mpr_id, "2014955772"); // Apt == Unit
  assert.equal(pickRentalHit(NATOMA_HITS, { line: "637 Natoma St, #5", zip: "94103" }).mpr_id, "2014955772"); // # == Apt
  assert.equal(pickRentalHit(NATOMA_HITS, { line: "637 Natoma St, #55", zip: "94103" }), null);
  const mixed = [{ ...NATOMA_HITS[0], line: "875 California St Unit 202", postal_code: "94108", prop_status: ["for_sale", "for_rent"] }];
  assert.ok(pickRentalHit(mixed, { line: "875 California St Unit 202", zip: "94108" }));
});

test("resolveRealtorUrl returns null on a miss, a non-200, a network error or an unparseable address", async () => {
  const empty = async () => ({ ok: true, status: 200, json: async () => ({ autocomplete: [] }) });
  assert.equal(await resolveRealtorUrl("1 Nowhere St, San Francisco, CA 94103", { fetchImpl: empty }), null);
  const statuses = [];
  const forbidden = async () => ({ ok: false, status: 403, json: async () => ({}) });
  assert.equal(await resolveRealtorUrl("637 Natoma St, Apt 5, San Francisco, CA 94103", { fetchImpl: forbidden, onStatus: (s) => statuses.push(s) }), null);
  const boom = async () => { throw new Error("ECONNRESET"); };
  assert.equal(await resolveRealtorUrl("637 Natoma St, Apt 5, San Francisco, CA 94103", { fetchImpl: boom, onStatus: (s) => statuses.push(s) }), null);
  assert.deepEqual(statuses, [403, 0]);
  assert.equal(await resolveRealtorUrl("no commas here", { fetchImpl: empty }), null);
});
