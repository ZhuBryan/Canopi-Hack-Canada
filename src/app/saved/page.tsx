"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSavedListings } from "@/hooks/useSavedListings";
import { useAuth } from "@/lib/auth-context";

import { DesktopNavbar, ScorePill, ScoreBar, scoreColor } from "@/components/avenuex/primitives";
import { avenueNav } from "@/lib/avenuex-data";
import UserMenu from "@/components/avenuex/UserMenu";
import type { Listing } from "@/lib/avenuex-data";
import { useEffect, useMemo, useState } from "react";

import { useSpiderPrefs, SpiderAxes } from "@/lib/spider-prefs-context";
import SpiderChart, { computeMatch } from "@/components/avenuex/SpiderChart";

const SERVICE_ROWS = [
    { label: "Schools", key: "schools", color: "#3B82F6" },
    { label: "Groceries", key: "groceries", color: "#22C55E" },
    { label: "Restaurants", key: "restaurants", color: "#F97316" },
    { label: "Cafes", key: "cafes", color: "#F59E0B" },
    { label: "Parks", key: "parks", color: "#16A34A" },
    { label: "Pharmacies", key: "pharmacies", color: "#EC4899" },
    { label: "Transit", key: "transit", color: "#8B5CF6" },
] as const;

function bedLabel(listing: Listing) {
    return listing.beds === 0 ? "Studio" : `${listing.beds} Bed${listing.beds > 1 ? "s" : ""}`;
}
function bathLabel(listing: Listing) {
    return listing.bathsLabel ?? `${listing.baths} Bath${listing.baths > 1 ? "s" : ""}`;
}
function sqftLabel(listing: Listing) {
    return listing.sqft ? `${listing.sqft} sqft` : undefined;
}

function deriveListingAxes(listing: Listing): SpiderAxes {
    const cs = listing.categoryScores;
    const ns = listing.nearbyServices;
    const n = (count: number | undefined, cap: number) =>
        count !== undefined ? Math.min(100, Math.round((count / cap) * 100)) : null;
    return {
        walkability: Math.round((cs.foodDrink + cs.groceryParks + cs.education) / 3),
        nourishment: cs.foodDrink,
        wellness: Math.round((cs.health + (n(ns?.pharmacies, 5) ?? cs.health)) / 2),
        greenery: Math.round((cs.groceryParks + (n(ns?.parks, 15) ?? cs.groceryParks)) / 2),
        buzz: Math.round(cs.foodDrink * 0.88),
        essentials: Math.round((cs.groceryParks + cs.education) / 2),
        safety: cs.emergency,
        transit: n(ns?.transit, 12) ?? Math.round(listing.score * 0.85),
    };
}

