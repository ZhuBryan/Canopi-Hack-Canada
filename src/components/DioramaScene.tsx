// ── DioramaScene: 3D scene with WebGL fallback ──
// If WebGL context cannot be acquired (e.g., after Mapbox uses it),
// renders a CSS 3D building visualization instead.

import { Suspense, useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useAppState } from '../context/AppContext';
import { useVitality } from '../hooks/useVitality';
import { AMENITY_ICONS as AMENITY_ICONS_MAP, AMENITY_COLORS as AMENITY_COLORS_MAP } from '../types';
import VitalityDome from './VitalityDome';
import BusinessTether from './BusinessTether';

function Building() {
    return (
        <group position={[0, 0, 0]}>
            <mesh position={[0, 12.5, 0]}>
                <boxGeometry args={[16, 25, 16]} />
                <meshStandardMaterial
                    color="#2a2a4e"
                    metalness={0.5}
                    roughness={0.4}
                    emissive="#1a1a3e"
                    emissiveIntensity={0.5}
                />
            </mesh>

            {Array.from({ length: 5 }).map((_, floor) => (
                <group key={floor}>
                    <mesh position={[0, 4 + floor * 5, 8.05]}>
                        <planeGeometry args={[12, 2]} />
                        <meshBasicMaterial color="#00f5ff" transparent opacity={0.7} />
                    </mesh>
                    <mesh position={[8.05, 4 + floor * 5, 0]} rotation={[0, Math.PI / 2, 0]}>
                        <planeGeometry args={[12, 2]} />
                        <meshBasicMaterial color="#00f5ff" transparent opacity={0.5} />
                    </mesh>
                    <mesh position={[-8.05, 4 + floor * 5, 0]} rotation={[0, -Math.PI / 2, 0]}>
                        <planeGeometry args={[12, 2]} />
                        <meshBasicMaterial color="#00f5ff" transparent opacity={0.5} />
                    </mesh>
                </group>
            ))}

            <mesh position={[0, 25.5, 0]}>
                <boxGeometry args={[17, 1, 17]} />
                <meshStandardMaterial color="#16213e" metalness={0.8} roughness={0.2} />
            </mesh>

            <mesh position={[0, 28, 0]}>
                <cylinderGeometry args={[0.3, 0.3, 5, 8]} />
                <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.1} />
            </mesh>
            <pointLight position={[0, 31, 0]} color="#00f5ff" intensity={5} distance={40} />
        </group>
    );
}

function Ground() {
    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
                <circleGeometry args={[250, 128]} />
                <meshStandardMaterial color="#0d1117" metalness={0.3} roughness={0.8} />
            </mesh>
            <Grid
                args={[500, 500]}
                cellSize={20}
                cellThickness={0.5}
                cellColor="#1a1a3e"
                sectionSize={100}
                sectionThickness={1}
                sectionColor="#16213e"
                fadeDistance={300}
                fadeStrength={1}
                followCamera={false}
                position={[0, 0.01, 0]}
                infiniteGrid
            />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                <ringGeometry args={[240, 250, 128]} />
                <meshBasicMaterial
                    color="#00f5ff"
                    transparent
                    opacity={0.1}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
}

function SceneContent() {
    const { selectedRental, setVitality } = useAppState();

    const vitality = useVitality(
        selectedRental?.lat ?? null,
        selectedRental?.lng ?? null
    );

    useEffect(() => {
        if (!vitality.loading && vitality.amenities.length > 0) {
            setVitality(vitality);
        }
    }, [vitality, setVitality]);

    return (
        <>
            <ambientLight intensity={0.5} />
            <hemisphereLight args={['#4a6cf7', '#0a0a1a', 0.4]} />
            <directionalLight position={[50, 80, 30]} intensity={1.2} color="#e2e8f0" />
            <directionalLight position={[-30, 40, -50]} intensity={0.5} color="#818cf8" />
            <Stars radius={300} depth={100} count={3000} factor={3} saturation={0.3} fade speed={0.5} />
            <Ground />
            <Building />

            {!vitality.loading && vitality.score > 0 && (
                <VitalityDome score={vitality.score} buildingHeight={25} />
            )}

            {vitality.amenities.map((amenity, index) => (
                <BusinessTether
                    key={amenity.id}
                    amenity={amenity}
                    buildingHeight={25}
                    index={index}
                />
            ))}

            <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.05}
                minDistance={30}
                maxDistance={400}
                maxPolarAngle={Math.PI / 2.1}
                target={[0, 15, 0]}
            />
        </>
    );
}

