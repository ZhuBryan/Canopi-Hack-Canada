import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRentfaster } from "./sources/rentfaster.mjs";

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
          { properties: { name: "Cafe A", formatted: "1 Main St", distance: 120, categories: ["catering.cafe"] } },
        ],
      }),
    };
  };
  const nearby = await fetchNearby(43.65, -79.38, { apiKey: "k", fetchImpl, delayMs: 0 });
  assert.equal(calls.length, BUCKETS.length);
  assert.match(calls[0], /filter=circle:-79\.38,43\.65,500/); // schools radius 500
  assert.equal(nearby.cafes.count, 1);
  assert.deepEqual(nearby.cafes.places[0], {
    name: "Cafe A", address: "1 Main St", distance_meters: 120, categories: ["catering.cafe"],
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
    url: "https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20San%20Francisco%2C%20CA%2094105",
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
