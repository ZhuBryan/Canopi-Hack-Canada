"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Listing } from "@/lib/avenuex-data";
import { scoreColor } from "@/components/avenuex/primitives";
import { useCity } from "@/lib/city-context";
import type { CityConfig } from "@/lib/cities";
import { indexBuildings, minDistToGeom, vertexKeysOf, type Building } from "@/lib/building-index";

interface SelectedAmenity {
  id: string;
  name: string;
  type: string;
  distance: number;
  coords: [number, number];
  description?: string;
}

// The fill-extrusion layer's floor; nothing below this zoom needs stamping.
const BUILDINGS_MINZOOM = 14;

// The view selecting a listing flies to. Preloading uses the identical camera so
// it warms exactly the tiles the flight will land on.
const SELECT_ZOOM = 17.5;
const SELECT_PITCH = 45;
const PRELOAD_COUNT = 6;

interface MapboxMapProps {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedAmenities?: SelectedAmenity[];
  isAmenityLoading?: boolean;
}

// Approximate circle in lng/lat degrees; good enough for a viewport mask.
function circleRing(center: [number, number], radiusKm: number, steps = 48): [number, number][] {
  const [lng, lat] = center;
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI;
    return [lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)] as [number, number];
  });
}

function maskGeoJson(cfg: CityConfig): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]],
        circleRing(cfg.center, cfg.maskRadiusKm),
      ],
    },
  };
}

