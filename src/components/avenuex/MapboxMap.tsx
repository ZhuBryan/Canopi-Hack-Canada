"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Listing } from "@/lib/avenuex-data";
import { scoreColor } from "@/components/avenuex/primitives";

interface SelectedAmenity {
  id: string;
  name: string;
  type: string;
  distance: number;
  coords: [number, number];
  description?: string;
}

interface MapboxMapProps {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedAmenities?: SelectedAmenity[];
}

const GTA_MASK_CENTER: [number, number] = [-79.3832, 43.6532];
const GTA_MASK_RADIUS_SCALE = 2;
const GTA_MASK_INNER_RING: [number, number][] = [
  [-79.3832, 43.7732],
  [-79.3181, 43.7641],
  [-79.2631, 43.7380],
  [-79.2261, 43.6991],
  [-79.2132, 43.6532],
  [-79.2261, 43.6073],
  [-79.2631, 43.5684],
  [-79.3181, 43.5423],
  [-79.3832, 43.5332],
  [-79.4483, 43.5423],
  [-79.5033, 43.5684],
  [-79.5403, 43.6073],
  [-79.5532, 43.6532],
  [-79.5403, 43.6991],
  [-79.5033, 43.7380],
  [-79.4483, 43.7641],
  [-79.3832, 43.7732],
];

function scaleRing(
  ring: [number, number][],
  center: [number, number],
  scale: number
): [number, number][] {
  return ring.map(([lng, lat]) => [
    center[0] + (lng - center[0]) * scale,
    center[1] + (lat - center[1]) * scale,
  ]);
}

