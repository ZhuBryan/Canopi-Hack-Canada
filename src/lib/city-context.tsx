"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CITIES, DEFAULT_CITY, isCitySlug, type CityConfig, type CitySlug } from "@/lib/cities";

const STORAGE_KEY = "canopi-city";

type Ctx = { city: CitySlug; config: CityConfig; setCity: (slug: CitySlug) => void };
const CityContext = createContext<Ctx>({ city: DEFAULT_CITY, config: CITIES[DEFAULT_CITY], setCity: () => {} });

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState<CitySlug>(DEFAULT_CITY);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isCitySlug(saved)) setCityState(saved);
    } catch {}
  }, []);

  const setCity = (slug: CitySlug) => {
    setCityState(slug);
    try { window.localStorage.setItem(STORAGE_KEY, slug); } catch {}
  };

  return <CityContext.Provider value={{ city, config: CITIES[city], setCity }}>{children}</CityContext.Provider>;
}

export const useCity = () => useContext(CityContext);
