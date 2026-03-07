import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

const livableFile = path.join(dataDir, "rentfaster-listings.livable-data.json");
const mergedFile = path.join(dataDir, "rentfaster-listings.merged.json");
const outputFile = path.join(dataDir, "rentfaster-listings.detailed.json");

function toInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  if (/studio/i.test(value)) return 0;
  const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toFloat(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function buildBedsLabel(bedsRaw) {
  if (typeof bedsRaw !== "string") return null;
  const trimmed = bedsRaw.trim();
  if (!trimmed) return null;
  if (/studio/i.test(trimmed)) return "Studio";
  return `${trimmed} bd`;
}

function buildBathsLabel(bathsValue) {
  if (bathsValue == null) return null;
  return `${bathsValue} ba`;
}

function normalizeAmenities(merged) {
  const amenities = new Set();

  if (merged.pets === "pets_ok") amenities.add("Pet-friendly");
  if (merged.pets === "cats_ok") amenities.add("Cats OK");
  if (merged.pets === "dogs_ok") amenities.add("Dogs OK");
  if (merged.pets === "no_pets") amenities.add("No pets");

  for (const utility of Array.isArray(merged.utilities_included) ? merged.utilities_included : []) {
    amenities.add(`Utilities: ${utility}`);
  }

  for (const feature of Array.isArray(merged.features) ? merged.features : []) {
    amenities.add(String(feature).trim());
  }

  return [...amenities].filter(Boolean);
}

async function main() {
  const livable = JSON.parse(await readFile(livableFile, "utf8"));
  const merged = JSON.parse(await readFile(mergedFile, "utf8"));

  const mergedById = new Map(
    merged.map((item) => [String(item.listing_id), item]),
  );

  const detailed = livable.map((listing) => {
    const source = mergedById.get(String(listing.listing_id));
    if (!source) {
      return {
        ...listing,
        details: null,
      };
    }

    const beds = toInt(source.beds);
    const baths = toFloat(source.baths);
    const sqft = toInt(source.sqft);
    const buildingAmenities = normalizeAmenities(source);

    return {
      ...listing,
      details: {
        bedsMin: beds,
        bedsMax: beds,
        bedsLabel: buildBedsLabel(source.beds),
        bathsMin: baths,
        bathsMax: baths,
        bathsLabel: buildBathsLabel(baths),
        sqft,
        pets: source.pets ?? null,
        availability: source.availability ?? null,
        leaseTerm: source.lease_term ?? null,
        propertyType: source.property_type ?? null,
        utilitiesIncluded: Array.isArray(source.utilities_included) ? source.utilities_included : [],
        features: Array.isArray(source.features) ? source.features : [],
        buildingAmenities,
      },
    };
  });

  await writeFile(outputFile, `${JSON.stringify(detailed, null, 2)}\n`, "utf8");

  const withDetails = detailed.filter((item) => item.details).length;

  console.log(
    JSON.stringify(
      {
        livableFile,
        mergedFile,
        outputFile,
        livable: livable.length,
        merged: merged.length,
        withDetails,
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
