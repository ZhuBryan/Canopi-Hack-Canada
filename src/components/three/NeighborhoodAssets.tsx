"use client";

/**
 * Avenue-X: NeighborhoodAssets
 *
 * Renders the central "island" with a dynamically loaded building depending on type.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
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

// --- Dynamic GLTF House Loader ---
function GLTFHouse() {
  const { scene } = useGLTF("/base_house.glb");
  return <primitive object={scene.clone()} position={[0, 0, 0]} scale={[1, 1, 1]} />;
}

// --- Dynamic GLTF Apartment Loader ---
function GLTFApartment({ stories = 3 }: { stories: number }) {
  const { scene } = useGLTF("/apartment_block.glb");
  // Automatically scale vertically based on stories
  const scaleY = Math.max(1, stories * 0.3);
  return <primitive object={scene.clone()} position={[0, 0, 0]} scale={[1, scaleY, 1]} />;
}

// Preload the assets
useGLTF.preload("/base_house.glb");
useGLTF.preload("/apartment_block.glb");

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
        <meshStandardMaterial color="#2A3A2A" roughness={0.9} />
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
        <meshStandardMaterial color="#3D5A3D" roughness={0.8} />
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
        {buildingType === "house" ? <GLTFHouse /> : <GLTFApartment stories={stories} />}
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
