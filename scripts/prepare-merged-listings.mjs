import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

const mergedFile = path.join(dataDir, "rentfaster-listings.merged.json");
const uniqueFile = path.join(dataDir, "rentfaster-listings.unique.json");
const appReadyFile = path.join(dataDir, "rentfaster-listings.app-ready.json");
const mapReadyFile = path.join(dataDir, "rentfaster-listings.map-ready.json");

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : null;
}

async function main() {
  const merged = JSON.parse(await readFile(mergedFile, "utf8"));

  if (!Array.isArray(merged)) {
    throw new Error("Merged file does not contain a JSON array.");
  }

  const prepared = merged.map((item) => {
    const lat = toNumber(item.lat);
    const lng = toNumber(item.lng);
    const fallbackLocation = [normalizeString(item.address), normalizeString(item.city)]
      .filter(Boolean)
      .join(", ");

    const location = normalizeString(item.location) ?? (fallbackLocation || null);

    return {
      listing_id: String(item.listing_id ?? ""),
      url: normalizeString(item.url),
      title: normalizeString(item.title),
      location,
      address: normalizeString(item.address),
      city: normalizeString(item.city),
      province: normalizeString(item.province),
      community: normalizeString(item.community),
      price: normalizeString(item.price),
      photo: normalizeString(item.photo),
      photo_large: normalizeString(item.photo_large),
      beds: normalizeString(item.beds),
      den: normalizeString(item.den),
      baths: normalizeString(item.baths),
      sqft: normalizeString(item.sqft),
      property_type: normalizeString(item.property_type),
      lat,
      lng,
      geocode_display_name: location,
      geocode_source: "rentfaster_scraper",
      geocode_found: Number.isFinite(lat) && Number.isFinite(lng),
      availability: normalizeString(item.availability),
      lease_term: normalizeString(item.lease_term),
      pets: normalizeString(item.pets),
      smoking: normalizeString(item.smoking),
      utilities_included: Array.isArray(item.utilities_included) ? item.utilities_included : [],
      features: Array.isArray(item.features) ? item.features : [],
      date_listed: normalizeString(item.date_listed),
    };
  }).filter((item) => item.listing_id);

  await mkdir(dataDir, { recursive: true });
  await writeFile(uniqueFile, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");
  await writeFile(appReadyFile, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");
  await writeFile(mapReadyFile, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");

  const geocoded = prepared.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;

  console.log(
    JSON.stringify(
      {
        mergedFile,
        uniqueFile,
        appReadyFile,
        mapReadyFile,
        total: prepared.length,
        geocoded,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
