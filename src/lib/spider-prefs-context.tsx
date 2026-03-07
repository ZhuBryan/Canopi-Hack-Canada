"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type SpiderAxes = {
  walkability: number;
  nourishment: number;
  wellness: number;
  greenery: number;
  buzz: number;
  essentials: number;
  safety: number;
  transit: number;
};

export const DEFAULT_AXES: SpiderAxes = {
  walkability: 50,
  nourishment: 50,
  wellness: 50,
  greenery: 50,
  buzz: 50,
  essentials: 50,
  safety: 50,
  transit: 50,
};

type Ctx = {
  prefs: SpiderAxes;
  setPrefs: (p: SpiderAxes) => void;
  hasProfile: boolean;
  chatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  widgetOpen: boolean;
  openWidget: () => void;
  closeWidget: () => void;
};

const SpiderPrefsContext = createContext<Ctx>({
  prefs: DEFAULT_AXES,
  setPrefs: () => {},
  hasProfile: false,
  chatOpen: false,
  openChat: () => {},
  closeChat: () => {},
  widgetOpen: true,
  openWidget: () => {},
  closeWidget: () => {},
});

export function SpiderPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsRaw] = useState<SpiderAxes>(DEFAULT_AXES);
  const [hasProfile, setHasProfile] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(true);

  const setPrefs = (p: SpiderAxes) => {
    setPrefsRaw(p);
    setHasProfile(true);
  };

  return (
    <SpiderPrefsContext.Provider
      value={{
        prefs,
        setPrefs,
        hasProfile,
        chatOpen,
        openChat: () => setChatOpen(true),
        closeChat: () => setChatOpen(false),
        widgetOpen,
        openWidget: () => setWidgetOpen(true),
        closeWidget: () => setWidgetOpen(false),
      }}
    >
      {children}
    </SpiderPrefsContext.Provider>
  );
}

export function useSpiderPrefs() {
  return useContext(SpiderPrefsContext);
}