export function MapboxMap({ listings, selectedId, onSelect, selectedAmenities = [] }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedAmenitiesRef = useRef(selectedAmenities);
  selectedAmenitiesRef.current = selectedAmenities;
  const highlightDirtyRef = useRef(true);
  const triggerHighlightRef = useRef<(() => void) | null>(null);
  const amenityPopupRef = useRef<mapboxgl.Popup | null>(null);
  const [poisVisible, setPoisVisible] = useState(false);

  const renderAmenityPaths = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("amenity-paths") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const currentSelectedId = selectedIdRef.current;
    const selectedListing = currentSelectedId
      ? listingsRef.current.find((l) => l.id === currentSelectedId)
      : null;

    if (!selectedListing || selectedAmenitiesRef.current.length === 0) {
      source.setData({ type: "FeatureCollection", features: [] });
      amenityPopupRef.current?.remove();
      return;
    }

    const features: GeoJSON.Feature[] = [];
    for (const amenity of selectedAmenitiesRef.current) {
      const [lat, lng] = amenity.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const color = colorForAmenityType(amenity.type);

      features.push({
        type: "Feature",
        properties: { color },
        geometry: {
          type: "LineString",
          coordinates: [
            [selectedListing.lng, selectedListing.lat],
            [lng, lat],
          ],
        },
      });
      features.push({
        type: "Feature",
        properties: {
          id: amenity.id,
          name: amenity.name,
          type: amenity.type,
          distance: amenity.distance,
          description: amenity.description ?? "",
          color,
        },
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      });
    }

    source.setData({
      type: "FeatureCollection",
      features,
    });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/sym7534/cmmgpkjan00a701qsb6jbchc8",
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

      // Mapbox Standard style doesn't expose "composite" at the top level —
      // add it manually so our fill-extrusion and querySourceFeatures can use it.
      if (!map.getSource("composite")) {
        map.addSource("composite", {
          type: "vector",
          url: "mapbox://mapbox.mapbox-streets-v8",
        });
      }

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
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 85], "#15803d",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 75], "#4ade80",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 65], "#fbbf24",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 55], "#f97316",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 35], "#dc2626",

            "#f6f5f4",
          ],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": 0.85,
        },
      });

      map.addSource("amenity-paths", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      map.addLayer({
        id: "amenity-path-lines",
        type: "line",
        source: "amenity-paths",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#38bdf8"],
          "line-width": 2.8,
          "line-opacity": 0.88,
          "line-dasharray": [0.6, 1.6],
        },
      });
      map.addLayer({
        id: "amenity-path-points",
        type: "circle",
        source: "amenity-paths",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": ["coalesce", ["get", "color"], "#38bdf8"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.98,
        },
      });

      // ── Listing building highlights ────────────────────────────────────────
      // querySourceFeatures for geographic accuracy — avoids the pitch/occlusion
      // problem of screen-space queryRenderedFeatures.
      const listingFeatureIds = new Set<string | number>();

      const applyListingHighlights = () => {
        if (!highlightDirtyRef.current) return;
        highlightDirtyRef.current = false;
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
          // Find nearest building — skip features outside a ~300m bbox first
          const pad = 0.003;
          let nearest: (typeof buildingFeatures)[number] | null = null;
          let nearestDist = Infinity;
          for (const feature of buildingFeatures) {
            if (feature.id == null) continue;
            const b = geomBounds(feature.geometry);
            if (!b || b.maxLng < listing.lng - pad || b.minLng > listing.lng + pad ||
                       b.maxLat < listing.lat - pad || b.minLat > listing.lat + pad) continue;
            const d = minDistToGeom(listing.lng, listing.lat, feature.geometry);
            if (d < nearestDist) { nearestDist = d; nearest = feature; }
          }
          if (!nearest) continue;

          // Stamp nearest + every building sharing a vertex with it (wider bbox)
          const anchorKeys = vertexKeySet(nearest.geometry, 5);
          const pad2 = 0.005;
          for (const feature of buildingFeatures) {
            if (feature.id == null) continue;
            const b = geomBounds(feature.geometry);
            if (!b || b.maxLng < listing.lng - pad2 || b.minLng > listing.lng + pad2 ||
                       b.maxLat < listing.lat - pad2 || b.minLat > listing.lat + pad2) continue;
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

      // Debounce idle-triggered highlights so we don't run on partial tile loads
      let highlightTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleHighlight = () => {
        if (!highlightDirtyRef.current) return;
        if (highlightTimer) clearTimeout(highlightTimer);
        highlightTimer = setTimeout(applyListingHighlights, 200);
      };

      triggerHighlightRef.current = () => {
        highlightDirtyRef.current = true;
        scheduleHighlight();
      };

      map.on("sourcedata", (e) => {
        if (e.sourceId === "composite" && e.isSourceLoaded) {
          highlightDirtyRef.current = true;
        }
      });

      applyListingHighlights();
      map.on("idle", scheduleHighlight);

      map.on("mouseenter", "amenity-path-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "amenity-path-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "amenity-path-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const props = feature.properties ?? {};
        const title = String(props.name ?? "Nearby Shop");
        const type = String(props.type ?? "other");
        const description = String(props.description ?? "Nearby option.");
        const distance = Number(props.distance ?? 0);
        const lngLat = feature.geometry.coordinates as [number, number];

        amenityPopupRef.current?.remove();
        amenityPopupRef.current = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: "300px",
        })
          .setLngLat(lngLat)
          .setHTML(
            `<div style="font-family:Inter,sans-serif;color:#0f172a;min-width:240px;max-width:280px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;box-shadow:0 10px 24px rgba(2,6,23,0.16)">
              <div style="padding:10px 12px;background:linear-gradient(135deg,#eff6ff 0%,#ecfdf5 100%);border-bottom:1px solid #dcfce7">
                <div style="font-size:13px;font-weight:800;line-height:1.35;margin-bottom:3px">${escapeHtml(title)}</div>
                <div style="font-size:11px;font-weight:700;color:#166534;text-transform:capitalize">${escapeHtml(formatAmenityType(type))}</div>
              </div>
              <div style="padding:10px 12px">
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:7px">
                  <span style="display:inline-block;font-size:11px;font-weight:700;background:#f1f5f9;color:#334155;padding:3px 8px;border-radius:999px">
                    ${Number.isFinite(distance) ? `${Math.round(distance)}m away` : "Distance unavailable"}
                  </span>
                </div>
                <div style="font-size:11px;color:#475569;line-height:1.45">${escapeHtml(description)}</div>
              </div>
            </div>`,
          )
          .addTo(map);
      });

      // ── GTA boundary mask ──────────────────────────────────────────────────
      map.addSource("gta-mask", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]],
              scaleRing(GTA_MASK_INNER_RING, GTA_MASK_CENTER, GTA_MASK_RADIUS_SCALE),
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

      // ── Disable 3D facades so our fill-extrusion can render ──────────────────
      // Standard style's show3dFacades renders opaque 3D building models on top
      // of fill-extrusion layers, hiding our score-colored buildings.
      // Disable Standard style's building renderers so only our fill-extrusion shows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty("basemap", "show3dFacades", false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty("basemap", "show3dBuildings", false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty("basemap", "colorBuildings", "#f6f5f4");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty("basemap", "colorGreenspace", "#9cd397");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty("basemap", "lightPreset", "day");

      // ── Markers ────────────────────────────────────────────────────────────
      for (const listing of listingsRef.current) {
        addMarker(map, listing, listing.id === selectedId);
      }
      renderAmenityPaths();
    });

    return () => {
      amenityPopupRef.current?.remove();
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

    // Re-stamp building colors when listings change
    triggerHighlightRef.current?.();
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

  useEffect(() => {
    renderAmenityPaths();
  }, [selectedId, listings, selectedAmenities]);

  // Toggle POI/transit labels via Mapbox Standard style config
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).setConfigProperty("basemap", "showPointOfInterestLabels", poisVisible);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).setConfigProperty("basemap", "showTransitLabels", poisVisible);
  }, [poisVisible]);

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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={() => setPoisVisible((v) => !v)}
        className="absolute top-4 right-4 z-10 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md transition hover:bg-slate-50"
      >
        {poisVisible ? "Hide POIs" : "Show POIs"}
      </button>
    </div>
  );
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

function colorForAmenityType(type: string): string {
  switch (type) {
    case "grocery":
      return "#22C55E";
    case "healthcare":
      return "#EC4899";
    case "cafe":
      return "#F97316";
    case "park":
      return "#10B981";
    case "transit":
      return "#3B82F6";
    default:
      return "#38bdf8";
  }
}

function formatAmenityType(type: string): string {
  switch (type) {
    case "grocery":
      return "Grocery";
    case "healthcare":
      return "Healthcare";
    case "cafe":
      return "Cafe";
    case "park":
      return "Park";
    case "transit":
      return "Transit";
    default:
      return "Nearby";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
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

function minDistToGeom(px: number, py: number, geom: GeoJSON.Geometry): number {
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

function vertexKeySet(geom: GeoJSON.Geometry, decimals: number): Set<string> {
  return new Set(vertexKeys(geom, decimals));
}

function vertexKeys(geom: GeoJSON.Geometry, decimals: number): string[] {
  return rings(geom).flat().map(([vx, vy]) => `${vx.toFixed(decimals)},${vy.toFixed(decimals)}`);
}

function geomBounds(geom: GeoJSON.Geometry): { minLng: number; maxLng: number; minLat: number; maxLat: number } | null {
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
