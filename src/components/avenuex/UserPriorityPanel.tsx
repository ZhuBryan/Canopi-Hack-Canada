"use client";

import { useState, useEffect } from "react";
import { PrimaryButton } from "@/components/avenuex/primitives";
import { usePreferences } from "@/hooks/usePreferences";
import type { UserPreferences } from "@/hooks/usePreferences";

const SLIDERS = [
  { key: "w_schools", label: "Schools" },
  { key: "w_groceries", label: "Groceries" },
  { key: "w_restaurants", label: "Restaurants" },
  { key: "w_cafes", label: "Cafes" },
  { key: "w_parks", label: "Parks" },
  { key: "w_pharmacies", label: "Pharmacies" },
  { key: "w_transit", label: "Transit" },
] as const;

export type SliderKey = (typeof SLIDERS)[number]["key"];

export default function UserPriorityPanel() {
  const { preferences, savePreferences, loading: prefsLoading, isLoggedIn } = usePreferences();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local state for the sliders so they drag smoothly
  const [localWeights, setLocalWeights] = useState<Record<SliderKey, number>>({
    w_schools: preferences.w_schools,
    w_groceries: preferences.w_groceries,
    w_restaurants: preferences.w_restaurants,
    w_cafes: preferences.w_cafes,
    w_parks: preferences.w_parks,
    w_pharmacies: preferences.w_pharmacies,
    w_transit: preferences.w_transit,
  });
  const [localMaxRent, setLocalMaxRent] = useState(preferences.max_rent);

  // Sync local state when preferences finish loading from Supabase
  useEffect(() => {
    setLocalWeights({
      w_schools: preferences.w_schools,
      w_groceries: preferences.w_groceries,
      w_restaurants: preferences.w_restaurants,
      w_cafes: preferences.w_cafes,
      w_parks: preferences.w_parks,
      w_pharmacies: preferences.w_pharmacies,
      w_transit: preferences.w_transit,
    });
    setLocalMaxRent(preferences.max_rent);
  }, [preferences]);

  const handleSliderChange = (key: SliderKey, value: number) => {
    setLocalWeights((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await savePreferences({
      ...localWeights,
      max_rent: localMaxRent,
    } as UserPreferences);
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-green-500 text-xs text-white">
            ✦
          </span>
          Personalize
        </span>
        <span
          className="text-xs text-slate-400 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-200 p-4 fade-pop">
          {/* Sliders */}
          {SLIDERS.map(({ key, label }) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">{label}</label>
                <span className="text-xs font-bold text-slate-800">{localWeights[key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={localWeights[key]}
                onChange={(e) => handleSliderChange(key, parseInt(e.target.value, 10))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-green-500"
              />
            </div>
          ))}

          {/* Max rent input */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Max Rent</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">$</span>
              <input
                type="number"
                min={0}
                step={100}
                value={localMaxRent}
                onChange={(e) => setLocalMaxRent(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Save & Apply */}
          <PrimaryButton onClick={handleSave} disabled={saving || prefsLoading} className="w-full">
            {saving ? "Saving…" : "Apply & Save Preferences"}
          </PrimaryButton>
          {!isLoggedIn && (
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Sign in to save your preferences across devices.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
