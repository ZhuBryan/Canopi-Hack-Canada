import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToListing } from "./listing-score.ts";
import { CITIES } from "./cities.ts";

const ROW = {
  id: "rf-1", city: "toronto", source: "rentfaster", url: "https://x/1",
  address: "1 A St", full_address: "1 A St, Toronto", lat: 43.65, lng: -79.38,
  monthly_rent: 2000, beds: 1, baths: 1.5, sqft: null, property_type: "Townhouse",
  photo: null, available: "Immediate", lease_term: null, amenities: ["Parking"],
  nearby: {
    cafes: { count: 10, places: Array.from({ length: 10 }, (_, i) => ({ distance_meters: i * 90 })) },
    restaurants: { count: 15, places: Array.from({ length: 15 }, () => ({ distance_meters: 100 })) },
    transit: { count: 3, places: [{ distance_meters: 50 }, { distance_meters: 1500 }, { distance_meters: null }] },
  },
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
  assert.equal(l.nearbyServices?.transit, 1); // only distances <= 1000 count
  assert.equal(l.categoryScores.foodDrink, 100);
  assert.equal(l.categoryScores.education, 0);
  assert.match(l.image, /^https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\/streets-v12\/static\/.*access_token=tok$/);
  assert.equal(l.incomeNeeded, 80000);
});
