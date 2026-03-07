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
    let items = listings;

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
        return [...items].sort((a, b) => b.score - a.score);
    }
  }, [listings, search, filter, sort]);

  const selectedListing = useMemo(
    () => (selectedId ? (listings.find((l) => l.id === selectedId) ?? null) : null),
    [selectedId, listings]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ backgroundColor: "var(--background)" }}>
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
        <aside className="sidebar-texture flex w-80 flex-shrink-0 flex-col overflow-hidden border-r" style={{ borderColor: "var(--line)" }}>
          {/* Filters */}
          <div className="space-y-3 border-b p-4" style={{ borderColor: "var(--line)" }}>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === f
                    ? "text-white"
                    : "hover:opacity-80"
                    }`}
                  style={filter === f
                    ? { backgroundColor: "var(--brand)" }
                    : { backgroundColor: "var(--surface-raised)", color: "var(--muted)", border: "1px solid var(--line)" }
                  }
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="w-full rounded-full border px-3 py-2 text-xs outline-none"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--surface)", color: "var(--foreground)" }}
            >
              <option value="recommended">Recommended</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="score-desc">Best Vitality Score</option>
            </select>
            <p className="label-overline">
              {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Listing Cards */}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {loadingListings && (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <div className="h-6 w-6 animate-spin rounded-full" style={{ border: "2px solid var(--brand)", borderTopColor: "transparent" }} />
                <p className="text-xs" style={{ color: "var(--muted-light)" }}>Loading listings…</p>
              </div>
            )}
            {!loadingListings && filteredListings.map((listing) => (
              <button
                key={listing.id}
                type="button"
                onClick={() => setSelectedId(listing.id)}
                className="w-full rounded-2xl border p-3 text-left transition card-lift"
                style={selectedId === listing.id
                  ? { borderColor: "var(--brand)", backgroundColor: "var(--brand-soft)", boxShadow: "0 0 0 1px var(--brand)" }
                  : { borderColor: "var(--line)", backgroundColor: "var(--surface-raised)" }
                }
              >
                <div className="flex gap-3">
                  <div className="relative h-[72px] w-[88px] flex-shrink-0 overflow-hidden rounded-xl">
                    <Image
                      src={listing.image}
                      alt={listing.address}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                    {/* Bookmark heart */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isLoggedIn) toggleSave(listing.id);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); if (isLoggedIn) toggleSave(listing.id); } }}
                      className="absolute right-1 top-1 z-10 grid h-6 w-6 place-items-center rounded-full bg-white/80 backdrop-blur-sm transition hover:bg-white cursor-pointer"
                      title={isLoggedIn ? (isSaved(listing.id) ? "Unsave" : "Save") : "Sign in to save"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={isSaved(listing.id) ? "#22c55e" : "none"} stroke={isSaved(listing.id) ? "#22c55e" : "#64748b"} strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-alt text-sm font-bold" style={{ color: "var(--foreground)" }}>
                        {listing.priceLabel}
                      </span>
                      <ScorePill label={`${listing.score}`} band={listing.scoreBand} score={listing.score} />
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium" style={{ color: "var(--foreground)" }}>
                      {listing.address}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {[bedLabel(listing), bathLabel(listing), sqftLabel(listing)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-[10px] tracking-[0.04em] uppercase" style={{ color: "var(--muted-light)" }}>{listing.city}</p>
                    {listing.matchReason && (
                      <p className="mt-0.5 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold w-fit" style={{ backgroundColor: "var(--brand-soft)", color: "var(--brand-ink)" }}>
                        {listing.matchReason}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {filteredListings.length === 0 && (
              <p className="mt-8 text-center text-xs" style={{ color: "var(--muted)" }}>
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
            className="panel-slide-in flex w-96 flex-shrink-0 flex-col overflow-y-auto border-l"
            style={{ borderColor: "var(--line)", backgroundColor: "var(--surface-raised)" }}
          >
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur-sm" style={{ borderColor: "var(--line)", backgroundColor: "rgba(250,248,245,0.95)" }}>
              <h2 className="mr-2 truncate font-display text-sm font-bold" style={{ color: "var(--foreground)" }}>
                {selectedListing.address}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => isLoggedIn && toggleSave(selectedListing.id)}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition hover:opacity-80"
                  style={isSaved(selectedListing.id)
                    ? { borderColor: "var(--brand)", backgroundColor: "var(--brand-soft)", color: "var(--brand-ink)" }
                    : { borderColor: "var(--line)", backgroundColor: "var(--surface-raised)", color: "var(--muted)" }
                  }
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
                  className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-sm transition hover:opacity-80"
                  style={{ backgroundColor: "var(--line)", color: "var(--muted)" }}
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Hero image */}
            <div className="relative h-52 w-full flex-shrink-0 overflow-hidden">
              <Image
                src={selectedListing.image}
                alt={selectedListing.address}
                fill
                sizes="384px"
                className="object-cover transition-transform duration-700 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
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

              {/* Nearby Services */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Nearby Services</h3>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>Actual counts within 1 km</p>
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
                      <div key={key} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: "var(--background)" }}>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span style={{ color: "var(--muted)" }}>{label}</span>
                        </div>
                        <span className="font-semibold" style={{ color: "var(--foreground)" }}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lease info */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
                <div className="flex justify-between text-xs">
                  <span className="label-overline">Available</span>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                    {selectedListing.availableDate}
                  </span>
                </div>
                <div className="mt-3 flex justify-between text-xs">
                  <span className="label-overline">Lease Term</span>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>{selectedListing.leaseTerm}</span>
                </div>
              </div>

              {/* Property manager */}
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-[var(--brand-soft)]" style={{ backgroundColor: "var(--brand)" }}>
                    PM
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Property Manager</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--brand)" }}>
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>Canopi Verified</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <PrimaryButton className="flex-1 !px-3 !py-2 !text-xs">Book Tour</PrimaryButton>
                  <GhostButton className="flex-1 !px-3 !py-2 !text-xs">
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
