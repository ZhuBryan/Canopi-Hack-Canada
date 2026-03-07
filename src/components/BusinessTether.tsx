// ── BusinessTether: Neon line from building to amenity with floating icon ──

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Amenity } from '../types';
import { AMENITY_ICONS, AMENITY_COLORS } from '../types';

interface BusinessTetherProps {
    amenity: Amenity;
    buildingHeight?: number;
    index: number;
}

export default function BusinessTether({ amenity, buildingHeight = 25, index }: BusinessTetherProps) {
    const groupRef = useRef<THREE.Group>(null);
    const iconRef = useRef<THREE.Group>(null);

    const color = AMENITY_COLORS[amenity.type] || '#00f5ff';
    const icon = AMENITY_ICONS[amenity.type] || '📍';

    // Scale down distances for better visibility (1:5 ratio)
    const scaledPos = useMemo(() => {
        const scale = 0.2;
        return [
            amenity.localPos[0] * scale,
            0,
            amenity.localPos[2] * scale,
        ] as [number, number, number];
    }, [amenity.localPos]);

    const iconHeight = 30 + Math.random() * 15;

    // Line from building top to amenity icon
    const linePoints = useMemo(() => {
        return [
            new THREE.Vector3(0, buildingHeight, 0),
            new THREE.Vector3(
                scaledPos[0] * 0.3,
                buildingHeight + iconHeight * 0.6,
                scaledPos[2] * 0.3
            ),
            new THREE.Vector3(scaledPos[0], iconHeight, scaledPos[2]),
        ];
    }, [scaledPos, buildingHeight, iconHeight]);

    // Animate icon floating
    useFrame(({ clock }) => {
        if (iconRef.current) {
            const t = clock.getElapsedTime();
            const offset = index * 0.7;
            iconRef.current.position.y = iconHeight + Math.sin(t * 1.2 + offset) * 2;
        }
    });

    return (
        <group ref={groupRef}>
            {/* Neon tether line */}
            <Line
                points={linePoints}
                color={color}
                lineWidth={2}
                transparent
                opacity={0.6}
                dashed
                dashSize={3}
                gapSize={1.5}
            />

            {/* Glow line (wider, more transparent) */}
            <Line
                points={linePoints}
                color={color}
                lineWidth={6}
                transparent
                opacity={0.15}
            />

            {/* Floating icon */}
            <group ref={iconRef} position={[scaledPos[0], iconHeight, scaledPos[2]]}>
                <Billboard follow lockX={false} lockY={false} lockZ={false}>
                    {/* Icon background glow disc */}
                    <mesh>
                        <circleGeometry args={[6, 32]} />
                        <meshBasicMaterial
                            color={color}
                            transparent
                            opacity={0.15}
                            side={THREE.DoubleSide}
                            depthWrite={false}
                        />
                    </mesh>

                    {/* Emoji icon */}
                    <Text
                        fontSize={8}
                        anchorX="center"
                        anchorY="middle"
                        position={[0, 0, 0.1]}
                    >
                        {icon}
                    </Text>

                    {/* Name label */}
                    <Text
                        fontSize={2.5}
                        color="#e2e8f0"
                        anchorX="center"
                        anchorY="top"
                        position={[0, -7, 0.1]}
                        maxWidth={40}
                        textAlign="center"
                        font="https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_fjbvMwCp50KnMa0ZL7SUc.woff2"
                    >
                        {amenity.name}
                    </Text>

                    {/* Distance label */}
                    <Text
                        fontSize={1.8}
                        color="#94a3b8"
                        anchorX="center"
                        anchorY="top"
                        position={[0, -10.5, 0.1]}
                        font="https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_fjbvMwCp50KnMa0ZL7SUc.woff2"
                    >
                        {Math.round(amenity.distance)}m
                    </Text>
                </Billboard>

                {/* Point light at icon */}
                <pointLight color={color} intensity={0.4} distance={30} decay={2} />
            </group>
        </group>
    );
}
