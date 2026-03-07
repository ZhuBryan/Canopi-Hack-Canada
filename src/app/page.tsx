"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { MapboxMap } from "@/components/avenuex/MapboxMap";
import {
  DesktopNavbar,
  GhostButton,
  PrimaryButton,
  ScorePill,
} from "@/components/avenuex/primitives";
import { avenueNav } from "@/lib/avenuex-data";
import type { FilterType, Listing } from "@/lib/avenuex-data";
import UserMenu from "@/components/avenuex/UserMenu";
import { useSavedListings } from "@/hooks/useSavedListings";
import ChatPanel from "@/components/avenuex/ChatPanel";
import UserPriorityPanel from "@/components/avenuex/UserPriorityPanel";
import { usePreferences } from "@/hooks/usePreferences";
import { computePersonalScore, deriveBand, deriveStatus } from "@/lib/score-utils";

type SortMode = "recommended" | "price-asc" | "price-desc" | "score-desc";

const SERVICE_ROWS = [
  { label: "Schools", key: "schools", color: "#3B82F6" },
  { label: "Groceries", key: "groceries", color: "#22C55E" },
  { label: "Restaurants", key: "restaurants", color: "#F97316" },
  { label: "Cafes", key: "cafes", color: "#F59E0B" },
  { label: "Parks", key: "parks", color: "#16A34A" },
  { label: "Pharmacies", key: "pharmacies", color: "#EC4899" },
  { label: "Transit", key: "transit", color: "#8B5CF6" },
] as const;

const FILTER_OPTIONS: FilterType[] = ["All", "Apartment", "House", "Condo"];

function bedLabel(listing: Listing) {
  if (listing.bedsLabel) return listing.bedsLabel;
  return listing.beds === 0 ? "Studio" : `${listing.beds} Bed${listing.beds > 1 ? "s" : ""}`;
}

function bathLabel(listing: Listing) {
  if (listing.bathsLabel) return listing.bathsLabel;
  return `${listing.baths} Bath${listing.baths > 1 ? "s" : ""}`;
}

function sqftLabel(listing: Listing) {
  return listing.sqft > 0 ? `${listing.sqft} sqft` : null;
}

