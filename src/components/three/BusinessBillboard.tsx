"use client";

/**
 * Avenue-X: BusinessBillboard
 *
 * A floating billboard at the end of a tether showing the business icon/logo.
 * Always faces the camera using Drei's Billboard component.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { getBusinessTexture } from "@/lib/cloudinary";
import * as THREE from "three";

interface BusinessBillboardProps {
  position: [number, number, number];
  name: string;
  category: string;
  isSmallBusiness?: boolean;
  onClick?: () => void;
}

function pickBorderColor(category: string, isSmallBusiness: boolean): string {
  const c = category.toLowerCase();
  if (["pharmacy", "hospital", "clinic", "healthcare"].includes(c)) return "#FF1493";
  if (isSmallBusiness) return "#FFD700";
  return "#00D4FF";
}

function makeFallbackTexture(
  name: string,
  category: string,
  isSmallBusiness: boolean
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tiny = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tiny.needsUpdate = true;
    return tiny as unknown as THREE.CanvasTexture;
  }

  const border = pickBorderColor(category, isSmallBusiness);
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(cx, cy, 118, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a2e";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = border;
  ctx.stroke();

  const short = name.length > 16 ? `${name.slice(0, 16)}...` : name;
  ctx.fillStyle = border;
  ctx.font = "700 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(category.slice(0, 1).toUpperCase(), cx, cy - 16);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 16px Arial";
  ctx.fillText(short, cx, cy + 28);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface TextureCardProps {
  name: string;
  category: string;
  isSmallBusiness: boolean;
  glowRef: React.RefObject<THREE.Mesh | null>;
}

function TextureCard({ name, category, isSmallBusiness, glowRef }: TextureCardProps) {
  const textureUrl = useMemo(
    () => getBusinessTexture(name, category, isSmallBusiness),
    [name, category, isSmallBusiness]
  );
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let disposed = false;
    const loader = new THREE.TextureLoader();
    const fallback = makeFallbackTexture(name, category, isSmallBusiness);

    loader.load(
      textureUrl,
      (loaded) => {
        if (disposed) return;
        loaded.colorSpace = THREE.SRGBColorSpace;
        setTexture(loaded);
      },
      undefined,
      () => {
        if (disposed) return;
        setTexture(fallback);
      }
    );

    // Show local fallback first for perceived performance and resilience.
    setTexture(fallback);

    return () => {
      disposed = true;
    };
  }, [textureUrl, name, category, isSmallBusiness]);

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
        <meshBasicMaterial map={texture ?? undefined} transparent />
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
        <TextureCard name={name} category={category} isSmallBusiness={isSmallBusiness} glowRef={glowRef} />
      </group>
    </Billboard>
  );
}
