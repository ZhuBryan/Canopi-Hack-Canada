import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeListingsForPrompt, LISTING_LINE_FORMAT } from "./prompt-encoding.ts";

const listings = [
  { id: "rf-1", address: "1 A St", monthlyRent: 2000, lat: 43.6532, lng: -79.3832, nearbyServices: { schools: 1, groceries: 2, restaurants: 15, cafes: 4, parks: 0, pharmacies: 3, transit: 9 } },
  { id: "rc-2", address: "2 B Ave", monthlyRent: 3100, lat: 37.7749, lng: -122.4194 },
];

test("encodes one pipe-delimited line per listing in the documented field order", () => {
  assert.equal(LISTING_LINE_FORMAT, "id|address|price|lat,lng|schools,groceries,restaurants,cafes,parks,pharmacies,transit");
  assert.equal(
    encodeListingsForPrompt(listings as never),
    "rf-1|1 A St|$2000|43.653,-79.383|1,2,15,4,0,3,9\nrc-2|2 B Ave|$3100|37.775,-122.419|0,0,0,0,0,0,0"
  );
});

test("is shorter than JSON of the same fields", () => {
  const json = JSON.stringify(
    listings.map((l) => ({ id: l.id, address: l.address, price: l.monthlyRent, lat: l.lat, lng: l.lng, nearbyServices: l.nearbyServices ?? {} }))
  );
  assert.ok(encodeListingsForPrompt(listings as never).length < json.length / 2);
});
