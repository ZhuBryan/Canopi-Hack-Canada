// Geometry helpers for stamping listing scores onto Mapbox building features.

export type Bounds = { minLng: number; maxLng: number; minLat: number; maxLat: number };

export type Building = {
  id: string | number;
  geometry: GeoJSON.Geometry;
  bounds: Bounds;
  keys?: string[];
};

function rings(geom: GeoJSON.Geometry): [number, number][][] {
  if (geom.type === "Polygon") return geom.coordinates as [number, number][][];
  if (geom.type === "MultiPolygon") return (geom.coordinates as [number, number][][][]).flat();
  return [];
}

export function minDistToGeom(px: number, py: number, geom: GeoJSON.Geometry): number {
  let min = Infinity;
  for (const ring of rings(geom)) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j], [x2, y2] = ring[i];
      const dx = x2 - x1, dy = y2 - y1, lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      min = Math.min(min, (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2);
    }
  }
  return Math.sqrt(min);
}

function vertexKeys(geom: GeoJSON.Geometry, decimals: number): string[] {
  return rings(geom).flat().map(([vx, vy]) => `${vx.toFixed(decimals)},${vy.toFixed(decimals)}`);
}

// Computed on first use: the caller asks for the same building once per nearby listing.
export function vertexKeysOf(bld: Building): string[] {
  return (bld.keys ??= vertexKeys(bld.geometry, 5));
}

export function geomBounds(geom: GeoJSON.Geometry): Bounds | null {
  const r = rings(geom);
  if (r.length === 0) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of r) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLng, maxLng, minLat, maxLat };
}

// ponytail: uniform ~0.005° (~400m) cells, fine for city blocks; swap for an
// R-tree only if buildings ever cluster hard enough to make a cell huge.
const CELL = 0.005;

/**
 * Buckets buildings by cell so each listing scans its own block instead of every
 * loaded building. `near` returns every building whose bbox can intersect the
 * query window — callers still apply their own exact bbox test.
 */
export function indexBuildings(features: { id?: string | number; geometry: GeoJSON.Geometry }[]) {
  const cells = new Map<string, Building[]>();
  for (const feature of features) {
    if (feature.id == null) continue;
    const bounds = geomBounds(feature.geometry);
    if (!bounds) continue;
    const bld: Building = { id: feature.id, geometry: feature.geometry, bounds };
    for (let x = Math.floor(bounds.minLng / CELL); x <= Math.floor(bounds.maxLng / CELL); x++) {
      for (let y = Math.floor(bounds.minLat / CELL); y <= Math.floor(bounds.maxLat / CELL); y++) {
        const key = `${x},${y}`;
        const cell = cells.get(key);
        if (cell) cell.push(bld);
        else cells.set(key, [bld]);
      }
    }
  }

  return {
    near(lng: number, lat: number, pad: number): Building[] {
      const out: Building[] = [];
      const seen = new Set<Building>();
      for (let x = Math.floor((lng - pad) / CELL); x <= Math.floor((lng + pad) / CELL); x++) {
        for (let y = Math.floor((lat - pad) / CELL); y <= Math.floor((lat + pad) / CELL); y++) {
          for (const bld of cells.get(`${x},${y}`) ?? []) {
            if (seen.has(bld)) continue;
            seen.add(bld);
            out.push(bld);
          }
        }
      }
      return out;
    },
  };
}
