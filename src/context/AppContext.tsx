// ── App Context ──
// Shared state for view mode, selected rental, and vitality data.

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AppState, Rental, ViewMode, VitalityResult } from '../types';

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
    const [viewMode, setViewMode] = useState<ViewMode>('search');
    const [selectedRental, setSelectedRental] = useState<Rental | null>(null);
    const [vitality, setVitality] = useState<VitalityResult | null>(null);

    const selectRental = useCallback((rental: Rental) => {
        setSelectedRental(rental);
        setViewMode('transition');
    }, []);

    const goBack = useCallback(() => {
        setViewMode('search');
        setSelectedRental(null);
        setVitality(null);
    }, []);

    return (
        <AppContext.Provider
            value={{
                viewMode,
                selectedRental,
                vitality,
                setViewMode,
                selectRental,
                setVitality,
                goBack,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useAppState(): AppState {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppState must be used within AppProvider');
    return ctx;
}
