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
  isSmallBusiness?: boolean;
  rating?: number;
  walkMinutes?: number;
  address?: string | null;
  description?: string;
  source?: string;
}

interface MapboxMapProps {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedAmenities?: SelectedAmenity[];
}

type BuildingId = string | number;

export function MapboxMap({ listings, selectedId, onSelect, selectedAmenities = [] }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const listingsRef = useRef(listings);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);

  const listingToFeatureIdsRef = useRef<Map<string, Set<BuildingId>>>(new Map());
  const featureToListingIdRef = useRef<Map<BuildingId, string>>(new Map());
  const listingAnchorRef = useRef<Map<string, [number, number]>>(new Map());
  const listingFootprintRef = useRef<Map<string, GeoJSON.Geometry>>(new Map());
  const activeSelectedBuildingIdsRef = useRef<Set<BuildingId>>(new Set());
  const amenityPopupRef = useRef<mapboxgl.Popup | null>(null);
  const highlightDirtyRef = useRef(true);
  const triggerHighlightRef = useRef<(() => void) | null>(null);
  const [poisVisible, setPoisVisible] = useState(false);

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  function setSelectedBuildingState(map: mapboxgl.Map, nextSelectedId: string | null) {
    for (const featureId of activeSelectedBuildingIdsRef.current) {
      map.setFeatureState(
        { source: "composite", sourceLayer: "building", id: featureId },
        { selected: false },
      );
    }
    activeSelectedBuildingIdsRef.current.clear();

    if (!nextSelectedId) return;
    const ids = listingToFeatureIdsRef.current.get(nextSelectedId);
    if (!ids) return;

    for (const featureId of ids) {
      map.setFeatureState(
        { source: "composite", sourceLayer: "building", id: featureId },
        { selected: true },
      );
      activeSelectedBuildingIdsRef.current.add(featureId);
    }
  }

  const addMarker = (map: mapboxgl.Map, listing: Listing, active: boolean) => {
    const element = document.createElement("div");
    element.style.cssText = markerBaseStyle(active, listing.score);
    element.dataset.score = String(listing.score);
    element.textContent = listing.shortPrice;
    element.addEventListener("click", () => onSelectRef.current(listing.id));

    const marker = new mapboxgl.Marker({ element, anchor: "bottom" })
      .setLngLat(listingAnchorRef.current.get(listing.id) ?? [listing.lng, listing.lat])
      .addTo(map);

    markersRef.current.set(listing.id, marker);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const styleFromEnv = process.env.NEXT_PUBLIC_MAPBOX_STYLE;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleFromEnv || "mapbox://styles/mapbox/standard",
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

    const pulseInterval = window.setInterval(() => {
      if (!map.getLayer("selected-bubble")) return;
      const t = Date.now() / 550;
      const radius = 20 + Math.sin(t) * 5;
      map.setPaintProperty("selected-bubble", "circle-radius", radius);
      if (map.getLayer("selected-footprint-fill")) {
        const alpha = 0.16 + ((Math.sin(t) + 1) / 2) * 0.12;
        map.setPaintProperty("selected-footprint-fill", "fill-opacity", alpha);
      }
      if (map.getLayer("selected-footprint-line")) {
        const width = 2.5 + ((Math.sin(t) + 1) / 2) * 2;
        map.setPaintProperty("selected-footprint-line", "line-width", width);
      }
    }, 120);

    map.on("load", () => {
      map.setFog({
        range: [0.5, 6],
        color: "#f5f0e8",
        "horizon-blend": 0.04,
      });

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
        minzoom: 10,
        paint: {
          "fill-extrusion-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#16A34A",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 85],
            "#15803d",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 75],
            "#4ade80",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 65],
            "#fbbf24",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 55],
            "#f97316",
            [">=", ["coalesce", ["feature-state", "listingScore"], 0], 35],
            "#dc2626",
            "#f6f5f4",
          ],
          "fill-extrusion-height": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            ["+", ["coalesce", ["get", "height"], 0], 20],
            ["coalesce", ["get", "height"], 0],
          ],
          "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
          "fill-extrusion-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0.88,
          ],
        },
      });

      map.addLayer({
        id: "3d-buildings-selected-shell",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 10,
        paint: {
          "fill-extrusion-color": "#22C55E",
          "fill-extrusion-height": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            ["+", ["coalesce", ["get", "height"], 0], 34],
            0,
          ],
          "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
          "fill-extrusion-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.38,
            0,
          ],
        },
      });

      map.addSource("selected-listing", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      map.addLayer({
        id: "selected-bubble",
        type: "circle",
        source: "selected-listing",
        paint: {
          "circle-radius": 20,
          "circle-color": "#22c55e",
          "circle-opacity": 0.2,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#16a34a",
        },
      });
      map.addLayer({
        id: "selected-core",
        type: "circle",
        source: "selected-listing",
        paint: {
          "circle-radius": 7,
          "circle-color": "#16a34a",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.98,
        },
      });
      map.addSource("selected-footprint", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      map.addLayer({
        id: "selected-footprint-fill",
        type: "fill",
        source: "selected-footprint",
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.24,
        },
      });
      map.addLayer({
        id: "selected-footprint-line",
        type: "line",
        source: "selected-footprint",
        paint: {
          "line-color": "#16a34a",
          "line-width": 3,
          "line-opacity": 0.95,
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
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#38bdf8"],
          "line-width": 2.8,
          "line-opacity": 0.88,
        },
      });
      map.addLayer({
        id: "amenity-path-points",
        type: "circle",
        source: "amenity-paths",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.98,
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            8,
            5.5,
          ],
          "circle-color": ["coalesce", ["get", "color"], "#38bdf8"],
        },
      });
      map.addLayer({
        id: "amenity-path-labels",
        type: "symbol",
        source: "amenity-paths",
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-anchor": "top",
          "text-offset": [0, 0.8],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });

      const listingFeatureIds = new Set<BuildingId>();

      const applyListingHighlights = () => {
        if (!highlightDirtyRef.current) return;
        highlightDirtyRef.current = false;

        for (const id of listingFeatureIds) {
          map.setFeatureState(
            { source: "composite", sourceLayer: "building", id },
            { listingScore: 0, selected: false },
          );
        }
        listingFeatureIds.clear();
        listingToFeatureIdsRef.current.clear();
        featureToListingIdRef.current.clear();
        listingAnchorRef.current.clear();
        listingFootprintRef.current.clear();

        const buildingFeatures = map.querySourceFeatures("composite", {
          sourceLayer: "building",
          filter: ["==", "extrude", "true"],
        });

        for (const listing of listingsRef.current) {
          const pad = 0.003;
          let nearest: (typeof buildingFeatures)[number] | null = null;
          let nearestDist = Infinity;
          for (const feature of buildingFeatures) {
            if (feature.id == null) continue;
            const b = geomBounds(feature.geometry);
            if (!b || b.maxLng < listing.lng - pad || b.minLng > listing.lng + pad ||
                       b.maxLat < listing.lat - pad || b.minLat > listing.lat + pad) continue;
            const d = minDistToGeom(listing.lng, listing.lat, feature.geometry);
            if (d < nearestDist) {
              nearestDist = d;
              nearest = feature;
            }
          }
          if (!nearest) continue;
          const nearestBounds = geomBounds(nearest.geometry);
          if (nearestBounds) {
            listingAnchorRef.current.set(listing.id, [
              (nearestBounds.minLng + nearestBounds.maxLng) / 2,
              (nearestBounds.minLat + nearestBounds.maxLat) / 2,
            ]);
          }
          listingFootprintRef.current.set(
            listing.id,
            JSON.parse(JSON.stringify(nearest.geometry)) as GeoJSON.Geometry,
          );

          const anchorKeys = vertexKeySet(nearest.geometry, 5);
          const idsForListing = new Set<BuildingId>();
          const pad2 = 0.005;

          for (const feature of buildingFeatures) {
            if (feature.id == null) continue;
            const b = geomBounds(feature.geometry);
            if (!b || b.maxLng < listing.lng - pad2 || b.minLng > listing.lng + pad2 ||
                       b.maxLat < listing.lat - pad2 || b.minLat > listing.lat + pad2) continue;
            const touches =
              feature.id === nearest.id ||
              vertexKeys(feature.geometry, 5).some((key) => anchorKeys.has(key));
            if (!touches) continue;

            listingFeatureIds.add(feature.id);
            idsForListing.add(feature.id);
            featureToListingIdRef.current.set(feature.id, listing.id);
            map.setFeatureState(
              { source: "composite", sourceLayer: "building", id: feature.id },
              { listingScore: listing.score },
            );
          }

          if (idsForListing.size > 0) {
            listingToFeatureIdsRef.current.set(listing.id, idsForListing);
          }
        }

        setSelectedBuildingState(map, selectedIdRef.current);

        for (const listing of listingsRef.current) {
          const marker = markersRef.current.get(listing.id);
          if (!marker) continue;
          marker.setLngLat(listingAnchorRef.current.get(listing.id) ?? [listing.lng, listing.lat]);
        }
      };

      let highlightTimer: number | null = null;
      const scheduleHighlight = () => {
        if (!highlightDirtyRef.current) return;
        if (highlightTimer) window.clearTimeout(highlightTimer);
        highlightTimer = window.setTimeout(applyListingHighlights, 180);
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

      map.on("mouseenter", "3d-buildings", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "3d-buildings", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "3d-buildings", (event) => {
        const featureId = event.features?.[0]?.id as BuildingId | undefined;
        if (featureId != null) {
          const mappedListingId = featureToListingIdRef.current.get(featureId);
          if (mappedListingId) {
            onSelectRef.current(mappedListingId);
            return;
          }
        }

        const clicked = event.lngLat;
        const nearestListing = listingsRef.current
          .map((listing) => ({
            listing,
            distance: Math.hypot(
              (listingAnchorRef.current.get(listing.id)?.[0] ?? listing.lng) - clicked.lng,
              (listingAnchorRef.current.get(listing.id)?.[1] ?? listing.lat) - clicked.lat,
            ),
          }))
          .sort((a, b) => a.distance - b.distance)[0]?.listing;

        if (nearestListing) onSelectRef.current(nearestListing.id);
      });

      map.on("mouseenter", "amenity-path-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "amenity-path-points", () => {
        map.getCanvas().style.cursor = "";
        map.removeFeatureState({ source: "amenity-paths" }, "hover");
      });
      map.on("mousemove", "amenity-path-points", (event) => {
        map.removeFeatureState({ source: "amenity-paths" }, "hover");
        const hovered = event.features?.[0];
        if (!hovered || hovered.id == null) return;
        map.setFeatureState(
          { source: "amenity-paths", id: hovered.id },
          { hover: true },
        );
      });

      map.on("click", "amenity-path-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;

        const props = feature.properties ?? {};
        const name = String(props.name ?? "Amenity");
        const type = String(props.type ?? "other");
        const distance = Number(props.distance ?? 0);
        const rating = Number(props.rating ?? 0);
        const walkMinutes = Number(props.walkMinutes ?? 0);
        const isSmallBusiness = String(props.isSmallBusiness ?? "false") === "true";
        const address = String(props.address ?? "");
        const description = String(props.description ?? "");
        const source = String(props.source ?? "Live amenity data");
        const lngLat = feature.geometry.coordinates as [number, number];

        amenityPopupRef.current?.remove();
        amenityPopupRef.current = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: "300px",
          className: "amenity-popup",
        })
          .setLngLat(lngLat)
          .setHTML(
            `<div style="font-family:Inter,sans-serif;color:#0f172a;min-width:240px;max-width:280px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;box-shadow:0 10px 24px rgba(2,6,23,0.14)">
              <div style="padding:10px 12px;background:linear-gradient(135deg,#ecfdf5 0%,#eff6ff 100%);border-bottom:1px solid #dcfce7">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <div style="font-size:13px;font-weight:800;line-height:1.3">${escapeHtml(name)}</div>
                  ${Number.isFinite(rating) && rating > 0 ? `<span style="font-size:11px;font-weight:800;background:#166534;color:#ecfdf5;padding:3px 8px;border-radius:999px">${Math.round(rating)}/100</span>` : ""}
                </div>
                <div style="font-size:11px;color:#334155;margin-top:4px;font-weight:600">${escapeHtml(formatAmenityType(type))}</div>
              </div>
              <div style="padding:10px 12px">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                  <span style="font-size:11px;background:#f1f5f9;color:#334155;padding:3px 8px;border-radius:999px;font-weight:600">${Number.isFinite(distance) ? `${Math.round(distance)}m away` : "Distance n/a"}</span>
                  <span style="font-size:11px;background:#eff6ff;color:#1e3a8a;padding:3px 8px;border-radius:999px;font-weight:600">${Number.isFinite(walkMinutes) && walkMinutes > 0 ? `${Math.round(walkMinutes)} min walk` : "Walk n/a"}</span>
                  ${isSmallBusiness ? '<span style="font-size:11px;background:#fefce8;color:#854d0e;padding:3px 8px;border-radius:999px;font-weight:700">Local small business</span>' : ""}
                </div>
                ${address ? `<div style="font-size:11px;color:#334155;margin-bottom:6px;line-height:1.35">${escapeHtml(address)}</div>` : ""}
                ${description ? `<div style="font-size:11px;color:#64748b;margin-bottom:6px;line-height:1.45">${escapeHtml(description)}</div>` : ""}
                <div style="font-size:10px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:6px">Source: ${escapeHtml(source)}</div>
              </div>
            </div>`,
          )
          .addTo(map);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty?.("basemap", "showPointOfInterestLabels", poisVisible);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty?.("basemap", "showTransitLabels", poisVisible);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty?.("basemap", "show3dFacades", true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setConfigProperty?.("basemap", "show3dBuildings", true);

      for (const listing of listingsRef.current) {
        addMarker(map, listing, listing.id === selectedIdRef.current);
      }
    });

    // If a custom style URL fails (common with private/non-shared styles),
    // fall back to a guaranteed public Mapbox style so the map stays visible.
    map.on("error", (event) => {
      const styleError = event.error && String(event.error.message || event.error);
      if (!styleError) return;
      if (!styleError.toLowerCase().includes("style")) return;
      if (map.getStyle()?.sprite?.includes("mapbox/standard")) return;
      try {
        map.setStyle("mapbox://styles/mapbox/standard");
      } catch {
        // no-op
      }
    });

    const markers = markersRef.current;
    return () => {
      amenityPopupRef.current?.remove();
      window.clearInterval(pulseInterval);
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const currentIds = new Set(listings.map((listing) => listing.id));
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

    triggerHighlightRef.current?.();
  }, [listings, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    markersRef.current.forEach((marker, id) => {
      applyMarkerStyle(marker.getElement(), id === selectedId);
    });

    setSelectedBuildingState(map, selectedId);

    const selectedListing = selectedId ? listings.find((listing) => listing.id === selectedId) : null;
    const selectedAnchor = selectedListing
      ? (listingAnchorRef.current.get(selectedListing.id) ?? [selectedListing.lng, selectedListing.lat])
      : null;
    const selectedSource = map.getSource("selected-listing") as mapboxgl.GeoJSONSource | undefined;
    const selectedFootprint = map.getSource("selected-footprint") as mapboxgl.GeoJSONSource | undefined;
    if (selectedSource) {
      selectedSource.setData(
        selectedListing && selectedAnchor
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { id: selectedListing.id },
                  geometry: {
                    type: "Point",
                    coordinates: selectedAnchor,
                  },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] },
      );
    }
    if (selectedFootprint) {
      const footprint = selectedListing ? listingFootprintRef.current.get(selectedListing.id) : null;
      selectedFootprint.setData(
        footprint
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: footprint,
                },
              ],
            }
          : { type: "FeatureCollection", features: [] },
      );
    }

    if (selectedListing && selectedAnchor) {
      map.flyTo({
        center: selectedAnchor,
        zoom: 17.5,
        pitch: 52,
        duration: 900,
        essential: true,
      });
    }
  }, [selectedId, listings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const selectedListing = selectedId ? listings.find((listing) => listing.id === selectedId) : null;
    const selectedAnchor = selectedListing
      ? (listingAnchorRef.current.get(selectedListing.id) ?? [selectedListing.lng, selectedListing.lat])
      : null;
    const source = map.getSource("amenity-paths") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    if (!selectedListing || !selectedAnchor) {
      source.setData({ type: "FeatureCollection", features: [] });
      amenityPopupRef.current?.remove();
      return;
    }

    const features: GeoJSON.Feature[] = [];
    let idx = 0;
    for (const amenity of selectedAmenities) {
      const [lat, lng] = amenity.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const color = colorForAmenityType(amenity.type);

      features.push({
        type: "Feature",
        id: `line-${amenity.id}`,
        properties: {
          id: `line-${amenity.id}`,
          name: amenity.name,
          type: amenity.type,
          color,
          distance: amenity.distance,
        },
        geometry: {
          type: "LineString",
          coordinates: [
            selectedAnchor,
            [lng, lat],
          ],
        },
      });

      features.push({
        type: "Feature",
        id: `point-${amenity.id}-${idx}`,
        properties: {
          id: amenity.id,
          name: amenity.name,
          type: amenity.type,
          color,
          distance: amenity.distance,
          rating: amenity.rating ?? null,
          walkMinutes: amenity.walkMinutes ?? null,
          address: amenity.address ?? "",
          description: amenity.description ?? "",
          source: amenity.source ?? "OpenStreetMap",
          isSmallBusiness: Boolean(amenity.isSmallBusiness),
        },
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      });
      idx += 1;
    }

    source.setData({
      type: "FeatureCollection",
      features,
    });
  }, [selectedAmenities, selectedId, listings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).setConfigProperty?.("basemap", "showPointOfInterestLabels", poisVisible);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).setConfigProperty?.("basemap", "showTransitLabels", poisVisible);
  }, [poisVisible]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={() => setPoisVisible((v) => !v)}
        className="absolute bottom-[88px] right-3 z-10 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md transition hover:bg-slate-50"
      >
        {poisVisible ? "Hide POIs" : "Show POIs"}
      </button>
    </div>
  );
}