export default function SavedPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { prefs } = useSpiderPrefs();
    const { savedIds, toggleSave, isSaved, loading: savedLoading } = useSavedListings();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [listings, setListings] = useState<Listing[]>([]);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/listings")
            .then(res => res.json())
            .then(data => {
                if (!cancelled) {
                    setListings(data);
                    setFetching(false);
                }
            })
            .catch(err => {
                console.error(err);
                if (!cancelled) setFetching(false);
            });
        return () => { cancelled = true; };
    }, []);

    const savedListings = useMemo(() => {
        return listings
            .filter((l) => savedIds.has(l.id))
            .map((l) => ({
                ...l,
                personalScore: computeMatch(prefs, deriveListingAxes(l)),
            }))
            .sort((a, b) => (b.personalScore ?? b.score) - (a.personalScore ?? a.score));
    }, [listings, savedIds, prefs]);

    const selectedListing = useMemo(
        () => (selectedId ? savedListings.find((l) => l.id === selectedId) ?? null : null),
        [selectedId, savedListings]
    );

    const isLoading = authLoading || savedLoading || fetching;

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-white">
            <DesktopNavbar
                searchPlaceholder={avenueNav.searchPlaceholder}
                savedCount={savedListings.length}
                userMenu={<UserMenu />}
            />

            <div className="flex flex-1 overflow-hidden">
                {/* ── Main Content ── */}
                <div className="flex-1 overflow-y-auto">
                    {/* Header */}
                    <div className="border-b border-gray-200 px-8 py-6">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => router.push("/")}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 text-slate-500 transition hover:bg-gray-50"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 12H5M12 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <div>
                                <h1 className="font-[family-name:var(--font-bricolage-grotesque)] text-2xl font-bold text-slate-900">
                                    Saved Listings
                                </h1>
                                <p className="text-sm text-slate-500">
                                    {savedListings.length} listing{savedListings.length !== 1 ? "s" : ""} saved
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                            </div>
                        ) : !user ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-gray-100">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                    </svg>
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">Sign in to save listings</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Create an account to bookmark your favorite properties
                                </p>
                            </div>
                        ) : savedListings.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-gray-100">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                    </svg>
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">No saved listings yet</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Click the heart on any listing to save it here
                                </p>
                                <button
                                    onClick={() => router.push("/")}
                                    className="mt-4 rounded-xl bg-green-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-green-600"
                                >
                                    Browse Listings
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {savedListings.map((listing) => (
                                    <article
                                        key={listing.id}
                                        className={`cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${selectedId === listing.id
                                            ? "border-green-500 ring-1 ring-green-500"
                                            : "border-gray-200"
                                            }`}
                                        onClick={() => setSelectedId(listing.id)}
                                    >
                                        <div className="relative h-40">
                                            <Image
                                                src={listing.image}
                                                alt={listing.address}
                                                fill
                                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                                className="object-cover"
                                            />
                                            {/* Unsave button */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSave(listing.id);
                                                }}
                                                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 backdrop-blur-sm transition hover:bg-white"
                                                title="Remove from saved"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="2">
                                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                                </svg>
                                            </button>
                                            {/* Score badge */}
                                            <div className="absolute bottom-2 left-2">
                                                <ScorePill label={`${listing.personalScore ?? listing.score}`} band={listing.scoreBand} score={listing.personalScore ?? listing.score} />
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <div className="flex items-center justify-between">
                                                <p className="font-alt text-lg font-bold text-slate-900">{listing.priceLabel}</p>
                                            </div>
                                            <p className="mt-0.5 text-sm font-medium text-slate-700">{listing.address}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">
                                                {[bedLabel(listing), bathLabel(listing), sqftLabel(listing), listing.propertyType].filter(Boolean).join(' · ')}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-400">{listing.city}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Detail Panel (slides in when a card is clicked) ── */}
                {selectedListing && (
                    <aside className="flex w-96 flex-shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
                        {/* Header */}
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
                            <h2 className="mr-2 truncate font-[family-name:var(--font-bricolage-grotesque)] text-sm font-bold text-slate-900">
                                {selectedListing.address}
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => toggleSave(selectedListing.id)}
                                    className="flex items-center gap-1.5 rounded-lg border border-green-500 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 transition"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                    </svg>
                                    Saved
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(null)}
                                    className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200"
                                    aria-label="Close panel"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Hero image */}
                        <div className="relative h-48 w-full flex-shrink-0">
                            <Image
                                src={selectedListing.image}
                                alt={selectedListing.address}
                                fill
                                sizes="384px"
                                className="object-cover"
                            />
                        </div>

                        {/* Content */}
                        <div className="space-y-4 p-4">
                            {/* Price + score */}
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="font-alt text-[1.625rem] font-bold leading-none tracking-[-0.025em]" style={{ color: "var(--foreground)" }}>
                                        {selectedListing.priceLabel}
                                    </p>
                                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{selectedListing.fullAddress}</p>
                                    {selectedListing.incomeNeeded != null && (
                                        <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "var(--amber-soft)", color: "var(--amber)" }}>
                                            Suggested Annual Income: ${Math.round(selectedListing.incomeNeeded / 1000)}K+
                                        </span>
                                    )}
                                </div>
                                <ScorePill
                                    label={`${selectedListing.personalScore ?? selectedListing.score} / 100`}
                                    band={selectedListing.scoreBand}
                                    score={selectedListing.personalScore ?? selectedListing.score}
                                />
                            </div>

                            {/* Meta chips */}
                            <div className="flex flex-wrap gap-2">
                                {[
                                    bedLabel(selectedListing),
                                    bathLabel(selectedListing),
                                    sqftLabel(selectedListing),
                                    selectedListing.propertyType,
                                ]
                                    .filter(Boolean)
                                    .map((m) => (
                                        <span
                                            key={m}
                                            className="rounded-full px-2.5 py-1 text-xs font-semibold"
                                            style={{ backgroundColor: "var(--background)", color: "var(--muted)", border: "1px solid var(--line)" }}
                                        >
                                            {m}
                                        </span>
                                    ))}
                            </div>

                            {/* About */}
                            <div>
                                <h3 className="section-divider label-overline mb-1.5">About</h3>
                                <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{selectedListing.about}</p>
                            </div>

                            {/* Amenities */}
                            <div>
                                <h3 className="section-divider label-overline mb-2">Building Amenities</h3>
                                {selectedListing.amenities.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-y-1.5">
                                        {selectedListing.amenities.map((a) => (
                                            <div key={a} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--foreground)" }}>
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--brand)", flexShrink: 0 }}>
                                                    <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
                                                </svg>
                                                {a}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs" style={{ color: "var(--muted)" }}>No building amenities scraped yet.</p>
                                )}
                            </div>

                            {/* Spider Chart — Your Match */}
                            <div>
                                <h3 className="section-divider label-overline mb-3">Your Match</h3>
                                <SpiderChart listingAxes={deriveListingAxes(selectedListing)} />
                            </div>

                            {/* Nearby Services */}
                            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)' }}>
                                <div className="mb-3 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Nearby Services</h3>
                                        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>Actual counts within 1 km</p>
                                    </div>
                                    <ScorePill
                                        label={`${selectedListing.personalScore ?? selectedListing.score} / 100`}
                                        band={selectedListing.scoreBand}
                                        score={selectedListing.personalScore ?? selectedListing.score}
                                    />
                                </div>
                                <div className="space-y-3">
                                    {SERVICE_ROWS.map(({ label, key, color }) => {
                                        const val = selectedListing.nearbyServices?.[key] ?? 0;
                                        return (
                                            <div key={key} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--background)' }}>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                                    <span style={{ color: 'var(--muted)' }}>{label}</span>
                                                </div>
                                                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{val}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Lease info */}
                            <div className="rounded-xl bg-slate-50 p-4">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Available</span>
                                    <span className="font-semibold text-slate-800">{selectedListing.availableDate}</span>
                                </div>
                                <div className="mt-2 flex justify-between text-xs">
                                    <span className="text-slate-500">Lease Term</span>
                                    <span className="font-semibold text-slate-800">{selectedListing.leaseTerm}</span>
                                </div>
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
}
