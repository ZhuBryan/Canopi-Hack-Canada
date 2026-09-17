import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToListing } from "./listing-score.ts";
import { CITIES } from "./cities.ts";

const ROW = {
  id: "rf-1", city: "toronto", source: "rentfaster", url: "https://x/1",
  address: "1 A St", full_address: "1 A St, Toronto", lat: 43.65, lng: -79.38,
  monthly_rent: 2000, beds: 1, baths: 1.5, sqft: null, property_type: "Townhouse",
  photo: null, available: "Immediate", lease_term: null, amenities: ["Parking"],
  cafes: 10, restaurants: 15, transit: 1,
};

test("rowToListing scores buckets, maps fields, and falls back to a Mapbox static image", () => {
  const l = rowToListing(ROW as never, CITIES.toronto, "tok");
  assert.equal(l.id, "rf-1");
  assert.equal(l.city, "Toronto, ON");
  assert.equal(l.priceLabel, "$2,000/mo");
  assert.equal(l.shortPrice, "$2.0K");
  assert.equal(l.propertyType, "House");
  assert.equal(l.beds, 1);
  assert.equal(l.baths, 1.5);
  assert.equal(l.sqft, 0);
  assert.equal(l.nearbyServices?.cafes, 10);
  assert.equal(l.nearbyServices?.transit, 1);
  assert.equal(l.categoryScores.foodDrink, 100);
  assert.equal(l.categoryScores.education, 0);
  assert.match(l.image, /^https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\/streets-v12\/static\/.*access_token=tok$/);
  assert.equal(l.incomeNeeded, 80000);
});
