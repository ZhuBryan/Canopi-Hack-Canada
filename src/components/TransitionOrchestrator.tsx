// ── TransitionOrchestrator: Manages 2D ↔ 3D view transitions ──
// KEY FIX: Fully unmounts MapView and waits for GPU context release
// before mounting the Three.js DioramaScene to avoid WebGL context conflicts.

import { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState } from '../context/AppContext';
import MapView from './MapView';
import SpatialHUD from './SpatialHUD';

// Lazy-load DioramaScene so it doesn't grab WebGL on import
const DioramaScene = lazy(() => import('./DioramaScene'));

const fadeVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

const slideInVariants = {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 40 },
};

export default function TransitionOrchestrator() {
    const { viewMode, setViewMode, selectedRental } = useAppState();
    // This flag controls when the Three.js canvas actually mounts
    const [dioramaReady, setDioramaReady] = useState(false);
    // Track if the map has been fully destroyed
    const [mapDestroyed, setMapDestroyed] = useState(false);

    // When we enter transition mode: mark map as needing destruction
    useEffect(() => {
        if (viewMode === 'transition') {
            setMapDestroyed(false);
            setDioramaReady(false);

            // Give the MapView time to fully unmount and release WebGL
            // Step 1: Map unmounts immediately (via conditional render below)
            // Step 2: Wait for GPU context release
            const releaseTimer = setTimeout(() => {
                setMapDestroyed(true);
            }, 400);

            return () => clearTimeout(releaseTimer);
        }
    }, [viewMode]);

    // Once map is destroyed, wait a bit more then mount the diorama
    useEffect(() => {
        if (viewMode === 'transition' && mapDestroyed) {
            const mountTimer = setTimeout(() => {
                setDioramaReady(true);
                setViewMode('diorama');
            }, 800);

            return () => clearTimeout(mountTimer);
        }
    }, [viewMode, mapDestroyed, setViewMode]);

    // Reset when going back to search
    useEffect(() => {
        if (viewMode === 'search') {
            setDioramaReady(false);
            setMapDestroyed(false);
        }
    }, [viewMode]);

    // Determine what to show: map is NOT rendered during transition or diorama
    const showMap = viewMode === 'search';
    const showTransition = viewMode === 'transition';
    const showDiorama = viewMode === 'diorama' && dioramaReady;

    return (
        <div className="relative w-full h-full overflow-hidden">
            {/* 2D Map View — completely unmounted when not in search mode */}
            {showMap && (
                <motion.div
                    key="map"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: 'easeInOut' }}
                >
                    <MapView />
                </motion.div>
            )}

            {/* Transition Overlay — shown while we wait for GPU release */}
            {showTransition && (
                <motion.div
                    key="transition"
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                        background: 'radial-gradient(circle at center, #0a1628 0%, #050510 70%)',
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="text-center"
                    >
                        {/* Scanning animation */}
                        <div className="relative w-24 h-24 mx-auto mb-4">
                            <div className="absolute inset-0 rounded-full border-2 border-neon-cyan/30 animate-ping" />
                            <div className="absolute inset-2 rounded-full border border-neon-cyan/50 animate-pulse" />
                            <div className="absolute inset-4 rounded-full bg-neon-cyan/10 flex items-center justify-center">
                                <span className="text-2xl">🏠</span>
                            </div>
                        </div>
                        <p className="text-sm text-slate-400 font-light">
                            Initializing 3D Diorama...
                        </p>
                        {selectedRental && (
                            <p className="text-xs text-neon-cyan/70 mt-1">
                                {selectedRental.address}
                            </p>
                        )}
                    </motion.div>
                </motion.div>
            )}

            {/* 3D Diorama View — only mounts AFTER map is fully destroyed */}
            {showDiorama && (
                <motion.div
                    key="diorama"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, ease: 'easeInOut' }}
                >
                    <Suspense
                        fallback={
                            <div className="w-full h-full flex items-center justify-center bg-[#050510]">
                                <div className="text-sm text-slate-500">Loading 3D scene...</div>
                            </div>
                        }
                    >
                        <DioramaScene />
                    </Suspense>

                    {/* HUD Overlay slides in from right */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        variants={slideInVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                    >
                        <SpatialHUD />
                    </motion.div>

                    {/* Diorama title overlay */}
                    <div className="absolute top-6 left-6 z-10 pointer-events-none">
                        <h1 className="font-display text-2xl font-bold tracking-tight">
                            <span className="gradient-text">Avenue-X</span>
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Spatial Scorecard • 3D Diorama View
                        </p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
