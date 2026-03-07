// ── Overpass API Hook: useVitality ──
// Fetches nearby amenities and computes a Vitality Score for a rental location.

import { useState, useEffect, useRef } from 'react';
import type { Amenity, AmenityType, VitalityResult } from '../types';
import { AMENITY_WEIGHTS } from '../types';
import { latLngToLocal, getDistance } from '../utils/geoUtils';

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
const SEARCH_RADIUS = 1000; // 1 km radius per user request

// Cache to avoid re-fetching for the same location
const cache = new Map<string, VitalityResult>();

function buildOverpassQuery(lat: number, lng: number): string {
    return `
    [out:json][timeout:25];
    (
      node["amenity"~"cafe|pharmacy|hospital|restaurant"](around:${SEARCH_RADIUS},${lat},${lng});
      node["leisure"="park"](around:${SEARCH_RADIUS},${lat},${lng});
      way["leisure"="park"](around:${SEARCH_RADIUS},${lat},${lng});
    );
    out center tags;
  `;
}

function categorizeElement(tags: Record<string, string>): AmenityType | null {
    if (tags.amenity === 'cafe') return 'cafe';
    if (tags.amenity === 'pharmacy') return 'pharmacy';
    if (tags.amenity === 'hospital') return 'hospital';
    if (tags.amenity === 'restaurant') return 'restaurant';
    if (tags.leisure === 'park') return 'park';
    return null;
}

function calculateScore(amenities: Amenity[]): number {
    // Count unique types and apply weights
    const typeCounts = new Map<AmenityType, number>();
    for (const a of amenities) {
        typeCounts.set(a.type, (typeCounts.get(a.type) || 0) + 1);
    }

    let score = 0;
    for (const [type, count] of typeCounts) {
        // Base weight for first occurrence + diminishing returns for extras
        const weight = AMENITY_WEIGHTS[type];
        score += weight + Math.min(count - 1, 4) * (weight * 0.15);
    }

    return Math.min(Math.round(score), 100);
}

export function useVitality(lat: number | null, lng: number | null): VitalityResult {
    const [result, setResult] = useState<VitalityResult>({
        score: 0,
        amenities: [],
        loading: false,
        error: null,
    });
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (lat === null || lng === null) return;

        const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            setResult(cached);
            return;
        }

        // Abort any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setResult(prev => ({ ...prev, loading: true, error: null }));

        const query = buildOverpassQuery(lat, lng);

        async function tryFetch(endpointIndex: number): Promise<Response> {
            const endpoint = OVERPASS_ENDPOINTS[endpointIndex];
            const res = await fetch(endpoint, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                signal: controller.signal,
            });
            if (!res.ok) {
                // Try fallback endpoint on server errors
                if (res.status >= 500 && endpointIndex < OVERPASS_ENDPOINTS.length - 1) {
                    return tryFetch(endpointIndex + 1);
                }
                throw new Error(`Overpass API error: ${res.status}`);
            }
            return res;
        }

        tryFetch(0)
            .then(res => res.json())
            .then(data => {
                const amenities: Amenity[] = [];
                const seen = new Set<string>();

                for (const el of data.elements) {
                    const tags = el.tags || {};
                    const type = categorizeElement(tags);
                    if (!type) continue;

                    // Use center for ways, direct coords for nodes
                    const elLat = el.center?.lat ?? el.lat;
                    const elLng = el.center?.lon ?? el.lon;
                    if (!elLat || !elLng) continue;

                    const name = tags.name || `Unnamed ${type}`;
                    const dedupeKey = `${type}-${name}-${elLat.toFixed(4)}`;
                    if (seen.has(dedupeKey)) continue;
                    seen.add(dedupeKey);

                    const distance = getDistance(lat, lng, elLat, elLng);
                    const localPos = latLngToLocal(elLat, elLng, lat, lng);

                    amenities.push({
                        id: el.id,
                        type,
                        name,
                        lat: elLat,
                        lng: elLng,
                        localPos,
                        distance,
                    });
                }

                // Sort by distance
                amenities.sort((a, b) => a.distance - b.distance);

                const score = calculateScore(amenities);
                const vitalityResult: VitalityResult = {
                    score,
                    amenities,
                    loading: false,
                    error: null,
                };

                cache.set(cacheKey, vitalityResult);
                setResult(vitalityResult);
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                setResult({
                    score: 0,
                    amenities: [],
                    loading: false,
                    error: err.message,
                });
            });

        return () => controller.abort();
    }, [lat, lng]);

    return result;
}
