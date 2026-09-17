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
