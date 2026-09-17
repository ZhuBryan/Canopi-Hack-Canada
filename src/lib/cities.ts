export type CitySlug = "toronto" | "sf";

export type CityConfig = {
  slug: CitySlug;
  label: string;
  region: string;
  country: "CA" | "US";
  center: [number, number]; // [lng, lat]
  zoom: number;
  maskRadiusKm: number;
  promptBlurb: string;
  landmarks: string;
};

export const CITIES: Record<CitySlug, CityConfig> = {
  toronto: {
    slug: "toronto",
    label: "Toronto",
    region: "ON",
    country: "CA",
    center: [-79.3832, 43.6532],
    zoom: 14,
    maskRadiusKm: 25,
    promptBlurb: "a Toronto rental platform",
    landmarks:
      "CN Tower (43.643, -79.387), Union Station (43.645, -79.381), U of T (43.663, -79.396), King & Spadina (43.644, -79.396)",
  },
  sf: {
    slug: "sf",
    label: "San Francisco",
    region: "CA",
    country: "US",
    center: [-122.4194, 37.7749],
    zoom: 13,
    maskRadiusKm: 12,
    promptBlurb: "a San Francisco rental platform",
    landmarks:
      "Ferry Building (37.795, -122.393), Dolores Park (37.760, -122.427), Golden Gate Park (37.769, -122.486), Salesforce Tower (37.790, -122.397)",
  },
};

export const DEFAULT_CITY: CitySlug = "toronto";

export function isCitySlug(v: unknown): v is CitySlug {
  return typeof v === "string" && Object.hasOwn(CITIES, v);
}
