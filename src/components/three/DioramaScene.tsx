"use client";

/**
 * Avenue-X: DioramaScene
 *
 * Composes all 3D components into the full "Spatial Scorecard" scene:
 * - NeighborhoodAssets (island + building)
 * - VitalityDome (score sphere)
 * - NeonTethers + BusinessBillboards (amenity connections)
 * - DioramaEnvironment (lighting + postprocessing)
 * - SponsoredCard (pop-up on golden tether click)
 */

import { useState, Suspense, useMemo } from "react";
import { OrbitControls, Html } from "@react-three/drei";
import NeighborhoodAssets from "./NeighborhoodAssets";
import VitalityDome from "./VitalityDome";
import PathTether from "./PathTether";
import SponsoredCard from "./SponsoredCard";
import DioramaEnvironment from "./DioramaEnvironment";
import { gpsTo3D } from "@/lib/types";
import type { RentalListing, Amenity } from "@/lib/types";

// Simulated Directions API: creates a jagged path along x/z axes
function createCityGridPath(
  startPos: [number, number, number],
  endPos: [number, number, number],
  yOffset: number = 4.0 // Float above buildings
): Array<[number, number, number]> {
  // Manhattan routing (L-shape or Z-shape)
  const p1 = [startPos[0], yOffset, startPos[2]];
  const p2 = [startPos[0], yOffset, startPos[2] + (endPos[2] - startPos[2]) * 0.5];
  const p3 = [endPos[0], yOffset, startPos[2] + (endPos[2] - startPos[2]) * 0.5];
  const p4 = [endPos[0], yOffset, endPos[2]];
  
  return [
    p1 as [number, number, number],
    p2 as [number, number, number],
    p3 as [number, number, number],
    p4 as [number, number, number]
  ];
}

interface DioramaSceneProps {
  listing: RentalListing;
  vitalityScore: number;
  transportMode: "walking" | "driving";
}

function LoadingFallback() {
  return (
    <Html center>
      <div
        style={{
          color: "#00D4FF",
          fontSize: "18px",
          fontFamily: "'Geist', sans-serif",
          textAlign: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "3px solid #00D4FF30",
            borderTop: "3px solid #00D4FF",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 12px auto",
          }}
        />
        Loading Diorama...
      </div>
    </Html>
  );
}

export default function DioramaScene({ listing, vitalityScore, transportMode }: DioramaSceneProps) {
  const [selectedBusiness, setSelectedBusiness] = useState<{
    amenity: Amenity;
    position: [number, number, number];
  } | null>(null);

  // Convert amenity GPS coords to 3D positions
  const amenityPositions = useMemo(() => {
    return listing.amenities.map((amenity) => ({
      amenity,
      pos3D: gpsTo3D(amenity.coords, listing.coordinates),
    }));
  }, [listing]);

  return (
    <>
      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={40}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.45}
        autoRotate
        autoRotateSpeed={0.3}
        target={[0, 1, 0]}
      />

      <Suspense fallback={<LoadingFallback />}>
        {/* Environment + Postprocessing */}
        <DioramaEnvironment />

        {/* The floating island with building */}
        <NeighborhoodAssets
          stories={listing.stories || 3}
          buildingType={listing.propertyType || "apartment"}
        />

        {/* Vitality Dome */}
        <VitalityDome score={vitalityScore} position={[0, 2, 0]} />

        {/* Tethers + Billboards for each amenity using Simulated City Grid Paths */}
        {amenityPositions.map(({ amenity, pos3D }, i) => (
          <group key={`amenity-${i}`}>
            <PathTether
              path={createCityGridPath([0, 0, 0], pos3D, 4.0)}
              businessName={amenity.name}
              category={amenity.type}
              distance={amenity.distance}
              isSmallBusiness={amenity.isSmallBusiness}
              transportMode={transportMode}
              onClick={() => {
                if (amenity.isSmallBusiness) {
                  setSelectedBusiness({ amenity, position: pos3D });
                }
              }}
            />
          </group>
        ))}

        {/* Sponsored card pop-up */}
        {selectedBusiness && (
          <SponsoredCard
            position={[
              selectedBusiness.position[0],
              selectedBusiness.position[1] + 1.5,
              selectedBusiness.position[2],
            ]}
            businessName={selectedBusiness.amenity.name}
            category={selectedBusiness.amenity.type}
            discount={
              selectedBusiness.amenity.type === "pharmacy"
                ? "HEALTH20"
                : "WELCOME15"
            }
            onClose={() => setSelectedBusiness(null)}
          />
        )}
      </Suspense>
    </>
  );
}
