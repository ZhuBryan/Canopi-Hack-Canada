import { test } from "node:test";
import assert from "node:assert/strict";
import { geomBounds, indexBuildings, vertexKeysOf } from "./building-index.ts";

// Square building of side ~0.0002° with its lower-left corner at (lng, lat).
function box(id: number, lng: number, lat: number) {
  const s = 0.0002;
  return {
    id,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[
        [lng, lat], [lng + s, lat], [lng + s, lat + s], [lng, lat + s], [lng, lat],
      ]],
    },
  };
}

// A grid lookup must never miss what a full scan would have found.
test("near() returns every building a brute-force bbox scan would", () => {
  const features: ReturnType<typeof box>[] = [];
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 40; j++) {
      features.push(box(i * 40 + j, -79.4 + i * 0.001, 43.6 + j * 0.001));
    }
  }
  // Straddle a cell boundary on purpose: 0.005 is exactly one cell edge.
  features.push(box(9999, -79.4 + 0.005 - 0.0001, 43.6 + 0.005 - 0.0001));

  const grid = indexBuildings(features);
  const pad = 0.005;

  for (const [lng, lat] of [[-79.4, 43.6], [-79.38, 43.62], [-79.375, 43.605], [-79.3, 43.5]]) {
    const brute = new Set(
      features
        .map((f) => ({ id: f.id, b: geomBounds(f.geometry)! }))
        .filter(({ b }) =>
          !(b.maxLng < lng - pad || b.minLng > lng + pad || b.maxLat < lat - pad || b.minLat > lat + pad))
        .map(({ id }) => id)
    );
    const viaGrid = grid
      .near(lng, lat, pad)
      .filter((b) =>
        !(b.bounds.maxLng < lng - pad || b.bounds.minLng > lng + pad ||
          b.bounds.maxLat < lat - pad || b.bounds.minLat > lat + pad))
      .map((b) => b.id);

    assert.deepEqual(new Set(viaGrid), brute, `mismatch at ${lng},${lat}`);
    assert.equal(viaGrid.length, new Set(viaGrid).size, "near() returned duplicates");
  }
});

test("vertexKeysOf caches and matches shared corners", () => {
  const a = indexBuildings([box(1, -79.4, 43.6)]).near(-79.4, 43.6, 0.001)[0];
  const first = vertexKeysOf(a);
  assert.equal(vertexKeysOf(a), first, "second call should reuse the cached array");
  assert.ok(first.includes("-79.40000,43.60000"));
});
