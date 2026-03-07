"use client";

/**
 * Avenue-X: Macro Search Map (Step 1)
 *
 * This is the landing page. Users view a 2D map of the city with rental pins.
 * Clicking a pin transitions to the 3D Diorama (/diorama).
 *
 * Note: Requires NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to load Mapbox tiles.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
// @ts-ignore
import Map, { Marker, Popup } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, Building2, ChevronRight, Activity } from "lucide-react";

import listingsData from "../../data/rentfaster-listings.livable-data.json";

// Map the real JSON data into the format our map expects
const MOCK_PROPERTIES = listingsData.slice(0, 10).map((listing: any, index: number) => ({
  id: `prop-${listing.listing_id || index}`,
  address: listing.location,
  price: parseInt(String(listing.price).replace(/[^0-9]/g, "")) || 0,
  lat: listing.lat,
  lng: listing.lng,
  score: 85, // Vitality Score placeholder
  type: listing.title?.toLowerCase().includes("apartment") ? "Apartment" : "House",
}));

export default function Home() {
  const router = useRouter();
  const [selectedProperty, setSelectedProperty] = useState<
    typeof MOCK_PROPERTIES[0] | null
  >(null);

  // Default viewport centered on the first imported property
  const [viewState, setViewState] = useState({
    longitude: MOCK_PROPERTIES[0]?.lng || -80.525,
    latitude: MOCK_PROPERTIES[0]?.lat || 43.47,
    zoom: 13,
    pitch: 45,
    bearing: -17.6,
  });

  const handleDive = (prop: typeof MOCK_PROPERTIES[0]) => {
    // Navigate to 3D diorama with query params
    const params = new URLSearchParams({
      lat: prop.lat.toString(),
      lng: prop.lng.toString(),
      address: prop.address,
      price: prop.price.toString(),
    });
    router.push(`/diorama?${params.toString()}`);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black text-white">
      {/* Mapbox Canvas */}
      <Map
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Render Property Pins */}
        {MOCK_PROPERTIES.map((prop) => (
          <Marker
            key={prop.id}
            longitude={prop.lng}
            latitude={prop.lat}
            anchor="bottom"
            onClick={(e: any) => {
              e.originalEvent.stopPropagation(); // prevent map click
              setSelectedProperty(prop);
            }}
          >
            <div className="relative group cursor-pointer animate-bounce-slow">
              <div className="absolute -inset-2 bg-blue-500/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
              <MapPin className="relative w-8 h-8 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            </div>
          </Marker>
        ))}

        {/* Selected Property Popup */}
        {selectedProperty && (
          <Popup
            longitude={selectedProperty.lng}
            latitude={selectedProperty.lat}
            anchor="top"
            onClose={() => setSelectedProperty(null)}
            closeButton={false}
            className="z-50"
            offset={[0, 10]}
          >
            {/* Custom styled popup content using Tailwind (overrides Mapbox defaults) */}
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-4 shadow-2xl min-w-[280px] text-white">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    {selectedProperty.address}
                  </h3>
                  <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                    <Building2 className="w-3 h-3" /> {selectedProperty.type}
                  </p>
                </div>
                <div className="bg-slate-800 rounded-lg px-2 py-1 border border-slate-700">
                  <span className="text-lg font-black text-blue-400">
                    ${selectedProperty.price}
                  </span>
                  <span className="text-xs text-slate-500 block text-right">
                    /mo
                  </span>
                </div>
              </div>

              {/* Vitality Preview */}
              <div className="bg-slate-800/50 rounded-lg p-3 mb-4 flex items-center justify-between border border-slate-700/50">
                <span className="text-xs font-semibold tracking-wider text-slate-300 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  VITALITY SCORE
                </span>
                <span
                  className={`text-xl font-bold ${
                    selectedProperty.score >= 80
                      ? "text-emerald-400"
                      : selectedProperty.score >= 50
                      ? "text-amber-400"
                      : "text-red-400"
                  }`}
                >
                  {selectedProperty.score}
                </span>
              </div>

              {/* Dive Button */}
              <button
                onClick={() => handleDive(selectedProperty)}
                className="w-full relative group overflow-hidden bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                DIVE TO 3D DIORAMA
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </Popup>
        )}
      </Map>

      {/* UI Overlay: Header */}
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h1 className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-600 drop-shadow-md">
          AVENUE-X
        </h1>
        <p className="text-sm font-semibold tracking-widest text-slate-400 uppercase mt-1 drop-shadow">
          Select a property to scan
        </p>
      </div>

      {/* No Token Warning */}
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-red-500/90 text-white px-6 py-3 rounded-full font-bold shadow-lg border border-red-400 backdrop-blur-sm animate-pulse flex items-center gap-3">
          <MapPin className="w-5 h-5" />
          Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
        </div>
      )}
    </main>
  );
}