function maxBounds(cfg: CityConfig): [[number, number], [number, number]] {
  const ring = circleRing(cfg.center, cfg.maskRadiusKm * 1.2, 4);
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

const AMENITY_ICON_ASSET_BY_TYPE: Record<string, string> = {
  transit: "/bus.svg",
  school: "/graduation-cap.svg",
  healthcare: "/scan-heart.svg",
  medical: "/scan-heart.svg",
  grocery: "/shopping-cart.svg",
  park: "/shrub.svg",
  other: "/pin.svg",
  cafe: "/coffee.svg",
  restaurant: "/pin.svg",
};

export function MapboxMap({
  listings,
  selectedId,
  onSelect,
  selectedAmenities = [],
  isAmenityLoading = false,
}: MapboxMapProps) {
  const { config: cityConfig } = useCity();
  const cityRef = useRef(cityConfig);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedAmenitiesRef = useRef(selectedAmenities);
  selectedAmenitiesRef.current = selectedAmenities;
  // Listing objects are rebuilt on every prefs drag and search keystroke; the
  // map only needs to react when the actual set of pins changes.
  const listingsKey = listings.map((l) => l.id).join(",");
  const highlightDirtyRef = useRef(true);
  const triggerHighlightRef = useRef<(() => void) | null>(null);
  const amenityPopupRef = useRef<mapboxgl.Popup | null>(null);
  const [poisVisible, setPoisVisible] = useState(false);
  const [showAmenityLoading, setShowAmenityLoading] = useState(false);
  const loadingShownAtRef = useRef<number>(0);
  const loadingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const renderAmenityPaths = () => {
    const map = mapRef.current;
    if (!map) return;
    // Gate on the source existing, not isStyleLoaded(): that is false whenever a
    // tile is in flight, and amenities usually arrive mid-flyTo.
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
          iconKey: amenityIconKey(amenity.type),
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
      // ponytail: public Standard style; set NEXT_PUBLIC_MAPBOX_STYLE to use a custom one from your own account
      style: process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? "mapbox://styles/mapbox/standard",
      center: cityRef.current.center,
      zoom: cityRef.current.zoom,
      pitch: 45,
      bearing: -10,
      dragRotate: false,
      antialias: false,
      // ponytail: 20 was low enough to force a re-parse on every pan; raise it if
      // panning still stutters, drop it if memory becomes the binding constraint.
      maxTileCacheSize: 100,
      maxBounds: maxBounds(cityRef.current),
    });

    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.getCanvas().style.cursor = "move";
    map.on("dragstart", () => { map.getCanvas().style.cursor = "move"; });
    map.on("dragend", () => { map.getCanvas().style.cursor = "move"; });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", async () => {
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
        minzoom: BUILDINGS_MINZOOM,
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
      await ensureAmenityIcons(map);
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
          "line-width": 4.4,
          "line-opacity": 0.88,
          "line-dasharray": [0.8, 1.4],
        },
      });
      map.addLayer({
        id: "amenity-path-points",
        type: "circle",
        source: "amenity-paths",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 10,
          "circle-color": ["coalesce", ["get", "color"], "#38bdf8"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "amenity-path-symbols",
        type: "symbol",
        source: "amenity-paths",
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "icon-image": ["coalesce", ["get", "iconKey"], "amenity-other"],
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            1,
            16,
            1.35,
          ],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "text-field": ["coalesce", ["get", "name"], ""],
          "text-size": 11,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-max-width": 12,
          "text-line-height": 1.15,
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-radial-offset": 1.1,
          "text-justify": "auto",
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-optional": true,
          "symbol-sort-key": ["coalesce", ["get", "distance"], 99999],
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.25,
          "text-halo-blur": 0.4,
        },
      });

      // ── Listing building highlights ────────────────────────────────────────
      // querySourceFeatures for geographic accuracy — avoids the pitch/occlusion
      // problem of screen-space queryRenderedFeatures.
      // Feature state lives on the source, not the tile, and Mapbox replays it onto
      // tiles as they load. So a stamped building stays stamped through eviction and
      // reload, and a listing only ever has to be resolved to its building once.
      const stampedFeatureIds = new Set<string | number>();
      const resolvedListingIds = new Set<string>();
      // mapbox-streets-v8 simplifies building outlines per zoom, so a match made
      // against z14 geometry is not the match z16 would make. Re-resolve when the
      // tile zoom changes; above the source maxzoom the geometry stops changing.
      const BUILDING_SOURCE_MAXZOOM = 16;
      let resolvedAtTileZoom = -1;

      const clearListingHighlights = () => {
        stampedFeatureIds.forEach((id) => {
          map.setFeatureState(
            { source: "composite", sourceLayer: "building", id },
            { listingScore: 0 }
          );
        });
        stampedFeatureIds.clear();
        resolvedListingIds.clear();
      };

      const applyListingHighlights = () => {
        if (!highlightDirtyRef.current) return;
        highlightDirtyRef.current = false;

        // The 3d-buildings layer starts at z14, so below that every listing in the
        // city was being matched against every loaded building for nothing.
        if (map.getZoom() < BUILDINGS_MINZOOM) return;
        const view = map.getBounds();
        if (!view) return;

        const tileZoom = Math.min(Math.floor(map.getZoom()), BUILDING_SOURCE_MAXZOOM);
        if (tileZoom !== resolvedAtTileZoom) {
          clearListingHighlights();
          resolvedAtTileZoom = tileZoom;
        }

        const pending = listingsRef.current.filter(
          (l) => !resolvedListingIds.has(l.id) && view.contains([l.lng, l.lat])
        );
        // Everything on screen is already stamped — skip the geometry extraction
        // entirely. This is what makes panning back over old ground free.
        if (pending.length === 0) return;

        // Only a miss against fully loaded tiles means "no building here". Before
        // that, a miss just means the tile has not arrived, so keep the listing
        // pending and let the next sourcedata/idle pass try again.
        const tilesLoaded = map.isSourceLoaded("composite");

        // Bounds once per building, vertex keys on first use, and a cell index so
        // each listing scans its own block instead of every loaded building.
        const grid = indexBuildings(
          map.querySourceFeatures("composite", {
            sourceLayer: "building",
            filter: ["==", "extrude", "true"],
          })
        );

        for (const listing of pending) {
          // Find nearest building — skip features outside a ~300m bbox first
          const pad = 0.003;
          let nearest: Building | null = null;
          let nearestDist = Infinity;
          for (const bld of grid.near(listing.lng, listing.lat, pad)) {
            const b = bld.bounds;
            if (b.maxLng < listing.lng - pad || b.minLng > listing.lng + pad ||
                b.maxLat < listing.lat - pad || b.minLat > listing.lat + pad) continue;
            const d = minDistToGeom(listing.lng, listing.lat, bld.geometry);
            if (d < nearestDist) { nearestDist = d; nearest = bld; }
          }
          if (!nearest) {
            if (tilesLoaded) resolvedListingIds.add(listing.id);
            continue;
          }
          resolvedListingIds.add(listing.id);

          // Stamp nearest + every building sharing a vertex with it (wider bbox)
          const anchorKeys = new Set(vertexKeysOf(nearest));
          const pad2 = 0.005;
          for (const bld of grid.near(listing.lng, listing.lat, pad2)) {
            const b = bld.bounds;
            if (b.maxLng < listing.lng - pad2 || b.minLng > listing.lng + pad2 ||
                b.maxLat < listing.lat - pad2 || b.minLat > listing.lat + pad2) continue;
            const touches =
              bld.id === nearest.id ||
              vertexKeysOf(bld).some((k) => anchorKeys.has(k));
            if (touches) {
              stampedFeatureIds.add(bld.id);
              map.setFeatureState(
                { source: "composite", sourceLayer: "building", id: bld.id },
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
        clearListingHighlights();
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
      map.on("mouseenter", "amenity-path-symbols", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "amenity-path-points", () => {
        map.getCanvas().style.cursor = "move";
      });
      map.on("mouseleave", "amenity-path-symbols", () => {
        map.getCanvas().style.cursor = "move";
      });
      const openAmenityPopup = (event: mapboxgl.MapLayerMouseEvent) => {
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
            `<div style="font-family:var(--font-dm-sans),sans-serif;color:#0f172a;min-width:240px;max-width:280px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;box-shadow:0 10px 24px rgba(2,6,23,0.16)">
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
      };
      map.on("click", "amenity-path-points", openAmenityPopup);
      map.on("click", "amenity-path-symbols", openAmenityPopup);

      // ── GTA boundary mask ──────────────────────────────────────────────────
      map.addSource("gta-mask", {
        type: "geojson",
        data: maskGeoJson(cityRef.current),
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

      // ── Listing price pins ─────────────────────────────────────────────────
      ensurePinIcons(map, pinColors(listingsRef.current));
      map.addSource("listing-pins", {
        type: "geojson",
        data: pinsGeoJson(listingsRef.current),
      });
      map.addLayer({
        id: "listing-pins",
        type: "symbol",
        source: "listing-pins",
        filter: selectedPinFilter(selectedIdRef.current, false),
        layout: {
          "icon-image": ["concat", "pin-", ["get", "color"]],
          "icon-text-fit": "width",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "price"],
          "text-font": PIN_FONT,
          "text-size": 11,
          // The DOM markers were anchored bottom, so the pill sat above the point.
          "text-anchor": "bottom",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          // Best-scoring listings draw on top.
          "symbol-sort-key": ["-", 100, ["get", "score"]],
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "listing-pin-selected",
        type: "symbol",
        source: "listing-pins",
        filter: selectedPinFilter(selectedIdRef.current),
        layout: {
          "icon-image": ["concat", "pin-sel-", ["get", "color"]],
          "icon-text-fit": "width",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "price"],
          "text-font": PIN_FONT,
          // 11 × the 1.15 scale the selected DOM marker used.
          "text-size": 12.65,
          "text-anchor": "bottom",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      for (const layer of ["listing-pins", "listing-pin-selected"]) {
        map.on("click", layer, (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectRef.current(id);
        });
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = "move"; });
      }

      renderAmenityPaths();
    });

    return () => {
      amenityPopupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-centre map, bounds, and mask when the selected city changes
  useEffect(() => {
    cityRef.current = cityConfig;
    const map = mapRef.current;
    if (!map) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setMaxBounds(null as any);
    map.jumpTo({ center: cityConfig.center, zoom: cityConfig.zoom });
    map.setMaxBounds(maxBounds(cityConfig));
    const src = map.getSource("gta-mask") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(maskGeoJson(cityConfig));
  }, [cityConfig]);

  // Re-feed the pin source when the set of listings changes (filter/search/city)
  useEffect(() => {
    const map = mapRef.current;
    // Before load the source does not exist yet and the load handler seeds it
    // from listingsRef; after load, setData works regardless of tile state.
    const source = map?.getSource("listing-pins") as mapboxgl.GeoJSONSource | undefined;
    if (!map || !source) return;

    ensurePinIcons(map, pinColors(listings));
    source.setData(pinsGeoJson(listings));

    // Re-stamp building colors when listings change
    triggerHighlightRef.current?.();
    // listingsKey stands in for listings on purpose: re-scoring on a prefs change
    // rebuilds the array but not the pin set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsKey]);

  // Highlight the selected pin + fly to it
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("listing-pin-selected")) {
      map.setFilter("listing-pins", selectedPinFilter(selectedId, false));
      map.setFilter("listing-pin-selected", selectedPinFilter(selectedId));
    }

    if (selectedId && mapRef.current) {
      const listing = listingsRef.current.find((l) => l.id === selectedId);
      if (listing) {
        mapRef.current.flyTo({
          center: [listing.lng, listing.lat],
          zoom: SELECT_ZOOM,
          pitch: SELECT_PITCH,
          duration: 900,
          essential: true,
        });
      }
    }
  }, [selectedId]);

  useEffect(() => {
    renderAmenityPaths();
  }, [selectedId, listingsKey, selectedAmenities]);

  // Warm the building tiles for the listings most likely to be opened next, so
  // selecting one flies into geometry that is already parsed and on the GPU.
  // preloadOnly clones the transform, so this never moves the camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("listing-pins")) return;

    const timers = listings.slice(0, PRELOAD_COUNT).map((listing, i) =>
      window.setTimeout(() => {
        // jumpTo calls stop() internally, which would abort a flyTo in progress,
        // and preloading should never compete with a gesture for bandwidth.
        if (map.isMoving()) return;
        map.jumpTo({
          center: [listing.lng, listing.lat],
          zoom: SELECT_ZOOM,
          pitch: SELECT_PITCH,
          preloadOnly: true,
        });
      }, 400 + i * 250)
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsKey]);

  // Toggle POI/transit labels via Mapbox Standard style config
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).setConfigProperty("basemap", "showPointOfInterestLabels", poisVisible);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).setConfigProperty("basemap", "showTransitLabels", poisVisible);
  }, [poisVisible]);

  useEffect(() => {
    if (isAmenityLoading) {
      if (loadingHideTimerRef.current) {
        clearTimeout(loadingHideTimerRef.current);
        loadingHideTimerRef.current = null;
      }
      loadingShownAtRef.current = Date.now();
      setShowAmenityLoading(true);
      return;
    }

    const elapsed = Date.now() - loadingShownAtRef.current;
    const minVisibleMs = 650;
    const remaining = Math.max(0, minVisibleMs - elapsed);
    loadingHideTimerRef.current = setTimeout(() => {
      setShowAmenityLoading(false);
      loadingHideTimerRef.current = null;
    }, remaining);
  }, [isAmenityLoading]);

  useEffect(() => {
    return () => {
      if (loadingHideTimerRef.current) clearTimeout(loadingHideTimerRef.current);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {showAmenityLoading && (
        <div
          className="absolute left-4 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md animate-pulse"
          style={{
            backgroundColor: "rgba(250,248,245,0.96)",
            borderColor: "var(--line)",
            color: "var(--foreground)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span className="relative inline-flex h-5 w-5 items-center justify-center">
            <span
              className="absolute inset-0 animate-spin rounded-full"
              style={{ border: "2px solid var(--brand)", borderTopColor: "transparent" }}
            />
            <svg
              viewBox="0 0 24 24"
              width="10"
              height="10"
              aria-hidden="true"
              style={{ color: "var(--brand)" }}
            >
              <path
                fill="currentColor"
                d="M12 2a6 6 0 0 0-6 6c0 4.4 6 12 6 12s6-7.6 6-12a6 6 0 0 0-6-6Zm0 8.25A2.25 2.25 0 1 1 12 5.75a2.25 2.25 0 0 1 0 4.5Z"
              />
            </svg>
          </span>
          Loading tethers...
        </div>
      )}
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

// Price pins live in a symbol layer, not in DOM markers: a city can return 1,300+
// listings and Mapbox repositions every DOM marker on every frame, which is what
// pinned panning at single-digit fps. Symbols are drawn on the GPU and Mapbox
// declutters them for free.

// Mapbox symbols can only use fonts served from its glyph endpoint, and this
// account 404s on DM Sans — Open Sans Bold is the nearest match to the 700-weight
// DM Sans the DOM markers used. Upload DM Sans in Mapbox Studio to use it here.
const PIN_FONT = ["Open Sans Bold", "Arial Unicode MS Bold"];

// Drawn at 2× so the pill is 20 CSS px tall; only the flat middle stretches, so
// icon-text-fit can widen it to whatever the price string needs.
function pillImage(fill: string, border: string): ImageData | null {
  const W = 64, H = 40;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.roundRect(2, 2, W - 4, H - 4, (H - 4) / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();
  return ctx.getImageData(0, 0, W, H);
}

// Taken from the data rather than a hardcoded band list, so a new score colour
// can never resolve to a missing icon.
function pinColors(listings: Listing[]): Set<string> {
  return new Set(listings.map((l) => scoreColor(l.score)));
}

function ensurePinIcons(map: mapboxgl.Map, colors: Iterable<string>): void {
  for (const color of colors) {
    for (const [key, border] of [[`pin-${color}`, "#ffffff"], [`pin-sel-${color}`, "#0f172a"]]) {
      if (map.hasImage(key)) continue;
      const image = pillImage(color, border);
      if (image) {
        map.addImage(key, image, { pixelRatio: 2, stretchX: [[24, 40]], content: [22, 6, 42, 34] });
      }
    }
  }
}

function pinsGeoJson(listings: Listing[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: listings.map((l) => ({
      type: "Feature",
      properties: { id: l.id, price: l.shortPrice, color: scoreColor(l.score), score: l.score },
      geometry: { type: "Point", coordinates: [l.lng, l.lat] },
    })),
  };
}

function selectedPinFilter(selectedId: string | null, match = true): mapboxgl.FilterSpecification {
  return [match ? "==" : "!=", ["get", "id"], selectedId ?? ""];
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

function normalizeAmenityType(type: string): string {
  return (type || "other").toLowerCase();
}

function amenityIconKey(type: string): string {
  const normalized = normalizeAmenityType(type);
  return `amenity-${AMENITY_ICON_ASSET_BY_TYPE[normalized] ? normalized : "other"}`;
}

async function ensureAmenityIcons(map: mapboxgl.Map): Promise<void> {
  const entries = Object.entries(AMENITY_ICON_ASSET_BY_TYPE);
  await Promise.all(
    entries.map(async ([type, path]) => {
      const key = `amenity-${type}`;
      if (map.hasImage(key)) return;
      const image = await loadIconImage(path);
      if (!map.hasImage(key)) {
        map.addImage(key, image, { pixelRatio: 2 });
      }
    })
  );
}

function loadIconImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Unable to load icon at ${path}`));
    img.src = path;
  });
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

