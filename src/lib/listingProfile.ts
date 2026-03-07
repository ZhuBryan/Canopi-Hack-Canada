export type BuildingType = "house" | "apartment";

export interface BuildingProfile {
  propertyType: BuildingType;
  stories: number;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function extractStoriesFromText(...parts: Array<unknown>): number | null {
  const text = parts
    .map((p) => (typeof p === "string" ? p : ""))
    .join(" ")
    .toLowerCase();

  // Examples: "Stories: 12", "12-storey", "12 story", "12 floors"
  const patterns = [
    /\bstories?\s*[:=-]?\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s*[- ]?storey\b/,
    /\b(\d{1,2})\s*[- ]?story\b/,
    /\b(\d{1,2})\s*floors?\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value > 0) return value;
    }
  }

  return null;
}

export function inferBuildingProfile(input: {
  title?: string;
  location?: string;
  description?: string;
  price?: number | string;
  stories?: number | string;
  propertyType?: string;
}): BuildingProfile {
  const normalizedType = input.propertyType?.toLowerCase();
  const normalizedTitle = input.title?.toLowerCase() ?? "";

  const looksApartment =
    normalizedType === "apartment" ||
    /\b(apartment|apartments|tower|condo|condominium|suite|building)\b/.test(
      normalizedTitle
    );

  const looksHouse =
    normalizedType === "house" ||
    /\b(house|detached|bungalow|townhome|townhouse|duplex)\b/.test(
      normalizedTitle
    );

  const explicitStories =
    toNumber(input.stories) ??
    extractStoriesFromText(input.title, input.description, input.location);

  const parsedPrice = toNumber(input.price);

  let propertyType: BuildingType = "apartment";
  if (looksHouse && !looksApartment) propertyType = "house";
  if (looksApartment && !looksHouse) propertyType = "apartment";
  if (!looksApartment && !looksHouse && parsedPrice !== null && parsedPrice < 1800) {
    propertyType = "house";
  }

  let stories = explicitStories ?? (propertyType === "house" ? 2 : 6);
  stories = Math.max(1, Math.min(60, stories));

  return { propertyType, stories };
}
