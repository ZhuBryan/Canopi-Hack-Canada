"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

interface SavedListingsContextValue {
    savedIds: Set<string>;
    isSaved: (id: string) => boolean;
    toggleSave: (id: string) => Promise<void>;
    loading: boolean;
    isLoggedIn: boolean;
}

const SavedListingsContext = createContext<SavedListingsContextValue | null>(null);

export function SavedListingsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    // Load saved listings when user signs in
    useEffect(() => {
        if (!user || !supabase) {
            setSavedIds(new Set());
            return;
        }

        setLoading(true);
        supabase
            .from("saved_listings")
            .select("listing_id")
            .eq("user_id", user.id)
            .then(({ data, error }) => {
                if (data && !error) {
                    setSavedIds(new Set(data.map((d) => d.listing_id)));
                }
                setLoading(false);
            });
    }, [user]);

    const isSaved = useCallback(
        (listingId: string) => savedIds.has(listingId),
        [savedIds]
    );

    const toggleSave = useCallback(
        async (listingId: string) => {
            // Optimistic update even if not logged in for local testing
            setSavedIds((prev) => {
                const next = new Set(prev);
                if (next.has(listingId)) {
                    next.delete(listingId);
                } else {
                    next.add(listingId);
                }
                return next;
            });

            if (!user || !supabase) return;

            const currentlySaved = savedIds.has(listingId);

            try {
                if (currentlySaved) {
                    await supabase
                        .from("saved_listings")
                        .delete()
                        .eq("user_id", user.id)
                        .eq("listing_id", listingId);
                } else {
                    await supabase
                        .from("saved_listings")
                        .insert({ user_id: user.id, listing_id: listingId });
                }
            } catch (err) {
                // Revert on failure
                console.error("Failed to toggle save", err);
                setSavedIds((prev) => {
                    const next = new Set(prev);
                    if (currentlySaved) next.add(listingId);
                    else next.delete(listingId);
                    return next;
                });
            }
        },
        [user, savedIds]
    );

    return (
        <SavedListingsContext.Provider
      value= {{ savedIds, isSaved, toggleSave, loading, isLoggedIn: !!user }
}
    >
    { children }
    </SavedListingsContext.Provider>
  );
}

export function useSavedListings() {
    const ctx = useContext(SavedListingsContext);
    if (!ctx) throw new Error("useSavedListings must be used within a SavedListingsProvider");
    return ctx;
}
