"use client";

/**
 * Avenue-X: Path Tether Component
 *
 * Renders an animated neon path following an array of street coordinates.
 * - Flat on the $Y=0$ plane to match the 2D Mapbox underlay.
 * - Uses CatmullRomCurve3 for smooth street rounding.
 * - Anchors a Travel Time <Html> overlay at the midpoint.
 * - Renders the BusinessBillboard at the end.
 */

import { useRef, useMemo, useState } from "react";
import { useFrame, extend } from "@react-three/fiber";
import * as THREE from "three";
import { shaderMaterial, Html } from "@react-three/drei";
import BusinessBillboard from "./BusinessBillboard";
import { getCategoryColor } from "@/lib/cloudinary";

// --- Custom Shader Material for the Neon Pulse ---
// We reuse the look of our previous straight tethers but on a curved TubeGeometry
const PathPulseMaterial = shaderMaterial(
  {
    time: 0,
    baseColor: new THREE.Color("#00D4FF"),
    pulseColor: new THREE.Color("#FFFFFF"),
    isGolden: false,
    hoverIntensity: 0.0,
  },
  // Vertex Shader
  `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `,
  // Fragment Shader
  `
  uniform float time;
  uniform vec3 baseColor;
  uniform vec3 pulseColor;
  uniform bool isGolden;
  uniform float hoverIntensity;
  varying vec2 vUv;

  void main() {
    float speed = isGolden ? 3.0 : 1.5;
    
    // Create pulses traveling ALONG the tube (u coordinate is length in TubeGeometry)
    // The vUv.x represents progress along the path 0.0 -> 1.0
    float rawPulse = sin(vUv.x * 20.0 - time * speed);
    
    // Sharpen pulse
    float pulse = smoothstep(0.7, 1.0, rawPulse);
    
    // Core glow 
    float edgeGlow = smoothstep(0.0, 0.4, 1.0 - abs(vUv.y - 0.5) * 2.0);
    
    vec3 finalColor = mix(baseColor * 0.3, pulseColor * 2.5, pulse);
    finalColor *= edgeGlow;

    if (isGolden) {
      // Add magical shimmer to golden tethers
      float shimmer = sin(vUv.x * 50.0 + time * 10.0) * 0.5 + 0.5;
      finalColor += vec3(0.5, 0.4, 0.1) * shimmer * pulse;
    }

    finalColor *= (1.0 + hoverIntensity * 1.5);

    gl_FragColor = vec4(finalColor, 1.0);
  }
  `
);

extend({ PathPulseMaterial });

// Add JSX typing
declare module "@react-three/fiber" {
  interface ThreeElements {
    pathPulseMaterial: React.JSX.IntrinsicElements["shaderMaterial"] & {
      ref?: React.Ref<THREE.ShaderMaterial>;
      time?: number;
      baseColor?: THREE.Color;
      pulseColor?: THREE.Color;
      isGolden?: boolean;
      hoverIntensity?: number;
    };
  }
}

interface PathTetherProps {
  path: Array<[number, number, number]>; // Array of scene coordinates [x,y,z]
  businessName: string;
  category: string;
  distance: number; // in meters
  isSmallBusiness?: boolean;
  transportMode?: "walking" | "driving";
  onClick?: () => void;
}

export default function PathTether({
  path,
  businessName,
  category,
  distance,
  isSmallBusiness = false,
  transportMode = "walking",
  onClick,
}: PathTetherProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [hovered, setHovered] = useState(false);

  // Setup colours
  const baseHex = getCategoryColor(category);
  const normalizedCategory = category.toLowerCase();
  const isVivirionClinic = ["healthcare", "clinic", "pharmacy", "hospital"].includes(
    normalizedCategory
  );
  
  let displayColor = baseHex;
  if (isVivirionClinic) {
    displayColor = "#FF1493"; // Vivirion Pink Flex
  } else if (transportMode === "driving") {
    displayColor = "#FF5E00"; // Neon Orange for driving
  } else if (isSmallBusiness) {
    displayColor = "#FFD700"; // Golden
  }

  // Convert array of [x,y,z] to Vector3 array to form the Curve
  const curve = useMemo(() => {
    // If no path is provided or only 1 point, create a dummy straight line 
    // down to avoid crashing the TubeGeometry.
    if (!path || path.length < 2) {
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -1, 0)
      ]);
    }
    const points = path.map(p => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(points);
  }, [path]);

  // Find midpoint to anchor the Travel Time 
  const midpoint = useMemo(() => {
    return curve.getPointAt(0.5);
  }, [curve]);

  // End point to anchor the Billboard
  const endPoint = useMemo(() => {
    return curve.getPointAt(1.0);
  }, [curve]);

  // Calculate times
  // Walking: ~1 min per 80m. Driving: ~1 min per 400m (city speeds)
  const travelMins = Math.max(1, Math.round(distance / (transportMode === "driving" ? 400 : 80)));

  // Animate the shader pulse
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime * (transportMode === "driving" ? 2.0 : 1.0); // Drive pulse is faster
      const targetHover = hovered ? 1.0 : 0.0;
      materialRef.current.uniforms.hoverIntensity.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.hoverIntensity.value,
        targetHover,
        0.1
      );
    }
  });

  return (
    <group>
      {/* The 3D Path Line */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
        onClick={(e) => { e.stopPropagation(); if (onClick) onClick(); }}
      >
        <tubeGeometry args={[curve, 64, 0.08, 8, false]} />
        <pathPulseMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          baseColor={new THREE.Color(displayColor)}
          pulseColor={new THREE.Color(isSmallBusiness ? "#FFFFFF" : displayColor)}
          isGolden={isSmallBusiness && !isVivirionClinic && transportMode === "walking"} // Only golden if walking
        />
      </mesh>

      {/* Travel Time Midpoint Overlay */}
      <Html
        position={[midpoint.x, midpoint.y + 0.5, midpoint.z]}
        center
        distanceFactor={15} // Scale text slightly natively
        zIndexRange={[100, 0]}
      >
        <div className="bg-slate-900/90 border border-slate-700/50 backdrop-blur-sm px-2 py-1 rounded-full shadow-lg pointer-events-none flex items-center gap-1 transition-colors duration-300">
          <svg className={`w-3 h-3 ${transportMode === "driving" ? "text-orange-400" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {transportMode === "driving" ? (
              // Car Icon
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zm-9-5.5V10c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v1.5M4 15h16v-2.5a3.5 3.5 0 00-7 0m-8 0a3.5 3.5 0 00-7 0v2.5z" />
            ) : (
              // Walk Icon (Default)
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          <span className="text-[10px] font-bold text-slate-200 tracking-wider whitespace-nowrap uppercase">
            {travelMins} MIN {transportMode}
          </span>
        </div>
      </Html>

      {/* Target Business Billboard at the end of the path */}
      <BusinessBillboard
        position={[endPoint.x, endPoint.y + 2, endPoint.z]} // Float billboard up slightly
        name={businessName}
        category={category}
        isSmallBusiness={isSmallBusiness}
        onClick={onClick}
      />
    </group>
  );
}
