"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultCompareIds,
  defaultSavedIds,
  defaultSelectedListingId,
  type FilterType,
  type Listing,
  listingsCatalog,
} from "@/lib/avenuex-data";

type SortMode = "recommended" | "price-asc" | "price-desc" | "score-desc";

type PersistedState = {
  compareIds: string[];
  savedIds: string[];
  selectedListingId: string;
  searchQuery: string;
  propertyFilter: FilterType;
  sortMode: SortMode;
  maxRent: number;
};

type AvenueXState = {
  allListings: Listing[];
  filteredListings: Listing[];
  savedListings: Listing[];
  compareListings: Listing[];
  selectedListing: Listing;
  compareIds: string[];
  savedIds: string[];
  searchQuery: string;
  propertyFilter: FilterType;
  sortMode: SortMode;
  maxRent: number;
  savedCount: number;
  setSearchQuery: (value: string) => void;
  setPropertyFilter: (value: FilterType) => void;
  setSortMode: (value: SortMode) => void;
  setMaxRent: (value: number) => void;
  setSelectedListingId: (id: string) => void;
  toggleSaved: (id: string) => void;
  toggleCompare: (id: string) => void;
  isSaved: (id: string) => boolean;
  isCompared: (id: string) => boolean;
  clearCompare: () => void;
  resetFilters: () => void;
};

const STORAGE_KEY = "avenuex-app-state-v1";

const defaultState: PersistedState = {
  compareIds: defaultCompareIds,
  savedIds: defaultSavedIds,
  selectedListingId: defaultSelectedListingId,
  searchQuery: "",
  propertyFilter: "All",
  sortMode: "recommended",
  maxRent: 3200,
};

const AvenueXContext = createContext<AvenueXState | undefined>(undefined);

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids)).filter((id) =>
    listingsCatalog.some((listing) => listing.id === id)
  );
}

function sortListings(listings: Listing[], mode: SortMode) {
  if (mode === "price-asc") {
    return [...listings].sort((a, b) => a.monthlyRent - b.monthlyRent);
  }
  if (mode === "price-desc") {
    return [...listings].sort((a, b) => b.monthlyRent - a.monthlyRent);
  }
  if (mode === "score-desc") {
    return [...listings].sort((a, b) => b.score - a.score);
  }
  return [...listings].sort((a, b) => b.score - a.score);
}

export function AvenueXProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => {
    if (typeof window === "undefined") {
      return defaultState;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        compareIds: dedupeIds(parsed.compareIds ?? defaultState.compareIds).slice(0, 2),
        savedIds: dedupeIds(parsed.savedIds ?? defaultState.savedIds),
        selectedListingId: parsed.selectedListingId ?? defaultState.selectedListingId,
        searchQuery: parsed.searchQuery ?? defaultState.searchQuery,
        propertyFilter: parsed.propertyFilter ?? defaultState.propertyFilter,
        sortMode: parsed.sortMode ?? defaultState.sortMode,
        maxRent: parsed.maxRent ?? defaultState.maxRent,
      };
    } catch {
      return defaultState;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const filteredListings = useMemo(() => {
    const search = state.searchQuery.trim().toLowerCase();
    const filtered = listingsCatalog.filter((listing) => {
      const matchesSearch =
        search.length === 0 ||
        `${listing.address} ${listing.city} ${listing.fullAddress}`
          .toLowerCase()
          .includes(search);
      const matchesType =
        state.propertyFilter === "All" || listing.propertyType === state.propertyFilter;
      const matchesRent = listing.monthlyRent <= state.maxRent;
      return matchesSearch && matchesType && matchesRent;
    });

    return sortListings(filtered, state.sortMode);
  }, [state.maxRent, state.propertyFilter, state.searchQuery, state.sortMode]);

  const selectedListing = useMemo(() => {
    const byId = listingsCatalog.find((listing) => listing.id === state.selectedListingId);
    return byId ?? listingsCatalog[0];
  }, [state.selectedListingId]);

  const savedListings = useMemo(
    () =>
      listingsCatalog.filter((listing) => state.savedIds.includes(listing.id)),
    [state.savedIds]
  );

  const compareListings = useMemo(
    () =>
      listingsCatalog.filter((listing) => state.compareIds.includes(listing.id)),
    [state.compareIds]
  );

  const setSearchQuery = useCallback((value: string) => {
    setState((previous) => ({ ...previous, searchQuery: value }));
  }, []);

  const setPropertyFilter = useCallback((value: FilterType) => {
    setState((previous) => ({ ...previous, propertyFilter: value }));
  }, []);

  const setSortMode = useCallback((value: SortMode) => {
    setState((previous) => ({ ...previous, sortMode: value }));
  }, []);

  const setMaxRent = useCallback((value: number) => {
    setState((previous) => ({ ...previous, maxRent: value }));
  }, []);

  const setSelectedListingId = useCallback((id: string) => {
    setState((previous) => ({ ...previous, selectedListingId: id }));
  }, []);

  const toggleSaved = useCallback((id: string) => {
    setState((previous) => {
      const alreadySaved = previous.savedIds.includes(id);
      const nextSavedIds = alreadySaved
        ? previous.savedIds.filter((savedId) => savedId !== id)
        : [...previous.savedIds, id];
      const nextCompareIds = alreadySaved
        ? previous.compareIds.filter((compareId) => compareId !== id)
        : previous.compareIds;
      return {
        ...previous,
        savedIds: nextSavedIds,
        compareIds: nextCompareIds,
      };
    });
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setState((previous) => {
      if (previous.compareIds.includes(id)) {
        return {
          ...previous,
          compareIds: previous.compareIds.filter((compareId) => compareId !== id),
        };
      }
      if (previous.compareIds.length >= 2) {
        return previous;
      }
      return {
        ...previous,
        compareIds: [...previous.compareIds, id],
        savedIds: previous.savedIds.includes(id)
          ? previous.savedIds
          : [...previous.savedIds, id],
      };
    });
  }, []);

  const isSaved = useCallback(
    (id: string) => state.savedIds.includes(id),
    [state.savedIds]
  );

  const isCompared = useCallback(
    (id: string) => state.compareIds.includes(id),
    [state.compareIds]
  );

  const clearCompare = useCallback(() => {
    setState((previous) => ({ ...previous, compareIds: [] }));
  }, []);

  const resetFilters = useCallback(() => {
    setState((previous) => ({
      ...previous,
      searchQuery: "",
      propertyFilter: "All",
      sortMode: "recommended",
      maxRent: defaultState.maxRent,
    }));
  }, []);

  const value: AvenueXState = {
    allListings: listingsCatalog,
    filteredListings,
    savedListings,
    compareListings,
    selectedListing,
    compareIds: state.compareIds,
    savedIds: state.savedIds,
    searchQuery: state.searchQuery,
    propertyFilter: state.propertyFilter,
    sortMode: state.sortMode,
    maxRent: state.maxRent,
    savedCount: state.savedIds.length,
    setSearchQuery,
    setPropertyFilter,
    setSortMode,
    setMaxRent,
    setSelectedListingId,
    toggleSaved,
    toggleCompare,
    isSaved,
    isCompared,
    clearCompare,
    resetFilters,
  };

  return <AvenueXContext.Provider value={value}>{children}</AvenueXContext.Provider>;
}

export function useAvenueX() {
  const context = useContext(AvenueXContext);
  if (!context) {
    throw new Error("useAvenueX must be used inside AvenueXProvider.");
  }
  return context;
}
