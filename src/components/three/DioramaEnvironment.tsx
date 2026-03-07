"use client";

/**
 * Avenue-X: DioramaEnvironment
 *
 * Dusk/Cyber lighting rig for the 3D spatial scorecard.
 * Uses hemisphereLight + directional + point lights.
 * Neon glow is achieved via emissive materials on tethers/windows,
 * NOT postprocessing (which is incompatible with this R3F + Next.js setup).
 */

import { ContactShadows, Stars } from "@react-three/drei";

export default function DioramaEnvironment() {
  return (
    <>
      {/* Ambient starfield background */}
      <Stars
        radius={100}
        depth={50}
        count={3000}
        factor={3}
        saturation={0.5}
        fade
        speed={0.5}
      />

      {/* Background color */}
      <color attach="background" args={["#0A0A2E"]} />

      {/* Hemisphere light — sky + ground colors */}
      <hemisphereLight args={["#7B68FF", "#00D4FF", 2.0]} />

      {/* Strong ambient light */}
      <ambientLight intensity={2.0} color="#ffffff" />

      {/* Key light — warm from upper-right */}
      <directionalLight position={[10, 15, 8]} intensity={4} color="#FFE4C4" />

      {/* Fill — blue from left */}
      <directionalLight position={[-8, 5, -6]} intensity={3} color="#4488FF" />

      {/* Top-down */}
      <directionalLight position={[0, 20, 0]} intensity={3} color="#FFFFFF" />

      {/* Purple rim behind */}
      <pointLight position={[0, 8, -12]} intensity={100} color="#9B59B6" distance={50} decay={2} />

      {/* Teal underglow */}
      <pointLight position={[0, -1, 0]} intensity={80} color="#00D4FF" distance={30} decay={2} />

      {/* Pink accent front-right */}
      <pointLight position={[12, 5, 12]} intensity={60} color="#FF6B9D" distance={40} decay={2} />

      {/* Contact shadow for floating island */}
      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.35}
        scale={30}
        blur={2.5}
        far={4}
        color="#0A0A2E"
      />
    </>
  );
}
