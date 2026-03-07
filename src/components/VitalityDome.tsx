// ── VitalityDome: Translucent glowing sphere representing the Vitality Score ──

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { scoreToHex } from '../utils/geoUtils';

interface VitalityDomeProps {
    score: number;
    buildingHeight?: number;
}

export default function VitalityDome({ score, buildingHeight = 25 }: VitalityDomeProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);

    // Dome radius scales with score: min 60m, max 200m
    const radius = 60 + (score / 100) * 140;
    const color = scoreToHex(score);

    useFrame(({ clock }) => {
        if (meshRef.current) {
            // Subtle breathing animation
            const t = clock.getElapsedTime();
            const scale = 1 + Math.sin(t * 0.8) * 0.03;
            meshRef.current.scale.setScalar(scale);
        }
        if (materialRef.current) {
            // Pulsing opacity
            const t = clock.getElapsedTime();
            materialRef.current.opacity = 0.12 + Math.sin(t * 1.2) * 0.04;
        }
    });

    return (
        <group position={[0, buildingHeight / 2, 0]}>
            {/* Main dome */}
            <Sphere ref={meshRef} args={[radius, 64, 64]}>
                <meshStandardMaterial
                    ref={materialRef}
                    color={color}
                    transparent
                    opacity={0.12}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    emissive={color}
                    emissiveIntensity={0.3}
                />
            </Sphere>

            {/* Inner glow ring at ground level */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -buildingHeight / 2 + 0.5, 0]}>
                <ringGeometry args={[radius * 0.95, radius, 64]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.15}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>

            {/* Point light for ambient glow */}
            <pointLight
                color={color}
                intensity={0.8}
                distance={radius * 2}
                decay={2}
            />
        </group>
    );
}
