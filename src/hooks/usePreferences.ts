"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export interface UserPreferences {
    w_schools: number;
    w_groceries: number;
    w_restaurants: number;
    w_cafes: number;
    w_parks: number;
    w_pharmacies: number;
    w_transit: number;
    max_rent: number;
}

const DEFAULT_PREFS: UserPreferences = {
    w_schools: 5,
    w_groceries: 5,
    w_restaurants: 5,
    w_cafes: 5,
    w_parks: 5,
    w_pharmacies: 5,
    w_transit: 5,
    max_rent: 3200,
};

export function usePreferences() {
    const { user } = useAuth();
    const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFS);
    const [loading, setLoading] = useState(false);

    // Load preferences when user signs in
    useEffect(() => {
        if (!user) {
            setPreferences(DEFAULT_PREFS);
            return;
        }

        setLoading(true);
        supabase
            .from("user_preferences")
            .select("*")
            .eq("user_id", user.id)
            .single()
            .then(({ data }) => {
                if (data) {
                    setPreferences({
                        w_schools: data.w_schools,
                        w_groceries: data.w_groceries,
                        w_restaurants: data.w_restaurants,
                        w_cafes: data.w_cafes,
                        w_parks: data.w_parks,
                        w_pharmacies: data.w_pharmacies,
                        w_transit: data.w_transit,
                        max_rent: data.max_rent,
                    });
                }
                setLoading(false);
            });
    }, [user]);

    const savePreferences = useCallback(
        async (prefs: UserPreferences) => {
            setPreferences(prefs);
            if (!user) return;

            await supabase.from("user_preferences").upsert(
                {
                    user_id: user.id,
                    ...prefs,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" }
            );
        },
        [user]
    );

    return { preferences, savePreferences, loading, isLoggedIn: !!user };
}
