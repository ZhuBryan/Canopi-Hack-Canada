import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const combinedFile = path.join(dataDir, "rentfaster-listings.combined.json");

const CATEGORY_RADIUS_METERS = {
  schools: 500,
  groceries: 1000,
  restaurants: 1000,
  cafes: 1000,
  parks: 1000,
  pharmacies: 1000,
  transit: 1000,
};

const BUCKET_KEYS = Object.keys(CATEGORY_RADIUS_METERS);

const readJson = async (filePath) => {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
};

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupePlaces(places, keyBuilder) {
  const byKey = new Map();

  for (const place of places) {
    const key = keyBuilder(place);
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing || (place.distance_meters ?? Infinity) < (existing.distance_meters ?? Infinity)) {
      byKey.set(key, place);
    }
  }

  return [...byKey.values()].sort(
    (a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity),
  );
}

function normalizeTransitKey(place) {
  let name = normalizeText(place?.name);
  let address = normalizeText(place?.address);
  if (!name && !address) return null;

  if (!name || /^\d+$/.test(name) || /^\d+\s/.test(name)) {
    name = address;
  }

  if (!name || /^\d+$/.test(name)) return null;

  name = name
    .replace(/\bplatforms?\b/g, "")
    .replace(/\bplatform\s*\d+\b/g, "")
    .replace(/\b(east|west|north|south)\s+side\b/g, "")
    .replace(/\b(go\s+)?bus terminal\b/g, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s*\/\s*/g, " at ")
    .replace(/\s+/g, " ")
    .trim();

  return name || null;
}

function looksLikeRealPark(place) {
  const name = normalizeText(place?.name);
  const address = normalizeText(place?.address);

  if (!name) return false;
  if (/^(north york|willowdale|toronto|scarborough|etobicoke|york)$/.test(name)) return false;
  if (/(street|avenue|road|drive|boulevard|lane|court|crescent|way)$/.test(name)) return false;

  return (
    /(park|parkette|garden|ravine|greenspace|playground|square|common|field|trail)/.test(name) ||
    /\bpark\b/.test(address)
  );
}

function looksLikeRealSchool(place) {
  const name = normalizeText(place?.name);
  const address = normalizeText(place?.address);
  const text = `${name} ${address}`;

  if (!name) return false;
  if (/(street|avenue|road|drive|boulevard|lane|court|crescent|way)$/.test(name)) return false;
  if (/bus terminal/.test(address)) return false;

  return /(school|academy|collegiate|institute|école|montessori|secondary|elementary|middle school|prep)/.test(
    text,
  );
}

function looksLikeRealPharmacy(place) {
  const name = normalizeText(place?.name);
  const address = normalizeText(place?.address);
  const combined = `${name} ${address}`;

  if (!name) return false;
  if (/^\d+$/.test(name) || /^\d+\s/.test(name)) return false;
  if (/(street|avenue|road|drive|boulevard|lane|court|crescent|way)$/.test(name)) return false;

  return /(pharmacy|pharmacie|pharmasave|rexall|shoppers drug mart|drug mart|drugstore|drug market|guardian|apothecary|\bi\.?d\.?a\.?\b)/.test(
    combined,
  );
}

function genericPlaceKey(place) {
  const name = normalizeText(place?.name);
  const address = normalizeText(place?.address);

  if (name || address) {
    return `${name}|${address}`;
  }

  return place?.place_id ?? null;
}

function cleanPlaces(bucket, category) {
  if (!bucket || !Array.isArray(bucket.places)) {
    return [];
  }

  const radius = CATEGORY_RADIUS_METERS[category];
  const placesWithinRadius = bucket.places.filter((place) => {
    if (!Number.isFinite(place?.distance_meters)) return false;
    return (place.distance_meters ?? Infinity) <= radius;
  });

  if (category === "transit") {
    const filtered = placesWithinRadius.filter((place) => Boolean(normalizeTransitKey(place)));
    return dedupePlaces(filtered, normalizeTransitKey);
  }

  if (category === "parks") {
    const filtered = placesWithinRadius.filter(looksLikeRealPark);
    return dedupePlaces(filtered, (place) => normalizeText(place?.name));
  }

  if (category === "schools") {
    const filtered = placesWithinRadius.filter(looksLikeRealSchool);
    return dedupePlaces(
      filtered,
      (place) => normalizeText(place?.address) || normalizeText(place?.name),
    );
  }

  if (category === "pharmacies") {
    const filtered = placesWithinRadius.filter(looksLikeRealPharmacy);
    return dedupePlaces(
      filtered,
      (place) => normalizeText(place?.address) || normalizeText(place?.name),
    );
  }

  return dedupePlaces(
    placesWithinRadius,
    genericPlaceKey,
  );
}

async function main() {
  const listings = await readJson(combinedFile);

  if (!Array.isArray(listings)) {
    throw new Error("Expected the combined file to contain a JSON array.");
  }

  const bucketStats = Object.fromEntries(
    BUCKET_KEYS.map((key) => [
      key,
      {
        listingsTouched: 0,
        placesBefore: 0,
        placesAfter: 0,
      },
    ]),
  );

  let changedListings = 0;

  const cleanedListings = listings.map((listing) => {
    if (!listing?.nearby || typeof listing.nearby !== "object") {
      return listing;
    }

    let listingChanged = false;
    const nearby = { ...listing.nearby };

    for (const key of BUCKET_KEYS) {
      const bucket = listing.nearby[key];
      if (!bucket) continue;

      const originalPlaces = Array.isArray(bucket.places) ? bucket.places : [];
      const cleanedPlaces = cleanPlaces(bucket, key);
      const cleanedCount = cleanedPlaces.length;
      const cleanedRadius = CATEGORY_RADIUS_METERS[key];

      bucketStats[key].listingsTouched += 1;
      bucketStats[key].placesBefore += originalPlaces.length;
      bucketStats[key].placesAfter += cleanedPlaces.length;

      const bucketChanged =
        cleanedCount !== (bucket.count ?? 0) ||
        cleanedRadius !== bucket.radius_meters ||
        cleanedPlaces.length !== originalPlaces.length;

      if (bucketChanged) {
        listingChanged = true;
      }

      nearby[key] = {
        ...bucket,
        radius_meters: cleanedRadius,
        count: cleanedCount,
        places: cleanedPlaces,
      };
    }

    if (listingChanged) {
      changedListings += 1;
      return {
        ...listing,
        nearby,
      };
    }

    return listing;
  });

  await writeFile(combinedFile, `${JSON.stringify(cleanedListings, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        combinedFile,
        listings: cleanedListings.length,
        changedListings,
        bucketStats,
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
