"use client";

/**
 * Avenue-X: NeighborhoodAssets
 *
 * Renders the central "island" with a dynamically loaded building depending on type.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface NeighborhoodAssetsProps {
  stories?: number;
  buildingType?: "house" | "apartment";
}

// --- Procedural Tree (Keep this as surrounding context) ---
function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.8, 8]} />
        <meshStandardMaterial color="#5C4033" roughness={0.9} />
      </mesh>
      {/* Canopy */}
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.45, 12, 12]} />
        <meshStandardMaterial color="#2D8544" roughness={0.7} />
      </mesh>
      <mesh position={[0.2, 1.3, 0.1]}>
        <sphereGeometry args={[0.3, 10, 10]} />
        <meshStandardMaterial color="#34A853" roughness={0.7} />
      </mesh>
    </group>
  );
}

// --- Procedural House Fallback (no external asset fetch required) ---
function HouseAsset() {
  return (
    <group position={[0, 0.7, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.1, 1.6]} />
        <meshStandardMaterial color="#f6f5f4" roughness={0.75} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <coneGeometry args={[1.25, 0.9, 4]} />
        <meshStandardMaterial color="#2C3342" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.45, 0]} receiveShadow>
        <boxGeometry args={[1.9, 0.1, 1.9]} />
        <meshStandardMaterial color="#4D5D73" roughness={0.95} />
      </mesh>
    </group>
  );
}

// --- Procedural Apartment Fallback (reactive to story count) ---
function ApartmentAsset({ stories = 3 }: { stories: number }) {
  const scaleY = Math.max(1, stories * 0.3);
  const height = 2.2 * scaleY;
  return (
    <group position={[0, height * 0.5, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.1, height, 2.1]} />
        <meshStandardMaterial color="#f6f5f4" roughness={0.65} metalness={0.18} />
      </mesh>
      <mesh position={[0, height * 0.5 + 0.08, 0]}>
        <boxGeometry args={[2.16, 0.16, 2.16]} />
        <meshStandardMaterial color="#2A2E3B" roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[0, -height * 0.5 - 0.05, 0]} receiveShadow>
        <boxGeometry args={[2.4, 0.1, 2.4]} />
        <meshStandardMaterial color="#3D4658" roughness={0.95} />
      </mesh>
    </group>
  );
}

// --- Floating Island Base ---
function IslandBase() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      // Gentle floating bob
      ref.current.position.y = -0.6 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <group>
      {/* Top surface */}
      <mesh ref={ref} position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[12, 64]} />
        <meshStandardMaterial color="#9cd397" roughness={0.9} />
      </mesh>
      {/* Rocky underside */}
      <mesh position={[0, -1.2, 0]}>
        <coneGeometry args={[12, 3, 64]} />
        <meshStandardMaterial
          color="#1A1A1A"
          roughness={0.95}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Grassy ring */}
      <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[10, 12, 64]} />
        <meshStandardMaterial color="#9cd397" roughness={0.8} />
      </mesh>
    </group>
  );
}

export default function NeighborhoodAssets({
  stories = 3,
  buildingType = "apartment",
}: NeighborhoodAssetsProps) {
  return (
    <group>
      <IslandBase />

      {/* Central building */}
      <group position={[0, 0, 0]}>
        {buildingType === "house" ? <HouseAsset /> : <ApartmentAsset stories={stories} />}
      </group>

      {/* Scattered trees */}
      <Tree position={[-4, 0, 2]} />
      <Tree position={[-3, 0, -4]} />
      <Tree position={[5, 0, -1]} />
      <Tree position={[3, 0, 4]} />
      <Tree position={[-5, 0, -2]} />
      <Tree position={[6, 0, 3]} />
      <Tree position={[-2, 0, 6]} />
    </group>
  );
}