function colorForAmenityType(type: string): string {
  switch (type) {
    case "grocery":
      return "#22C55E";
    case "pharmacy":
    case "healthcare":
      return "#EC4899";
    case "cafe":
    case "restaurant":
      return "#F97316";
    case "park":
      return "#10B981";
    case "transit":
      return "#3B82F6";
    default:
      return "#38BDF8";
  }
}

function formatAmenityType(type: string): string {
  switch (type) {
    case "grocery":
      return "Grocery Store";
    case "pharmacy":
      return "Pharmacy";
    case "healthcare":
      return "Healthcare";
    case "cafe":
      return "Cafe";
    case "restaurant":
      return "Restaurant";
    case "park":
      return "Park";
    case "transit":
      return "Transit Stop";
    default:
      return "Amenity";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function minDistToGeom(px: number, py: number, geom: GeoJSON.Geometry): number {
  let min = Infinity;
  for (const ring of rings(geom)) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
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
  return rings(geom)
    .flat()
    .map(([vx, vy]) => `${vx.toFixed(decimals)},${vy.toFixed(decimals)}`);
}

function geomBounds(geom: GeoJSON.Geometry): { minLng: number; maxLng: number; minLat: number; maxLat: number } | null {
  const r = rings(geom);
  if (r.length === 0) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
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
