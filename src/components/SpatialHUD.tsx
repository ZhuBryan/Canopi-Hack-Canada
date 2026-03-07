// ── SpatialHUD: Glassmorphism sidebar overlay ──

import { useMemo } from 'react';
import { useAppState } from '../context/AppContext';
import { scoreToColor } from '../utils/geoUtils';
import { AMENITY_ICONS } from '../types';

function ScoreRing({ score }: { score: number }) {
    const circumference = 2 * Math.PI * 45; // radius = 45
    const offset = circumference - (score / 100) * circumference;
    const color = scoreToColor(score);

    return (
        <div className="relative w-28 h-28 mx-auto">
            <svg viewBox="0 0 100 100" className="score-ring w-full h-full">
                <circle cx="50" cy="50" r="45" className="score-ring-bg" />
                <circle
                    cx="50" cy="50" r="45"
                    className="score-ring-fill"
                    style={{
                        stroke: color,
                        strokeDashoffset: offset,
                    }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold font-display" style={{ color }}>
                    {score}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Score
                </span>
            </div>
        </div>
    );
}

export default function SpatialHUD() {
    const { selectedRental, vitality, goBack } = useAppState();

    const sortedAmenities = useMemo(() => {
        if (!vitality?.amenities) return [];
        return [...vitality.amenities].sort((a, b) => a.distance - b.distance).slice(0, 15);
    }, [vitality]);

    const categoryCounts = useMemo(() => {
        if (!vitality?.amenities) return {};
        const counts: Record<string, number> = {};
        vitality.amenities.forEach(a => {
            counts[a.type] = (counts[a.type] || 0) + 1;
        });
        return counts;
    }, [vitality]);

    if (!selectedRental) return null;

    return (
        <div className="absolute top-0 right-0 h-full w-[360px] z-20 flex flex-col pointer-events-none">
            <div className="h-full m-4 ml-0 flex flex-col gap-3 pointer-events-auto overflow-hidden">

                {/* Back button */}
                <button
                    onClick={goBack}
                    id="back-button"
                    className="glass-card px-4 py-2.5 flex items-center gap-2 text-sm text-slate-300 
                     hover:text-white hover:border-neon-cyan/30 transition-all group shrink-0"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span>
                    <span>Back to Map</span>
                </button>

                {/* Rental Info Card */}
                <div className="glass-card p-5 shrink-0">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                            <h2 className="font-display font-bold text-lg text-white leading-tight">
                                {selectedRental.address}
                            </h2>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-avenue-500/20 text-avenue-300 border border-avenue-500/30">
                                    {selectedRental.type}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="glass-light rounded-xl p-3 text-center">
                            <div className="text-lg font-bold text-neon-cyan font-display">
                                ${selectedRental.price.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
                                /month
                            </div>
                        </div>
                        <div className="glass-light rounded-xl p-3 text-center">
                            <div className="text-lg font-bold text-white font-display">
                                {selectedRental.bedrooms}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
                                Beds
                            </div>
                        </div>
                        <div className="glass-light rounded-xl p-3 text-center">
                            <div className="text-lg font-bold text-white font-display">
                                {selectedRental.sqft}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
                                Sqft
                            </div>
                        </div>
                    </div>
                </div>

                {/* Vitality Score */}
                <div className="glass-card p-5 shrink-0">
                    <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-4 font-medium">
                        Neighbourhood Vitality
                    </h3>

                    {vitality?.loading ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-28 h-28 rounded-full shimmer" />
                            <span className="text-xs text-slate-500">Analyzing area...</span>
                        </div>
                    ) : vitality?.error ? (
                        <div className="text-center py-4">
                            <div className="text-sm text-amber-400/80 mb-2">⚠️ API Timeout</div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Overpass API is busy. The 3D scene will populate when data arrives.
                            </p>
                        </div>
                    ) : vitality && vitality.score > 0 ? (
                        <>
                            <ScoreRing score={vitality.score} />

                            {/* Category breakdown */}
                            <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                                {Object.entries(categoryCounts).map(([type, count]) => (
                                    <div
                                        key={type}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/5"
                                    >
                                        <span className="text-sm">{AMENITY_ICONS[type as keyof typeof AMENITY_ICONS]}</span>
                                        <span className="text-[11px] text-slate-400">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-28 h-28 rounded-full shimmer" />
                            <span className="text-xs text-slate-500">Fetching neighbourhood data...</span>
                        </div>
                    )}
                </div>

                {/* Nearby Businesses */}
                <div className="glass-card p-5 flex-1 flex flex-col min-h-0">
                    <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-medium shrink-0">
                        Nearby ({vitality?.amenities.length || 0} within 1km)
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                        {vitality?.loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-12 rounded-lg shimmer" />
                            ))
                        ) : (
                            sortedAmenities.map(amenity => (
                                <div
                                    key={amenity.id}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                             bg-white/[0.03] hover:bg-white/[0.06] border border-transparent
                             hover:border-white/5 transition-all group"
                                >
                                    <span className="text-lg shrink-0 w-8 text-center">
                                        {AMENITY_ICONS[amenity.type]}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-slate-200 truncate group-hover:text-white transition-colors">
                                            {amenity.name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 capitalize">
                                            {amenity.type}
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-500 shrink-0 tabular-nums">
                                        {Math.round(amenity.distance)}m
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Sponsored Section */}
                <div className="glass-card p-4 neon-border shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] uppercase tracking-widest text-neon-cyan/70 font-medium">
                            ✦ Small Business Spotlight
                        </span>
                    </div>
                    <div className="text-sm text-slate-300 leading-relaxed">
                        Discover local businesses in your new neighbourhood.
                        <span className="text-neon-cyan"> Support the community</span> that makes this area vibrant.
                    </div>
                    <button
                        id="explore-local-btn"
                        className="w-full mt-3 py-2 rounded-lg bg-gradient-to-r from-neon-cyan/20 to-neon-purple/20
                       border border-neon-cyan/20 text-xs text-neon-cyan font-medium
                       hover:from-neon-cyan/30 hover:to-neon-purple/30 transition-all"
                    >
                        Explore Local Businesses →
                    </button>
                </div>
            </div>
        </div>
    );
}
