import { test } from "node:test";
import assert from "node:assert/strict";

import { amenitiesFromNearby } from "./nearby-amenities.ts";

const LAT = 43.6510;
const LNG = -79.3832;

const place = (name: string, distance: number, extra: Record<string, unknown> = {}) => ({
  name,
  distance_meters: distance,
  lat: 43.6515,
  lon: -79.384,
  ...extra,
});

test("builds amenities from stored Geoapify places", () => {
  const out = amenitiesFromNearby(
    {
      cafes: { places: [place("Tim Hortons", 221)] },
      groceries: { places: [place("Food Basics", 300)] },
      transit: { places: [place("Military Trail", 105)] },
    },
    LAT,
    LNG
  );
  assert.ok(out);
  assert.deepEqual(
    out.amenities.map((a) => [a.name, a.type, a.distance]),
    [
      ["Military Trail", "transit", 105],
      ["Tim Hortons", "cafe", 221],
      ["Food Basics", "grocery", 300],
    ]
  );
  // closest first, and every one carries coordinates the map can draw a tether to
  assert.ok(out.amenities.every((a) => Number.isFinite(a.coords[0]) && Number.isFinite(a.coords[1])));
  assert.equal(out.vitalityScore, Math.round(((10 + 15 + 10) / 180) * 100));
});

test("a place in two buckets is typed and scored once, by the first bucket", () => {
  const supermarket = place("Food Basics", 300);
  const out = amenitiesFromNearby(
    { groceries: { places: [supermarket] }, pharmacies: { places: [{ ...supermarket }] } },
    LAT,
    LNG
  );
  assert.ok(out);
  assert.equal(out.amenities.length, 1);
  assert.equal(out.amenities[0].type, "grocery");
  // grocery weight only — not grocery + healthcare
  assert.equal(out.vitalityScore, Math.round((15 / 180) * 100));
});

test("drops places beyond the 500m tether radius", () => {
  const out = amenitiesFromNearby({ cafes: { places: [place("Far Cafe", 830)] } }, LAT, LNG);
  assert.ok(out);
  assert.equal(out.amenities.length, 0);
});

test("caps the list at 15, closest first", () => {
  const places = Array.from({ length: 25 }, (_, i) =>
    place(`Stop ${i}`, 500 - i * 10, { lat: 43.6515 + i * 1e-4 })
  );
  const out = amenitiesFromNearby({ transit: { places } }, LAT, LNG);
  assert.ok(out);
  assert.equal(out.amenities.length, 15);
  assert.equal(out.amenities[0].distance, 260); // the closest of the 25
});

test("returns null when the row cannot answer, so the caller falls back to Overpass", () => {
  assert.equal(amenitiesFromNearby(null, LAT, LNG), null);
  assert.equal(amenitiesFromNearby({}, LAT, LNG), null, "never enriched");
  assert.equal(
    amenitiesFromNearby({ cafes: { places: [{ name: "Cafe A", distance_meters: 120 }] } }, LAT, LNG),
    null,
    "enriched before coordinates were captured"
  );
});

test("a genuinely empty neighbourhood still answers, rather than falling back", () => {
  const out = amenitiesFromNearby({ cafes: { places: [place("Cafe A", 900)] } }, LAT, LNG);
  assert.ok(out, "has coordinates, just nothing within 500m");
  assert.equal(out.amenities.length, 0);
  assert.equal(out.vitalityScore, 0);
});

test("falls back to computing distance when the stored one is missing", () => {
  const out = amenitiesFromNearby(
    { cafes: { places: [{ name: "Cafe A", lat: 43.6515, lon: -79.3832 }] } },
    LAT,
    LNG
  );
  assert.ok(out);
  assert.equal(out.amenities.length, 1);
  assert.ok(out.amenities[0].distance > 0 && out.amenities[0].distance < 100);
});
