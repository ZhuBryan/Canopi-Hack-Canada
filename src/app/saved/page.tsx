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

const CATEGORY_ROWS = [
    { label: "Food & Drink", key: "foodDrink", color: "#F97316" },
    { label: "Health", key: "health", color: "#EC4899" },
    { label: "Grocery & Parks", key: "groceryParks", color: "#22C55E" },
    { label: "Education", key: "education", color: "#3B82F6" },
    { label: "Emergency", key: "emergency", color: "#8B5CF6" },
] as const;

function bedLabel(listing: Listing) {
    return listing.beds === 0 ? "Studio" : `${listing.beds} Bed${listing.beds > 1 ? "s" : ""}`;
}

export default function SavedPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
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
        return listings.filter((l) => savedIds.has(l.id));
    }, [listings, savedIds]);

    const selectedListing = useMemo(
        () => (selectedId ? savedListings.find((l) => l.id === selectedId) ?? null : null),
        [selectedId, savedListings]
    );

    const isLoading = authLoading || savedLoading || fetching;

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-white">
            <DesktopNavbar
                searchPlaceholder={avenueNav.searchPlaceholder}
                savedCount={savedIds.size}
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
                                                <ScorePill label={`${listing.score}`} band={listing.scoreBand} score={listing.score} />
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <div className="flex items-center justify-between">
                                                <p className="font-alt text-lg font-bold text-slate-900">{listing.priceLabel}</p>
                                            </div>
                                            <p className="mt-0.5 text-sm font-medium text-slate-700">{listing.address}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">
                                                {bedLabel(listing)} · {listing.baths} bath · {listing.sqft} sqft · {listing.propertyType}
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
                                    <p className="font-alt text-2xl font-bold text-slate-900">{selectedListing.priceLabel}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">{selectedListing.fullAddress}</p>
                                </div>
                                <ScorePill
                                    label={`${selectedListing.score} / 100`}
                                    band={selectedListing.scoreBand}
                                    score={selectedListing.score}
                                />
                            </div>

                            {/* Meta chips */}
                            <div className="flex flex-wrap gap-2">
                                {[
                                    bedLabel(selectedListing),
                                    `${selectedListing.baths} Bath${selectedListing.baths > 1 ? "s" : ""}`,
                                    `${selectedListing.sqft} sqft`,
                                    selectedListing.propertyType,
                                ].map((m) => (
                                    <span key={m} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                        {m}
                                    </span>
                                ))}
                            </div>

                            {/* About */}
                            <div>
                                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">About</h3>
                                <p className="text-xs leading-relaxed text-slate-600">{selectedListing.about}</p>
                            </div>

                            {/* Amenities */}
                            <div>
                                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Amenities</h3>
                                <div className="grid grid-cols-2 gap-y-1.5">
                                    {selectedListing.amenities.map((a) => (
                                        <div key={a} className="flex items-center gap-1.5 text-xs text-slate-700">
                                            <span className="text-green-500">✓</span>
                                            {a}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Vitality Scorecard */}
                            <div className="rounded-xl border border-gray-200 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-slate-900">Vitality Score</h3>
                                    <ScorePill
                                        label={`${selectedListing.score} / 100`}
                                        band={selectedListing.scoreBand}
                                        score={selectedListing.score}
                                    />
                                </div>
                                <div className="space-y-3">
                                    {CATEGORY_ROWS.map(({ label, key, color }) => {
                                        const val = selectedListing.categoryScores[key];
                                        return (
                                            <div key={key}>
                                                <div className="mb-1 flex justify-between text-xs">
                                                    <span className="text-slate-600">{label}</span>
                                                    <span className="font-semibold text-slate-800">{val}</span>
                                                </div>
                                                <ScoreBar value={val} color={color} />
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
