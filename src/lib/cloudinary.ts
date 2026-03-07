/**
 * Avenue-X: Cloudinary Logo Pipeline
 *
 * Takes a business name + category and returns a Cloudinary-transformed
 * URL suitable for use as a 3D billboard texture.
 *
 * For hackathon demo: uses placeholder category icons from Cloudinary's
 * demo cloud. Replace CLOUD_NAME with your own for production.
 */

const CLOUD_NAME = "demo"; // Replace with your Cloudinary cloud name

// Category-to-emoji mapping for fallback placeholder icons
const CATEGORY_ICONS: Record<string, string> = {
  cafe: "☕",
  restaurant: "🍽️",
  pharmacy: "💊",
  hospital: "🏥",
  park: "🌳",
  grocery: "🛒",
  gym: "💪",
  clinic: "⚕️",
  default: "📍",
};

// Category-to-color mapping for billboard accent colors
export const CATEGORY_COLORS: Record<string, string> = {
  cafe: "#D4A574",
  restaurant: "#FF6B6B",
  pharmacy: "#FF1493", // Vivirion Pink
  hospital: "#FF1493", // Vivirion Pink
  park: "#7ED47E",
  grocery: "#FFD93D",
  gym: "#9B8FFF",
  clinic: "#FF1493", // Vivirion Pink
  transit: "#00D4FF",
  default: "#00D4FF",
};

/**
 * Generate a Cloudinary URL for a business logo texture.
 *
 * @param businessName - The name of the business (e.g. "Seven Shores Cafe")
 * @param category - The OSM amenity category (e.g. "cafe", "pharmacy")
 * @param isSponsored - Whether the business is sponsored (changes border to gold)
 * @returns A URL string for use as a 3D texture
 */
export function getBusinessTexture(
  businessName: string,
  category: string,
  isSponsored: boolean = false
): string {
  const safeCategory = category.toLowerCase();
  const isVivirion = ["pharmacy", "hospital", "clinic", "healthcare"].includes(
    safeCategory
  );

  // Decide border/accent color
  let color = "00D4FF"; // Cyan for regular
  if (isVivirion) {
    color = "FF1493"; // Pink for Vivirion
  } else if (isSponsored) {
    color = "FFD700"; // Gold for Sponsored
  }

  // Build a Cloudinary text-overlay URL that creates a dynamic "logo card"
  const icon = CATEGORY_ICONS[safeCategory] || CATEGORY_ICONS.default;

  // Truncate business name for the texture
  const shortName = businessName.length > 18
    ? businessName.substring(0, 16) + "..."
    : businessName;

  // Cloudinary text overlay URL
  // Creates a solid color circular card with text overlay and neon border
  const encodedName = encodeURIComponent(shortName);
  const encodedIcon = encodeURIComponent(icon);

  const url = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/` +
    `w_256,h_256,c_fill,b_rgb:1a1a2e,r_max,bo_8px_solid_rgb:${color}/` +
    `l_text:Arial_48_bold:${encodedIcon},co_rgb:${color},g_center,y_-30/` +
    `l_text:Arial_18_bold:${encodedName},co_rgb:ffffff,g_center,y_40/` +
    `sample.png`;

  return url;
}

/**
 * Get the accent color for a business category.
 */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS.default;
}

/**
 * Calculate a Vitality Score from a list of nearby amenities.
 *
 * @param amenities - Array of amenity objects with type and distance
 * @returns A score from 0–100
 */
export function calculateVitalityScore(
  amenities: Array<{ type: string; distance: number }>
): number {
  const WEIGHTS: Record<string, number> = {
    pharmacy: 25,
    hospital: 30,
    grocery: 20,
    cafe: 10,
    restaurant: 5,
    park: 15,
    gym: 8,
    clinic: 25,
  };

  let score = 0;
  for (const amenity of amenities) {
    const weight = WEIGHTS[amenity.type.toLowerCase()] || 5;
    // Closer amenities contribute more (linear decay over 500m)
    const proximityBonus = Math.max(0, 1 - amenity.distance / 500);
    score += weight * proximityBonus;
  }

  return Math.min(100, Math.round(score));
}
