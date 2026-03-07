"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Listing } from "@/lib/avenuex-data";
import { scoreColor } from "@/components/avenuex/primitives";

interface MapboxMapProps {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MapboxMap({ listings, selectedId, onSelect }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-79.3832, 43.6532],
      zoom: 14,
      pitch: 45,
      bearing: -10,
      dragRotate: false,
      antialias: false,
      maxTileCacheSize: 20,
      maxBounds: [[-79.65, 43.55], [-79.10, 43.85]],
    });

    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      map.setFog({
        range: [0.5, 6],
        color: "#f5f0e8",
        "horizon-blend": 0.04,
      });
      // 3D buildings — color driven by feature-state:
      //   hover  → amber highlight
      //   score >= 80 (great) → green
      //   score >= 60 (medium) → yellow
      //   default → light tan
      map.addLayer({
        id: "3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": [
            "case",
            // Dark green: score >= 85
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 85],
            "#15803d",
            // Light green: score >= 75
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 75],
            "#4ade80",
            // Yellow: score >= 65
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 65],
            "#fbbf24",
            // Orange: score >= 55
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 55],
            "#f97316",
            // Dark red: score >= 35 (minimum threshold — still worth considering)
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 35],
            "#dc2626",
            // Default (not a listing or below threshold)
            "#ede8dc",
          ],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": 0.85,
        },
      });

      // ── Listing building highlights ────────────────────────────────────────
      // Query building features from source tiles geographically, then do
      // point-in-polygon to find which building footprint contains each
      // listing's lat/lng. This avoids the pitch/occlusion problem of
      // screen-space queryRenderedFeatures.
      const listingFeatureIds = new Set<string | number>();

      const applyListingHighlights = () => {
        // Clear previous stamps
        listingFeatureIds.forEach((id) => {
          map.setFeatureState(
            { source: "composite", sourceLayer: "building", id },
            { listingScore: 0 }
          );
        });
        listingFeatureIds.clear();

        const buildingFeatures = map.querySourceFeatures("composite", {
          sourceLayer: "building",
          filter: ["==", "extrude", "true"],
        });

        for (const listing of listingsRef.current) {
          // Step 1: find the single nearest building feature
          let nearest: (typeof buildingFeatures)[number] | null = null;
          let nearestDist = Infinity;
          for (const feature of buildingFeatures) {
            if (feature.id == null) continue;
            const d = minDistToGeom(listing.lng, listing.lat, feature.geometry);
            if (d < nearestDist) { nearestDist = d; nearest = feature; }
          }
          if (!nearest) continue;

          // Step 2: build a vertex key-set for the nearest building
          // (5 decimal places ≈ 1 m precision — enough to detect shared edges)
          const anchorKeys = vertexKeySet(nearest.geometry, 5);

          // Step 3: stamp nearest + every building that shares any vertex with it
          for (const feature of buildingFeatures) {
            if (feature.id == null) continue;
            const touches =
              feature.id === nearest.id ||
              vertexKeys(feature.geometry, 5).some((k) => anchorKeys.has(k));
            if (touches) {
              listingFeatureIds.add(feature.id);
              map.setFeatureState(
                { source: "composite", sourceLayer: "building", id: feature.id },
                { listingScore: listing.score }
              );
            }
          }
        }
      };

      applyListingHighlights();
      map.on("idle", applyListingHighlights);

      // ── GTA boundary mask ──────────────────────────────────────────────────
      // Inverted polygon: world outer ring with a GTA-shaped hole cut out.
      // Everything outside the hole renders as solid gray.
      map.addSource("gta-mask", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              // Outer ring: entire world (counter-clockwise)
              [[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]],
              // Inner hole: downtown Toronto teardrop (clockwise)
              [
                [-79.4130, 43.6750], // NW  — Bloor/Ossington
                [-79.3950, 43.6790], // N   — Bloor/Spadina peak
                [-79.3700, 43.6750], // NE  — Bloor/Yonge
                [-79.3540, 43.6720], // NE  — Rosedale/DVP
                [-79.3430, 43.6580], // E   — Don Valley
                [-79.3480, 43.6450], // SE  — Broadview/Distillery
                [-79.3580, 43.6320], // SE  — Lower Don
                [-79.3750, 43.6200], // S   — Harbour
                [-79.3930, 43.6170], // S   — south tip
                [-79.4130, 43.6220], // SW  — Exhibition/Humber
                [-79.4280, 43.6350], // W   — King/Dufferin
                [-79.4320, 43.6500], // W   — Queen/Dufferin
                [-79.4240, 43.6640], // NW  — Bloor/Dufferin
                [-79.4130, 43.6750], // back to NW
              ],
            ],
          },
        },
      });
      map.addLayer({
        id: "gta-mask",
        type: "fill",
        source: "gta-mask",
        paint: {
          "fill-color": "#e8e8e8",
          "fill-opacity": 1,
        },
      });

      // ── Markers ────────────────────────────────────────────────────────────
      for (const listing of listingsRef.current) {
        addMarker(map, listing, listing.id === selectedId);
      }
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync markers when listings change (filter/sort)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const currentIds = new Set(listings.map((l) => l.id));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    for (const listing of listings) {
      if (!markersRef.current.has(listing.id)) {
        addMarker(map, listing, listing.id === selectedId);
      }
    }

    markersRef.current.forEach((marker, id) => {
      applyMarkerStyle(marker.getElement(), id === selectedId);
    });
  }, [listings, selectedId]);

  // Update marker styles + fly when selectedId changes
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      applyMarkerStyle(marker.getElement(), id === selectedId);
    });

    if (selectedId && mapRef.current) {
      const listing = listings.find((l) => l.id === selectedId);
      if (listing) {
        mapRef.current.flyTo({
          center: [listing.lng, listing.lat],
          zoom: 17.5,
          pitch: 45,
          duration: 900,
          essential: true,
        });
      }
    }
  }, [selectedId, listings]);

  function addMarker(map: mapboxgl.Map, listing: Listing, active: boolean) {
    const el = document.createElement("div");
    el.style.cssText = markerBaseStyle(active, listing.score);
    el.dataset.score = String(listing.score);
    el.textContent = listing.shortPrice;
    el.addEventListener("click", () => onSelectRef.current(listing.id));

    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([listing.lng, listing.lat])
      .addTo(map);

    markersRef.current.set(listing.id, marker);
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

function markerBaseStyle(active: boolean, score: number): string {
  return [
    `background: ${scoreColor(score)}`,
    "color: white",
    "padding: 5px 12px",
    "border-radius: 999px",
    "font-size: 11px",
    "font-weight: 700",
    "cursor: pointer",
    `border: 2px solid ${active ? "#0f172a" : "white"}`,
    "white-space: nowrap",
    "transition: background 0.15s, border-color 0.15s",
    "font-family: Inter, sans-serif",
    "letter-spacing: -0.3px",
    `transform: scale(${active ? "1.15" : "1"})`,
    `z-index: ${active ? "10" : "1"}`,
    "display: inline-block",
    "width: max-content",
    "line-height: 1.2",
  ].join("; ");
}

function applyMarkerStyle(el: HTMLElement, active: boolean) {
  el.style.borderColor = active ? "#0f172a" : "white";
  el.style.transform = `scale(${active ? "1.15" : "1"})`;
  el.style.zIndex = active ? "10" : "1";
}

function rings(geom: GeoJSON.Geometry): [number, number][][] {
  if (geom.type === "Polygon") return geom.coordinates as [number, number][][];
  if (geom.type === "MultiPolygon") return (geom.coordinates as [number, number][][][]).flat();
  return [];
}

// Minimum geographic distance from point to a geometry (0 if inside).
function minDistToGeom(px: number, py: number, geom: GeoJSON.Geometry): number {
  let min = Infinity;
  for (const ring of rings(geom)) {
    // Inside check — distance is 0
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return 0;
    // Edge distance
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j], [x2, y2] = ring[i];
      const dx = x2 - x1, dy = y2 - y1, lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      min = Math.min(min, (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2);
    }
  }
  return Math.sqrt(min);
}

// Returns a Set of "lng,lat" strings rounded to `decimals` places.
function vertexKeySet(geom: GeoJSON.Geometry, decimals: number): Set<string> {
  return new Set(vertexKeys(geom, decimals));
}

function vertexKeys(geom: GeoJSON.Geometry, decimals: number): string[] {
  return rings(geom).flat().map(([vx, vy]) => `${vx.toFixed(decimals)},${vy.toFixed(decimals)}`);
}
