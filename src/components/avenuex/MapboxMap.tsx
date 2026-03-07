"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Listing } from "@/lib/avenuex-data";

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
    });

    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
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
        minzoom: 14,
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

        // ~20 m tolerance in degrees (lat ≈ 0.00018°/m, lng ≈ 0.00025°/m at Toronto)
        const NEAR_DEG = 0.0002;

        for (const listing of listingsRef.current) {
          for (const feature of buildingFeatures) {
            if (feature.id == null) continue;
            const geom = feature.geometry;
            let hit = false;
            if (geom.type === "Polygon") {
              const ring = geom.coordinates[0] as [number, number][];
              hit = pointInRing(listing.lng, listing.lat, ring) ||
                    pointNearRing(listing.lng, listing.lat, ring, NEAR_DEG);
            } else if (geom.type === "MultiPolygon") {
              hit = geom.coordinates.some((poly) => {
                const ring = poly[0] as [number, number][];
                return pointInRing(listing.lng, listing.lat, ring) ||
                       pointNearRing(listing.lng, listing.lat, ring, NEAR_DEG);
              });
            }
            if (hit) {
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

      // Re-stamp whenever individual composite tiles finish loading,
      // debounced so rapid tile bursts don't spam the function.
      let reapplyTimer: ReturnType<typeof setTimeout> | null = null;
      map.on("sourcedata", (e) => {
        if (e.sourceId === "composite" && e.tile) {
          if (reapplyTimer) clearTimeout(reapplyTimer);
          reapplyTimer = setTimeout(applyListingHighlights, 150);
        }
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
    el.style.cssText = markerBaseStyle(active);
    el.textContent = listing.shortPrice;
    el.addEventListener("click", () => onSelectRef.current(listing.id));

    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([listing.lng, listing.lat])
      .addTo(map);

    markersRef.current.set(listing.id, marker);
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

function markerBaseStyle(active: boolean): string {
  return [
    `background: ${active ? "#0f172a" : "#22C55E"}`,
    "color: white",
    "padding: 5px 12px",
    "border-radius: 999px",
    "font-size: 11px",
    "font-weight: 700",
    "cursor: pointer",
    "border: 2px solid white",
    "white-space: nowrap",
    "transition: background 0.15s, transform 0.15s",
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
  el.style.background = active ? "#0f172a" : "#22C55E";
  el.style.transform = `scale(${active ? "1.15" : "1"})`;
  el.style.zIndex = active ? "10" : "1";
}

// Ray-casting point-in-polygon for a single ring (geographic coords).
function pointInRing(px: number, py: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Returns true if point is within `threshold` degrees of any edge of the ring.
function pointNearRing(px: number, py: number, ring: [number, number][], threshold: number): boolean {
  const t2 = threshold * threshold;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const distSq = (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2;
    if (distSq < t2) return true;
  }
  return false;
}