// ── CSS 3D Fallback ──
// Renders when WebGL context cannot be acquired
function CSS3DFallback() {
    const { selectedRental, setVitality } = useAppState();

    const vitality = useVitality(
        selectedRental?.lat ?? null,
        selectedRental?.lng ?? null
    );

    useEffect(() => {
        if (!vitality.loading && vitality.amenities.length > 0) {
            setVitality(vitality);
        }
    }, [vitality, setVitality]);

    return (
        <div className="w-full h-full relative overflow-hidden" style={{
            background: 'radial-gradient(ellipse at 50% 120%, #0a1628 0%, #050510 50%, #020208 100%)',
        }}>
            {/* Starfield */}
            <div className="absolute inset-0 overflow-hidden">
                {Array.from({ length: 80 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full bg-white"
                        style={{
                            width: Math.random() * 2 + 1 + 'px',
                            height: Math.random() * 2 + 1 + 'px',
                            left: Math.random() * 100 + '%',
                            top: Math.random() * 60 + '%',
                            opacity: Math.random() * 0.6 + 0.1,
                            animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
                            animationDelay: Math.random() * 2 + 's',
                        }}
                    />
                ))}
            </div>

            {/* Grid floor */}
            <div className="absolute bottom-0 left-0 right-0 h-[40%]" style={{
                background: 'linear-gradient(to bottom, transparent 0%, rgba(26, 26, 62, 0.3) 100%)',
                backgroundImage: `
          linear-gradient(rgba(26, 26, 62, 0.4) 1px, transparent 1px),
          linear-gradient(90deg, rgba(26, 26, 62, 0.4) 1px, transparent 1px)
        `,
                backgroundSize: '40px 40px',
                transform: 'perspective(800px) rotateX(60deg)',
                transformOrigin: 'bottom center',
            }} />

            {/* Island ring glow */}
            <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 w-[500px] h-[120px] rounded-[50%]"
                style={{
                    border: '1px solid rgba(0, 245, 255, 0.15)',
                    boxShadow: '0 0 30px rgba(0, 245, 255, 0.08), inset 0 0 30px rgba(0, 245, 255, 0.05)',
                }}
            />

            {/* 3D Building using CSS perspective */}
            <div className="absolute bottom-[22%] left-1/2 -translate-x-1/2" style={{
                perspective: '600px',
                perspectiveOrigin: '50% 40%',
            }}>
                <div style={{
                    width: '120px',
                    transformStyle: 'preserve-3d',
                    transform: 'rotateX(-10deg) rotateY(-25deg)',
                    animation: 'float 6s ease-in-out infinite',
                }}>
                    {/* Building body */}
                    <div className="relative mx-auto" style={{ width: '120px', height: '200px' }}>
                        {/* Front face */}
                        <div className="absolute inset-0 rounded-sm" style={{
                            background: 'linear-gradient(180deg, #2a2a4e 0%, #1a1a2e 100%)',
                            boxShadow: 'inset 0 0 30px rgba(0, 245, 255, 0.1)',
                        }}>
                            {/* Windows */}
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="mx-auto mt-3" style={{
                                    width: '80%',
                                    height: '14px',
                                    background: 'rgba(0, 245, 255, 0.5)',
                                    boxShadow: '0 0 10px rgba(0, 245, 255, 0.3), 0 0 20px rgba(0, 245, 255, 0.1)',
                                    borderRadius: '2px',
                                    marginTop: i === 0 ? '20px' : '12px',
                                }} />
                            ))}
                        </div>

                        {/* Right face (perspective illusion) */}
                        <div className="absolute top-0 right-0 h-full" style={{
                            width: '40px',
                            background: 'linear-gradient(180deg, #1e1e3a 0%, #12122a 100%)',
                            transform: 'translateX(100%) skewY(-10deg)',
                            transformOrigin: 'left top',
                        }}>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} style={{
                                    width: '70%',
                                    height: '12px',
                                    background: 'rgba(0, 245, 255, 0.25)',
                                    borderRadius: '1px',
                                    margin: '0 auto',
                                    marginTop: i === 0 ? '22px' : '14px',
                                }} />
                            ))}
                        </div>

                        {/* Top face */}
                        <div className="absolute top-0 left-0 w-full" style={{
                            height: '20px',
                            background: '#16213e',
                            transform: 'translateY(-100%) skewX(-20deg)',
                            transformOrigin: 'bottom left',
                            borderTop: '1px solid rgba(0, 245, 255, 0.2)',
                        }} />
                    </div>

                    {/* Beacon light on top */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-6">
                        <div className="w-full h-full bg-slate-600 rounded-full" />
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-neon-cyan animate-pulse"
                            style={{ boxShadow: '0 0 15px rgba(0, 245, 255, 0.8), 0 0 30px rgba(0, 245, 255, 0.4)' }}
                        />
                    </div>
                </div>
            </div>

            {/* Vitality Dome (CSS version) */}
            {!vitality.loading && vitality.score > 0 && (
                <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 animate-pulse-slow" style={{
                    width: `${200 + vitality.score * 2}px`,
                    height: `${100 + vitality.score}px`,
                    borderRadius: '50%',
                    background: `radial-gradient(ellipse, rgba(${vitality.score > 50 ? '57, 255, 20' : '255, 107, 53'}, 0.08) 0%, transparent 70%)`,
                    border: `1px solid rgba(${vitality.score > 50 ? '57, 255, 20' : '255, 107, 53'}, 0.15)`,
                }} />
            )}

            {/* Amenity Tethers (CSS version) */}
            {vitality.amenities.slice(0, 8).map((amenity, i) => {
                const angle = (i / Math.min(vitality.amenities.length, 8)) * Math.PI * 2;
                const radius = 150 + Math.random() * 80;
                const x = Math.cos(angle) * radius;
                const y = -30 - Math.random() * 60;
                const icon = AMENITY_ICONS_MAP[amenity.type] || '📍';
                const color = AMENITY_COLORS_MAP[amenity.type] || '#00f5ff';

                return (
                    <div key={amenity.id}>
                        {/* Tether line (SVG) */}
                        <svg className="absolute bottom-[35%] left-1/2 pointer-events-none"
                            style={{ width: '400px', height: '300px', transform: 'translateX(-50%)' }}
                        >
                            <line
                                x1="200" y1="200"
                                x2={200 + x} y2={100 + y}
                                stroke={color}
                                strokeWidth="1.5"
                                strokeDasharray="6 3"
                                opacity={0.4}
                            />
                        </svg>

                        {/* Floating icon */}
                        <div
                            className="absolute animate-float"
                            style={{
                                bottom: `${55 + Math.random() * 15}%`,
                                left: `calc(50% + ${x}px)`,
                                transform: 'translateX(-50%)',
                                animationDelay: `${i * 0.5}s`,
                            }}
                        >
                            <div className="flex flex-col items-center gap-1">
                                <div className="text-2xl" style={{
                                    filter: `drop-shadow(0 0 6px ${color})`,
                                }}>{icon}</div>
                                <div className="text-[9px] text-slate-400 text-center max-w-[80px] truncate">
                                    {amenity.name}
                                </div>
                                <div className="text-[8px] text-slate-500">
                                    {Math.round(amenity.distance)}m
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function DioramaScene() {
    return <CSS3DFallback />;
}
