"use client";

/**
 * Avenue-X: VitalityDome
 *
 * A translucent, glowing sphere around the building.
 * Size and color are driven by the Vitality Score (0–100).
 * - High score → large, green dome
 * - Low score  → small, red dome
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

interface VitalityDomeProps {
  score: number; // 0–100
  position?: [number, number, number];
}

function scoreToColor(score: number): THREE.Color {
  // Red (0) → Amber (50) → Green (100)
  if (score <= 50) {
    // Red to amber
    const t = score / 50;
    return new THREE.Color().setHSL(
      THREE.MathUtils.lerp(0, 0.1, t),   // hue: red → orange
      0.9,
      THREE.MathUtils.lerp(0.45, 0.55, t)
    );
  } else {
    // Amber to green
    const t = (score - 50) / 50;
    return new THREE.Color().setHSL(
      THREE.MathUtils.lerp(0.1, 0.35, t), // hue: orange → green
      0.85,
      THREE.MathUtils.lerp(0.55, 0.5, t)
    );
  }
}

export default function VitalityDome({ score, position = [0, 2, 0] }: VitalityDomeProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const baseScale = useMemo(() => {
    // Dome radius scales from 3 (score=0) to 10 (score=100)
    const s = 3 + (score / 100) * 7;
    return s;
  }, [score]);

  const color = useMemo(() => scoreToColor(score), [score]);

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle pulse: ±5% scale oscillation
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
      const s = baseScale * pulse;
      meshRef.current.scale.set(s, s, s);
    }
  });

  return (
    <Sphere ref={meshRef} args={[1, 64, 64]} position={position}>
      <meshPhysicalMaterial
        color={color}
        transparent
        transmission={0.85}
        roughness={0.05}
        thickness={1.5}
        opacity={0.25}
        envMapIntensity={1.5}
        clearcoat={1}
        clearcoatRoughness={0.1}
        emissive={color}
        emissiveIntensity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </Sphere>
  );
}
