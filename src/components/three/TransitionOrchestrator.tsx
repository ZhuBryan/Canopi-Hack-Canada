"use client";

/**
 * Avenue-X: Transition Orchestrator
 *
 * Manages the "Power Dive" camera transition from a 2D Mapbox flat view
 * (Top-Down) into the 3D Hybrid Diorama (Isometric Tilt).
 */

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";

interface OrchestratorProps {
  isDioramaView: boolean;
  targetPosition?: [number, number, number]; // Target to look at (usually the rental building [0,0,0])
}

export default function TransitionOrchestrator({
  isDioramaView,
  targetPosition = [0, 0, 0],
}: OrchestratorProps) {
  const controlsRef = useRef<CameraControls>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    
    // Set animation parameters
    controls.smoothTime = 0.8; // Duration/smoothness of the dive
    controls.restThreshold = 0.01;

    if (isDioramaView) {
      // THE POWER DIVE: Move to a low-angle 45-degree isometric view, zoomed in.
      // E.g., camera at [15, 12, 15] looking at [0,0,0]
      controls.setLookAt(
        targetPosition[0] + 15,
        targetPosition[1] + 12,
        targetPosition[2] + 15, // Camera position
        targetPosition[0],
        targetPosition[1],
        targetPosition[2], // Target position
        true // Animate
      );
    } else {
      // MAP SEARCH VIEW: Move high up, look straight down.
      // Simulates the flat 2D map view.
      controls.setLookAt(
        targetPosition[0],
        targetPosition[1] + 100, // Very high up
        targetPosition[2] + 0.1, // Slight offset to avoid gimbal lock looking straight down
        targetPosition[0],
        targetPosition[1],
        targetPosition[2],
        true // Animate
      );
    }
  }, [isDioramaView, targetPosition]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={5}
      maxDistance={250}
      maxPolarAngle={Math.PI / 2 - 0.05} // Prevent going below ground
      dollySpeed={0.5} // Slower zoom
    />
  );
}
