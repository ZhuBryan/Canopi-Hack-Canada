"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export function useSavedListings() {
    const { user } = useAuth();
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    // Load saved listings when user signs in
    useEffect(() => {
        if (!user) {
            setSavedIds(new Set());
            return;
        }

        setLoading(true);
        supabase
            .from("saved_listings")
            .select("listing_id")
            .eq("user_id", user.id)
            .then(({ data }) => {
                if (data) {
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
            if (!user) return;

            if (savedIds.has(listingId)) {
                // Remove
                setSavedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(listingId);
                    return next;
                });
                await supabase
                    .from("saved_listings")
                    .delete()
                    .eq("user_id", user.id)
                    .eq("listing_id", listingId);
            } else {
                // Add
                setSavedIds((prev) => new Set(prev).add(listingId));
                await supabase
                    .from("saved_listings")
                    .insert({ user_id: user.id, listing_id: listingId });
            }
        },
        [user, savedIds]
    );

    return { savedIds, isSaved, toggleSave, loading, isLoggedIn: !!user };
}
