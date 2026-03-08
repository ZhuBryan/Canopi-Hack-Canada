/**
 * Avenue-X: Shared TypeScript types
 * This is the handshake schema all team members rely on.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Amenity {
  id: string;
  name: string;
  type: string;
  distance: number; // meters from rental
  coords: [number, number]; // [lat, lng]
  isSmallBusiness?: boolean;
  description?: string;
}

export interface RentalListing {
  id: string;
  address: string;
  coordinates: Coordinates;
  price: number;
  stories?: number;
  propertyType?: "house" | "apartment";
  amenities: Amenity[];
}

/**
 * Convert GPS offset to 3D scene coordinates.
 * The rental is at (0, 0, 0). Businesses are placed relative to it.
 */
export function gpsTo3D(
  businessCoords: [number, number],
  centerCoords: Coordinates,
  scaleFactor: number = 80
): [number, number, number] {
  const LAT_METERS = 111000;
  const LNG_METERS = 82000; // Approximate for ~43.5 latitude

  const dx = (businessCoords[1] - centerCoords.lng) * LNG_METERS;
  const dz = (businessCoords[0] - centerCoords.lat) * LAT_METERS;

  // Stable Y keeps anchors connected to the same map position between renders.
  const ySeed = Math.abs(
    Math.round(businessCoords[0] * 10000) + Math.round(businessCoords[1] * 10000)
  );
  const y = 3 + (ySeed % 200) / 100;

  return [
    (dx / 500) * scaleFactor * 0.5,
    y,
    (dz / 500) * scaleFactor * 0.5,
  ];
}