export default function HeroPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("All");
  const [sort, setSort] = useState<SortMode>("recommended");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isSaved, toggleSave, savedIds, isLoggedIn } = useSavedListings();
  const { preferences } = usePreferences();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/listings");
        if (!res.ok) throw new Error("Failed to fetch listings");
        const data: Listing[] = await res.json();
        if (!cancelled) setListings(data);
      } catch (error) {
        console.error("Failed to load listings:", error);
      } finally {
        if (!cancelled) setLoadingListings(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredListings = useMemo<Listing[]>(() => {
    // 1. Recalculate the vitality score based on user preferences
    const weights = {
      schools: preferences.w_schools,
      groceries: preferences.w_groceries,
      restaurants: preferences.w_restaurants,
      cafes: preferences.w_cafes,
      parks: preferences.w_parks,
      pharmacies: preferences.w_pharmacies,
      transit: preferences.w_transit,
    };

    let items = listings.map((l) => {
      if (!l.nearbyServices) return l;
      const score = computePersonalScore(l.nearbyServices, weights);
      const scoreBand = deriveBand(score);
      const scoreStatus = deriveStatus(scoreBand);
      return { ...l, score, scoreBand, scoreStatus };
    });

    console.log("Re-calculating scores using weights:", weights);
    if (items.length > 0) {
      console.log(`Sample updated score for ${items[0].address}: ${items[0].score}/100`);
    }

    // 2. Filter by max rent from preferences
    items = items.filter((l) => l.monthlyRent <= preferences.max_rent);

    // 3. Search and text filters
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (l) =>
          l.address.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          l.fullAddress.toLowerCase().includes(q)
      );
    }

    if (filter !== "All") {
      items = items.filter((l) => l.propertyType === filter);
    }

    switch (sort) {
      case "price-asc":
        return [...items].sort((a, b) => a.monthlyRent - b.monthlyRent);
      case "price-desc":
        return [...items].sort((a, b) => b.monthlyRent - a.monthlyRent);
      case "score-desc":
        return [...items].sort((a, b) => b.score - a.score);
      default:
        // By default, sort by personalized vitality score
        return [...items].sort((a, b) => b.score - a.score);
    }
  }, [listings, search, filter, sort, preferences]);

  const selectedListing = useMemo(
    () => (selectedId ? (listings.find((l) => l.id === selectedId) ?? null) : null),
    [selectedId, listings]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Navbar */}
      <DesktopNavbar
        searchPlaceholder={avenueNav.searchPlaceholder}
        savedCount={savedIds.size}
        searchValue={search}
        onSearchValueChange={setSearch}
        userMenu={<UserMenu />}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="flex w-80 flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
          {/* User Priority Panel */}
          <div className="border-b border-gray-200 p-4 pb-2">
            <UserPriorityPanel />
          </div>

          {/* Filters */}
          <div className="space-y-3 border-b border-gray-200 p-4 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === f
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-slate-500 hover:bg-gray-200 hover:text-slate-700"
                    }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-slate-700 outline-none"
            >
              <option value="recommended">Recommended</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="score-desc">Best Vitality Score</option>
            </select>
            <p className="text-xs text-slate-400">
              {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Listing Cards */}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {loadingListings && (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                <p className="text-xs text-slate-400">Loading listings…</p>
              </div>
            )}
            {!loadingListings && filteredListings.map((listing) => (
              <div
                key={listing.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(listing.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(listing.id);
                  }
                }}
                className={`w-full cursor-pointer flex-col rounded-xl border p-3 text-left outline-none transition focus:ring-2 focus:ring-green-400 focus:ring-offset-1 ${selectedId === listing.id
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                <div className="flex gap-3">
                  <div className="relative h-16 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                    <Image
                      src={listing.image}
                      alt={listing.address}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                    {/* Bookmark heart */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isLoggedIn) toggleSave(listing.id);
                      }}
                      className="absolute right-1 top-1 z-10 grid h-6 w-6 place-items-center rounded-full bg-white/80 backdrop-blur-sm transition hover:bg-white"
                      title={isLoggedIn ? (isSaved(listing.id) ? "Unsave" : "Save") : "Sign in to save"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={isSaved(listing.id) ? "#22c55e" : "none"} stroke={isSaved(listing.id) ? "#22c55e" : "#64748b"} strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-alt text-sm font-bold text-slate-900">
                        {listing.priceLabel}
                      </span>
                      <ScorePill label={`${listing.score}`} band={listing.scoreBand} score={listing.score} />
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-700">
                      {listing.address}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[bedLabel(listing), bathLabel(listing), sqftLabel(listing)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{listing.city}</p>
                    {listing.matchReason && (
                      <p className="mt-0.5 truncate text-xs font-medium text-green-600">
                        {listing.matchReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredListings.length === 0 && (
              <p className="mt-8 text-center text-xs text-slate-500">
                No listings match your search.
              </p>
            )}
          </div>
        </aside>

        {/* ── Map ── */}
        <div className="relative flex-1 overflow-hidden">
          <MapboxMap
            listings={filteredListings}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* ── Right Detail Panel ── */}
        {selectedListing && (
          <aside
            key={selectedListing.id}
            className="flex w-96 flex-shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-white"
          >
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <h2 className="mr-2 truncate font-display text-sm font-bold text-slate-900">
                {selectedListing.address}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => isLoggedIn && toggleSave(selectedListing.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${isSaved(selectedListing.id)
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 bg-white text-slate-500 hover:bg-gray-50"
                    }`}
                  title={isLoggedIn ? undefined : "Sign in to save"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={isSaved(selectedListing.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {isSaved(selectedListing.id) ? "Saved" : "Save"}
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
                  <p className="font-alt text-2xl font-bold text-slate-900">
                    {selectedListing.priceLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedListing.fullAddress}</p>
                  {selectedListing.incomeNeeded != null && (
                    <span className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      ${Math.round(selectedListing.incomeNeeded / 1000)}K+ income needed
                    </span>
                  )}
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
                  bathLabel(selectedListing),
                  sqftLabel(selectedListing),
                  selectedListing.propertyType,
                ]
                  .filter(Boolean)
                  .map((m) => (
                    <span
                      key={m}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      {m}
                    </span>
                  ))}
              </div>

              {/* About */}
              <div>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                  About
                </h3>
                <p className="text-xs leading-relaxed text-slate-600">{selectedListing.about}</p>
              </div>

              {/* Amenities */}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Building Amenities
                </h3>
                {selectedListing.amenities.length > 0 ? (
                  <div className="grid grid-cols-2 gap-y-1.5">
                    {selectedListing.amenities.map((a) => (
                      <div key={a} className="flex items-center gap-1.5 text-xs text-slate-700">
                        <span className="text-green-500">✓</span>
                        {a}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No building amenities scraped yet.</p>
                )}
              </div>

              {/* Nearby Services */}
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Nearby Services</h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">Actual counts within 1 km</p>
                  </div>
                  <ScorePill
                    label={`${selectedListing.score} / 100`}
                    band={selectedListing.scoreBand}
                    score={selectedListing.score}
                  />
                </div>
                <div className="space-y-3">
                  {SERVICE_ROWS.map(({ label, key, color }) => {
                    const val = selectedListing.nearbyServices?.[key] ?? 0;
                    return (
                      <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-slate-600">{label}</span>
                        </div>
                        <span className="font-semibold text-slate-800">{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lease info */}
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Available</span>
                  <span className="font-semibold text-slate-800">
                    {selectedListing.availableDate}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-slate-500">Lease Term</span>
                  <span className="font-semibold text-slate-800">{selectedListing.leaseTerm}</span>
                </div>
              </div>

              {/* Property manager */}
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-green-500 text-sm font-bold text-white">
                    PM
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Property Manager</p>
                    <p className="text-xs text-slate-500">Canopi Verified</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <PrimaryButton className="flex-1 !px-3 !py-2 !text-xs">Book Tour</PrimaryButton>
                  <GhostButton className="flex-1 !px-3 !py-2 !text-xs border border-gray-200">
                    Contact
                  </GhostButton>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Chatbot Panel */}
      <ChatPanel />
    </div>
  );
}
