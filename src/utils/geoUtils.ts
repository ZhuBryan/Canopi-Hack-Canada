// ── GPS-to-Local Vector Math ──
// Converts lat/lng offsets into Three.js [x, y, z] coordinates
// relative to a central origin point. 1 unit = 1 meter.

const DEG_TO_RAD = Math.PI / 180;

// Earth radius in meters
const EARTH_RADIUS = 6_371_000;

// Meters per degree of latitude (approximately constant)
const METERS_PER_DEG_LAT = 111_320;

/**
 * Meters per degree of longitude at a given latitude.
 * At ~43.55°N (midpoint Toronto/Waterloo), this is ≈ 80,820 m/deg.
 */
export function metersPerDegLng(latDeg: number): number {
    return METERS_PER_DEG_LAT * Math.cos(latDeg * DEG_TO_RAD);
}

/**
 * Converts a target lat/lng to local Three.js coordinates [x, y, z]
 * relative to an origin lat/lng.
 *
 * - X axis = East (positive)
 * - Y axis = Up (always 0 for ground-level)
 * - Z axis = South (positive) — Three.js convention: -Z is "into screen" / North
 *
 * @returns [x, y, z] in meters
 */
export function latLngToLocal(
    targetLat: number,
    targetLng: number,
    originLat: number,
    originLng: number
): [number, number, number] {
    const mPerDegLng = metersPerDegLng((originLat + targetLat) / 2);

    const dx = (targetLng - originLng) * mPerDegLng;       // East
    const dz = -(targetLat - originLat) * METERS_PER_DEG_LAT; // North → -Z in Three.js

    return [dx, 0, dz];
}

/**
 * Haversine distance between two lat/lng points in meters.
 */
export function getDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLng = (lng2 - lng1) * DEG_TO_RAD;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * DEG_TO_RAD) *
        Math.cos(lat2 * DEG_TO_RAD) *
        Math.sin(dLng / 2) ** 2;

    return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Maps a vitality score (0–100) to an HSL color string.
 * 0 = red (hue 0), 50 = yellow (hue 60), 100 = green (hue 120)
 */
export function scoreToColor(score: number): string {
    const hue = (score / 100) * 120; // 0→red, 120→green
    return `hsl(${hue}, 85%, 55%)`;
}

/**
 * Maps a vitality score to a Three.js-compatible hex color number.
 */
export function scoreToHex(score: number): number {
    const hue = (score / 100) * 120;
    // Convert HSL to RGB
    const s = 0.85;
    const l = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else { g = c; b = x; }

    const toInt = (v: number) => Math.round((v + m) * 255);
    return (toInt(r) << 16) | (toInt(g) << 8) | toInt(b);
}
