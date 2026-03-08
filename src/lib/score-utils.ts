import type { ScoreBand } from "@/lib/avenuex-data";
export type { ScoreBand };

export const BUCKET_KEYS = [
    "schools",
    "groceries",
    "restaurants",
    "cafes",
    "parks",
    "pharmacies",
    "transit",
] as const;

export type BucketKey = (typeof BUCKET_KEYS)[number];

export const BUCKET_LABELS: Record<BucketKey, string> = {
    schools: "Schools",
    groceries: "Grocery",
    restaurants: "Restaurants",
    cafes: "Cafes",
    parks: "Parks",
    pharmacies: "Pharmacies",
    transit: "Transit",
};

export const BUCKET_CAPS = {
    schools: 15,
    groceries: 15,
    restaurants: 50,
    cafes: 30,
    parks: 15,
    pharmacies: 10,
    transit: 25,
} as const;

export interface Weights {
    schools: number;
    groceries: number;
    restaurants: number;
    cafes: number;
    parks: number;
    pharmacies: number;
    transit: number;
}

export function deriveBand(score: number): ScoreBand {
    if (score >= 70) return "great";
    if (score >= 45) return "medium";
    return "warning";
}

export function deriveStatus(band: ScoreBand): string {
    if (band === "great") return "Great neighborhood access";
    if (band === "medium") return "Moderate neighborhood access";
    return "Limited neighborhood access";
}

export function computePersonalScore(
    nearbyCounts: Record<BucketKey, number>,
    weights: Weights
): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const key of BUCKET_KEYS) {
        const w = weights[key];
        if (w <= 0) continue;
        const count = nearbyCounts[key] || 0;
        const cap = BUCKET_CAPS[key];
        const normalized = Math.min(count, cap) / cap;
        weightedSum += w * normalized;
        totalWeight += w;
    }

    if (totalWeight === 0) return 0;
    return Math.round((weightedSum / totalWeight) * 100);
}

export function buildMatchReason(
    nearbyCounts: Record<BucketKey, number>,
    weights: Weights
): string {
    const scored: { key: BucketKey; contribution: number }[] = [];

    for (const key of BUCKET_KEYS) {
        const w = weights[key];
        const count = nearbyCounts[key] || 0;
        const cap = BUCKET_CAPS[key];
        const normalized = Math.min(count, cap) / cap;
        scored.push({ key, contribution: w * normalized });
    }

    scored.sort((a, b) => b.contribution - a.contribution);

    const top = scored.slice(0, 2).filter((s) => s.contribution > 0);
    if (top.length === 0) return "Limited data for your priorities";

    const labels = top.map((s) => BUCKET_LABELS[s.key].toLowerCase());
    return `Strong ${labels.join(" and ")} access`;
}
