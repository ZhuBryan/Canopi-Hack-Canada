"use client";

/**
 * Avenue-X: NeonTether
 *
 * A glowing neon line from the apartment building to a nearby business.
 * Features custom shader material with animated pulse effect.
 *
 * Variants:
 * - Standard (cyan): regular businesses
 * - Golden: small/local businesses (stronger glow + shimmer)
 */

import { useRef, useMemo } from "react";
import { useFrame, extend } from "@react-three/fiber";
import * as THREE from "three";

// ---- Custom Neon Pulse ShaderMaterial ----
class NeonPulseMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#00d4ff") },
        uOpacity: { value: 0.9 },
        uPulseSpeed: { value: 2.0 },
        uPulseWidth: { value: 0.3 },
        uIsGolden: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vProgress;

        void main() {
          vUv = uv;
          vProgress = position.y; // We'll use Y as progress along the line
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPulseSpeed;
        uniform float uPulseWidth;
        uniform float uIsGolden;

        varying vec2 vUv;

        void main() {
          // Traveling pulse effect along the tether
          float pulse = sin((vUv.x - uTime * uPulseSpeed) * 8.0) * 0.5 + 0.5;
          pulse = smoothstep(0.3, 0.7, pulse);

          // Edge glow — brighter at the edges
          float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
          edge = pow(edge, 0.5);

          // Golden shimmer overlay
          float shimmer = 0.0;
          if (uIsGolden > 0.5) {
            shimmer = sin(uTime * 4.0 + vUv.x * 20.0) * 0.3 + 0.3;
          }

          // Final color
          vec3 finalColor = uColor * (0.6 + pulse * 0.4 + shimmer);

          // Emissive boost for bloom
          float emissiveBoost = 1.5 + pulse * 0.5;
          finalColor *= emissiveBoost;

          float alpha = edge * uOpacity * (0.5 + pulse * 0.5);

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }
}

extend({ NeonPulseMaterial });

// Type augmentation for JSX
declare module "@react-three/fiber" {
  interface ThreeElements {
    neonPulseMaterial: React.JSX.IntrinsicElements["shaderMaterial"] & {
      uTime?: number;
      uColor?: THREE.Color;
      uOpacity?: number;
      uPulseSpeed?: number;
      uIsGolden?: number;
    };
  }
}

// Build tube geometry from start to end points
function buildTubeGeometry(
  start: [number, number, number],
  end: [number, number, number],
  segments: number = 32
): THREE.TubeGeometry {
  const points = [];
  const s = new THREE.Vector3(...start);
  const e = new THREE.Vector3(...end);

  // Create a nice arc — midpoint is elevated
  const mid = new THREE.Vector3()
    .addVectors(s, e)
    .multiplyScalar(0.5);
  mid.y += 1.5; // Arc height

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Quadratic bezier
    const p = new THREE.Vector3();
    p.x = (1 - t) * (1 - t) * s.x + 2 * (1 - t) * t * mid.x + t * t * e.x;
    p.y = (1 - t) * (1 - t) * s.y + 2 * (1 - t) * t * mid.y + t * t * e.y;
    p.z = (1 - t) * (1 - t) * s.z + 2 * (1 - t) * t * mid.z + t * t * e.z;
    points.push(p);
  }

  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, segments, 0.04, 8, false);
}

interface NeonTetherProps {
  start?: [number, number, number];
  end: [number, number, number];
  color?: string;
  isGolden?: boolean;
  onClick?: () => void;
}

export default function NeonTether({
  start = [0, 1.5, 0],
  end,
  color = "#00d4ff",
  isGolden = false,
  onClick,
}: NeonTetherProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(
    () => buildTubeGeometry(start, end),
    [start, end]
  );

  const tetherColor = useMemo(
    () => new THREE.Color(isGolden ? "#ffd700" : color),
    [color, isGolden]
  );

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh
      geometry={geometry}
      onClick={onClick}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = "auto"; }}
    >
      <neonPulseMaterial
        ref={matRef}
        uColor={tetherColor}
        uIsGolden={isGolden ? 1.0 : 0.0}
        uPulseSpeed={isGolden ? 3.0 : 2.0}
        uOpacity={isGolden ? 1.0 : 0.8}
      />
    </mesh>
  );
}
