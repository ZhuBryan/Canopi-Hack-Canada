"use client";

/**
 * Avenue-X: Diorama Interactive Page (/diorama)
 *
 * Full-screen 3D canvas rendering the Spatial Scorecard.
 * Now hooked into the live Overpass Vitality API for real data.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import DioramaScene from "@/components/three/DioramaScene";
import type { RentalListing, Amenity } from "@/lib/types";

export default function DioramaPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-[#0A0A1A]" />}>
      <DioramaPageInner />
    </Suspense>
  );
}

function DioramaPageInner() {
  const searchParams = useSearchParams();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const addressParam = searchParams.get("address") || "Unknown Location";
  const priceParam = searchParams.get("price") || "0";
  const propertyTypeParam = searchParams.get("propertyType");
  const storiesParam = searchParams.get("stories");

  const [listing, setListing] = useState<RentalListing | null>(null);
  const [vitalityScore, setVitalityScore] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [transportMode, setTransportMode] = useState<"walking" | "driving">("walking");

  useEffect(() => {
    async function fetchVitality() {
      if (!latParam || !lngParam) return;

      try {
        const res = await fetch(`/api/vitality?lat=${latParam}&lng=${lngParam}`);
        const data = await res.json();
        
        if (data.amenities) {
          const trimmedAmenities = [...data.amenities]
            .sort((a: Amenity, b: Amenity) => a.distance - b.distance)
            .slice(0, 20);

          // Construct the listing from URL params + API amenities
          const newListing: RentalListing = {
            id: `listing-${Date.now()}`,
            address: addressParam,
            coordinates: { lat: parseFloat(latParam), lng: parseFloat(lngParam) },
            price: parseInt(priceParam, 10),
            stories: storiesParam ? Math.max(1, parseInt(storiesParam, 10) || 1) : 6,
            propertyType:
              propertyTypeParam === "house" || propertyTypeParam === "apartment"
                ? propertyTypeParam
                : "apartment",
            amenities: trimmedAmenities.map((a: Amenity) => ({
              ...a,
              // Randomly assign some local places as "small business" for the golden tether effect
              isSmallBusiness: a.type === "cafe" || a.type === "restaurant" ? Math.random() > 0.5 : false,
            })),
          };
          
          setListing(newListing);
          setVitalityScore(data.vitalityScore);
        }
      } catch (error) {
        console.error("Failed to fetch vitality score:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchVitality();
  }, [latParam, lngParam, addressParam, priceParam, propertyTypeParam, storiesParam]);

  if (!latParam || !lngParam) {
    return (
      <div className="w-screen h-screen bg-[#0A0A1A] text-white flex items-center justify-center font-bold">
        Error: Missing coordinates. Please select a property from the map.
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0A0A1A", position: "relative" }}>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 bg-[#0A0A1A] bg-opacity-90 backdrop-blur-md flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
          <h2 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-600 animate-pulse">
            SCANNING AREA
          </h2>
          <p className="text-slate-400 mt-2 tracking-widest text-sm">QUERYING OVERPASS NETWORK...</p>
        </div>
      )}

      {/* 3D Canvas */}
      {!isLoading && listing && (
        <Canvas
          camera={{ position: [15, 12, 15], fov: 50, near: 0.1, far: 200 }}
          gl={{
            antialias: true,
            toneMapping: 0, // NoToneMapping
            toneMappingExposure: 1.5,
          }}
          dpr={[1, 2]}
          style={{ width: "100%", height: "100%" }}
        >
          <DioramaScene listing={listing} vitalityScore={vitalityScore} transportMode={transportMode} />
        </Canvas>
      )}

      {/* 2D Overlay — Rental Info Panel */}
      {!isLoading && listing && (
        <div
          style={{
            position: "absolute",
            top: "24px",
            left: "24px",
            maxWidth: "320px",
            padding: "24px",
            borderRadius: "16px",
            background: "rgba(10, 10, 30, 0.8)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(0, 212, 255, 0.15)",
            color: "#ffffff",
            fontFamily: "var(--font-geist-sans), 'Inter', sans-serif",
            zIndex: 10,
          }}
        >
          {/* Title */}
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "#00D4FF",
              marginBottom: "8px",
            }}
          >
            AVENUE-X SPATIAL SCORECARD
          </div>

          <h2
            style={{
              margin: "0 0 4px 0",
              fontSize: "22px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {listing.address.split(",")[0]}
          </h2>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "13px",
              color: "#888",
            }}
          >
            {listing.address}
          </p>

          {/* Price */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "16px",
            }}
          >
            <span
              style={{
                fontSize: "28px",
                fontWeight: 800,
                background: "linear-gradient(135deg, #00D4FF, #7B68FF)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ${listing.price.toLocaleString()}
            </span>
            <span style={{ fontSize: "13px", color: "#666" }}>/month</span>
          </div>

          {/* Vitality Score */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "12px", color: "#aaa", fontWeight: 600 }}>
                VITALITY SCORE
              </span>
              <span
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: vitalityScore > 70 ? "#4ADE80" : vitalityScore > 40 ? "#FBBF24" : "#FF1493", // Vivirion Pink for low score!
                }}
              >
                {vitalityScore}
              </span>
            </div>
            {/* Score bar */}
            <div
              style={{
                height: "6px",
                borderRadius: "3px",
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${vitalityScore}%`,
                  borderRadius: "3px",
                  background:
                    vitalityScore > 70
                      ? "linear-gradient(90deg, #22C55E, #4ADE80)"
                      : vitalityScore > 40
                      ? "linear-gradient(90deg, #F59E0B, #FBBF24)"
                      : "linear-gradient(90deg, #FF1493, #FF69B4)", // Vivirion Pink gradient
                  transition: "width 1s ease-out",
                }}
              />
            </div>
          </div>

          {/* Amenity breakdown */}
          <div style={{ fontSize: "12px", color: "#999" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px", color: "#ccc" }}>
              NEARBY ({listing.amenities.length} places within 500m)
            </div>
            {listing.amenities.length === 0 && (
              <div style={{ color: "#666", fontStyle: "italic" }}>No amenities found in this radius.</div>
            )}
            {listing.amenities.slice(0, 7).map((a, i) => (
              <div
                key={a.id || i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span title={a.name} style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "200px"
                }}>
                  <span style={{ 
                    color: a.type === "healthcare" ? "#FF1493" : (a.isSmallBusiness ? "#FFD700" : "inherit") 
                  }}>
                    {a.type === "healthcare" ? "✚ " : (a.isSmallBusiness ? "★ " : "")}
                  </span>
                  <span style={{ color: a.type === "healthcare" ? "#FF1493" : "inherit" }}>
                    {a.name}
                  </span>
                </span>
                <span style={{ color: "#666" }}>{a.distance}m</span>
              </div>
            ))}
            {listing.amenities.length > 7 && (
              <div style={{ color: "#555", marginTop: "4px" }}>
                +{listing.amenities.length - 7} more...
              </div>
            )}
          </div>

          {/* Legend */}
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: "11px",
              color: "#999",
            }}
          >
            <div style={{ marginBottom: "4px" }}>
              <span style={{ color: "#FF1493", fontWeight: 700 }}>✚ Vivirion Healthcare</span>
            </div>
            <div>
              <span style={{ color: "#FFD700", fontWeight: 700 }}>★ Golden Tethers</span> = Local businesses
          </div>

          {/* Transport Mode Toggle */}
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ fontSize: "11px", color: "#ccc", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase" }}>
              Sky-Track Navigation
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setTransportMode("walking")}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  background: transportMode === "walking" ? "rgba(0, 212, 255, 0.2)" : "rgba(255, 255, 255, 0.05)",
                  border: `1px solid ${transportMode === "walking" ? "#00D4FF" : "transparent"}`,
                  color: transportMode === "walking" ? "#00D4FF" : "#888",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                WALKING
              </button>
              <button
                onClick={() => setTransportMode("driving")}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  background: transportMode === "driving" ? "rgba(255, 94, 0, 0.2)" : "rgba(255, 255, 255, 0.05)",
                  border: `1px solid ${transportMode === "driving" ? "#FF5E00" : "transparent"}`,
                  color: transportMode === "driving" ? "#FF5E00" : "#888",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                DRIVING
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Bottom branding */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "12px",
          color: "#333",
          fontFamily: "var(--font-geist-mono), monospace",
          letterSpacing: "3px",
          textTransform: "uppercase",
          zIndex: 10,
        }}
      >
        Avenue-X • Spatial Decision Engine
      </div>
    </div>
  );
}
