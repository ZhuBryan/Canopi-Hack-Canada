"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { MapboxMap } from "@/components/avenuex/MapboxMap";
import {
  DesktopNavbar,
  GhostButton,
  PrimaryButton,
  ScoreBar,
  ScorePill,
} from "@/components/avenuex/primitives";
import { avenueNav, listingsCatalog } from "@/lib/avenuex-data";
import type { FilterType, Listing } from "@/lib/avenuex-data";
import UserMenu from "@/components/avenuex/UserMenu";

type SortMode = "recommended" | "price-asc" | "price-desc" | "score-desc";

const CATEGORY_ROWS = [
  { label: "Food & Drink", key: "foodDrink", color: "#F97316" },
  { label: "Health", key: "health", color: "#EC4899" },
  { label: "Grocery & Parks", key: "groceryParks", color: "#22C55E" },
  { label: "Education", key: "education", color: "#3B82F6" },
  { label: "Emergency", key: "emergency", color: "#8B5CF6" },
] as const;

const FILTER_OPTIONS: FilterType[] = ["All", "Apartment", "House", "Condo"];

function bedLabel(listing: Listing) {
  return listing.beds === 0 ? "Studio" : `${listing.beds} Bed${listing.beds > 1 ? "s" : ""}`;
}

export default function HeroPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("All");
  const [sort, setSort] = useState<SortMode>("recommended");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredListings = useMemo<Listing[]>(() => {
    let items = listingsCatalog;

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
  }, [search, filter, sort]);

  const selectedListing = useMemo(
    () => (selectedId ? (listingsCatalog.find((l) => l.id === selectedId) ?? null) : null),
    [selectedId]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Navbar */}
      <DesktopNavbar
        searchPlaceholder={avenueNav.searchPlaceholder}
        savedCount={0}
        searchValue={search}
        onSearchValueChange={setSearch}
        userMenu={<UserMenu />}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="flex w-80 flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
          {/* Filters */}
          <div className="space-y-3 border-b border-gray-200 p-4">
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
            {filteredListings.map((listing) => (
              <button
                key={listing.id}
                type="button"
                onClick={() => setSelectedId(listing.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${selectedId === listing.id
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
                      {bedLabel(listing)} · {listing.baths}ba · {listing.sqft} sqft
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{listing.city}</p>
                  </div>
                </div>
              </button>
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
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200"
                aria-label="Close panel"
              >
                ×
              </button>
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
                  Amenities
                </h3>
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
    </div>
  );
}
