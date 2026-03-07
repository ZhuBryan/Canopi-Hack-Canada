"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/avenuex/primitives";
import type { Listing } from "@/lib/avenuex-data";

const SLIDERS = [
  { key: "w_schools", label: "Schools" },
  { key: "w_groceries", label: "Groceries" },
  { key: "w_restaurants", label: "Restaurants" },
  { key: "w_cafes", label: "Cafes" },
  { key: "w_parks", label: "Parks" },
  { key: "w_pharmacies", label: "Pharmacies" },
  { key: "w_transit", label: "Transit" },
] as const;

type SliderKey = (typeof SLIDERS)[number]["key"];

interface UserPriorityPanelProps {
  onResults: (listings: Listing[]) => void;
}

export default function UserPriorityPanel({ onResults }: UserPriorityPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [maxRent, setMaxRent] = useState(3200);
  const [weights, setWeights] = useState<Record<SliderKey, number>>({
    w_schools: 5,
    w_groceries: 5,
    w_restaurants: 5,
    w_cafes: 5,
    w_parks: 5,
    w_pharmacies: 5,
    w_transit: 5,
  });

  const handleSliderChange = (key: SliderKey, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("maxRent", String(maxRent));
      for (const { key } of SLIDERS) {
        params.set(key, String(weights[key]));
      }
      const res = await fetch(`/api/suggestions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      const data: Listing[] = await res.json();
      onResults(data);
    } catch (err) {
      console.error("UserPriorityPanel fetch error:", err);
    } finally {
      setLoading(false);
    }
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
                <span className="text-xs font-bold text-slate-800">{weights[key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={weights[key]}
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
                value={maxRent}
                onChange={(e) => setMaxRent(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Submit */}
          <PrimaryButton onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Searching…" : "Find My Match"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
