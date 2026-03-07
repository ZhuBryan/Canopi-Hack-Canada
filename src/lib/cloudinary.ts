/**
 * Avenue-X: Cloudinary Logo Pipeline
 */

const CLOUD_NAME = "demo"; // Replace with your Cloudinary cloud name

const CATEGORY_ICONS: Record<string, string> = {
  cafe: "C",
  restaurant: "R",
  pharmacy: "P",
  hospital: "H",
  park: "P",
  grocery: "G",
  gym: "GYM",
  clinic: "CL",
  default: "B",
};

export const CATEGORY_COLORS: Record<string, string> = {
  cafe: "#D4A574",
  restaurant: "#FF6B6B",
  pharmacy: "#FF1493",
  hospital: "#FF1493",
  park: "#7ED47E",
  grocery: "#FFD93D",
  gym: "#9B8FFF",
  clinic: "#FF1493",
  transit: "#00D4FF",
  default: "#00D4FF",
};

export function getBusinessTexture(
  businessName: string,
  category: string,
  isSponsored: boolean = false
): string {
  const safeCategory = category.toLowerCase();
  const isVivirion = ["pharmacy", "hospital", "clinic", "healthcare"].includes(
    safeCategory
  );

  let color = "00D4FF"; // Cyan
  if (isVivirion) color = "FF1493"; // Pink
  else if (isSponsored) color = "FFD700"; // Gold

  const icon = CATEGORY_ICONS[safeCategory] || CATEGORY_ICONS.default;
  const shortName = businessName.length > 18
    ? businessName.substring(0, 16) + "..."
    : businessName;
  const safeName = shortName.replace(/[^\w\s.-]/g, "").trim() || "Business";

  const encodedName = encodeURIComponent(safeName);
  const encodedIcon = encodeURIComponent(icon);

  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/` +
    `w_256,h_256,c_fill,b_rgb:1a1a2e,r_max,bo_8px_solid_rgb:${color}/` +
    `l_text:Arial_48_bold:${encodedIcon},co_rgb:${color},g_center,y_-30/` +
    `l_text:Arial_18_bold:${encodedName},co_rgb:ffffff,g_center,y_40/` +
    `sample.png`;
}

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS.default;
}

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
    const proximityBonus = Math.max(0, 1 - amenity.distance / 500);
    score += weight * proximityBonus;
  }

  return Math.min(100, Math.round(score));
}
