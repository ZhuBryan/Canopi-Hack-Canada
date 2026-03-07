// ── Avenue-X Type Definitions ──

export type ViewMode = 'search' | 'transition' | 'diorama';

export interface Rental {
    id: string;
    address: string;
    lat: number;
    lng: number;
    price: number;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    type: string;
    image?: string;
}

export interface Amenity {
    id: number;
    type: AmenityType;
    name: string;
    lat: number;
    lng: number;
    localPos: [number, number, number];
    distance: number; // meters from rental
}

export type AmenityType = 'cafe' | 'pharmacy' | 'hospital' | 'restaurant' | 'park';

export interface VitalityResult {
    score: number;
    amenities: Amenity[];
    loading: boolean;
    error: string | null;
}

export interface AppState {
    viewMode: ViewMode;
    selectedRental: Rental | null;
    vitality: VitalityResult | null;
    setViewMode: (mode: ViewMode) => void;
    selectRental: (rental: Rental) => void;
    setVitality: (vitality: VitalityResult) => void;
    goBack: () => void;
}

export const AMENITY_WEIGHTS: Record<AmenityType, number> = {
    hospital: 30,
    pharmacy: 25,
    park: 20,
    restaurant: 15,
    cafe: 10,
};

export const AMENITY_ICONS: Record<AmenityType, string> = {
    cafe: '☕',
    pharmacy: '💊',
    hospital: '🏥',
    restaurant: '🍽️',
    park: '🌳',
};

export const AMENITY_COLORS: Record<AmenityType, string> = {
    cafe: '#ff9f43',
    pharmacy: '#ee5a24',
    hospital: '#eb4d4b',
    restaurant: '#6ab04c',
    park: '#22a6b3',
};
