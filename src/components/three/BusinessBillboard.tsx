"use client";

/**
 * Avenue-X: BusinessBillboard
 *
 * A floating billboard at the end of a tether showing the business icon/logo.
 * Always faces the camera using Drei's Billboard component.
 */

import { useRef, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, useTexture } from "@react-three/drei";
import { getBusinessTexture } from "@/lib/cloudinary";
import * as THREE from "three";

interface BusinessBillboardProps {
  position: [number, number, number];
  name: string;
  category: string;
  isSmallBusiness?: boolean;
  onClick?: () => void;
}

function TextureCard({ name, category, isSmallBusiness, glowRef }: any) {
  const textureUrl = getBusinessTexture(name, category, isSmallBusiness);
  const texture = useTexture(textureUrl);
  return (
    <group>
      {/* Glow ring behind (visible for small businesses) */}
      {isSmallBusiness && (
        <mesh ref={glowRef} position={[0, 0, -0.05]}>
          <ringGeometry args={[0.55, 0.75, 32]} />
          <meshBasicMaterial
            color="#FFD700"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Cloudinary Texture Icon */}
      <mesh>
        <circleGeometry args={[0.7, 32]} />
        {/* We use meshBasicMaterial because it's a neon sign, it should be self-illuminating */}
        <meshBasicMaterial map={texture} transparent />
      </mesh>
    </group>
  );
}

export default function BusinessBillboard({
  position,
  name,
  category,
  isSmallBusiness = false,
  onClick,
}: BusinessBillboardProps) {
  const glowRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    // Distance scaling to keep billboards readable when zoomed out (Map View)
    if (groupRef.current) {
      const worldPos = new THREE.Vector3(...position);
      const dist = state.camera.position.distanceTo(worldPos);
      const s = Math.max(1, dist / 20); // Base scale of 1, scales up as camera pulls away
      groupRef.current.scale.set(s, s, s);
    }

    if (glowRef.current && isSmallBusiness) {
      // Pulsing glow ring for small businesses
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
      glowRef.current.scale.set(pulse, pulse, 1);
    }
  });

  return (
    <Billboard
      position={position}
      follow
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <group
        ref={groupRef}
        onClick={onClick}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = "auto"; }}
      >
        <Suspense fallback={<group />}>
          <TextureCard name={name} category={category} isSmallBusiness={isSmallBusiness} glowRef={glowRef} />
        </Suspense>
      </group>
    </Billboard>
  );
}
