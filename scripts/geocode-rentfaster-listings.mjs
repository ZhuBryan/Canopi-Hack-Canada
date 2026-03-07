import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const inputFile = path.join(dataDir, "rentfaster-listings.app-ready.json");
const outputFile = path.join(dataDir, "rentfaster-listings.map-ready.json");
const cacheFile = path.join(dataDir, "rentfaster-geocode-cache.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = async (filePath, fallbackValue = null) => {
  try {
    const fileContents = await readFile(filePath, "utf8");
    return JSON.parse(fileContents);
  } catch (error) {
    if (error.code === "ENOENT" && fallbackValue !== null) {
      return fallbackValue;
    }

    throw error;
  }
};

const normalizeLocation = (location) =>
  String(location ?? "")
    .replace(/\s+/g, " ")
    .trim();

const geocodeLocation = async (location) => {
  const query = encodeURIComponent(`${location}, Ontario, Canada`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&limit=1&addressdetails=1`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "hackcanada-rentfaster-geocoder/1.0 (educational-project)",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed for "${location}" with status ${response.status}`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    return {
      lat: null,
      lng: null,
      geocode_display_name: null,
      geocode_source: "nominatim",
      geocode_found: false,
    };
  }

  const match = results[0];
  return {
    lat: Number(match.lat),
    lng: Number(match.lon),
    geocode_display_name: match.display_name ?? null,
    geocode_source: "nominatim",
    geocode_found: true,
  };
};

const main = async () => {
  const listings = await readJson(inputFile);
  if (!Array.isArray(listings)) {
    throw new Error("The app-ready listing file does not contain a JSON array.");
  }

  const cache = await readJson(cacheFile, {});
  const uniqueLocations = [...new Set(listings.map((listing) => normalizeLocation(listing.location)).filter(Boolean))];

  let geocodedNow = 0;
  let cacheHits = 0;

  for (const [index, location] of uniqueLocations.entries()) {
    if (cache[location]) {
      cacheHits += 1;
      continue;
    }

    console.log(`Geocoding ${index + 1}/${uniqueLocations.length}: ${location}`);
    cache[location] = await geocodeLocation(location);
    geocodedNow += 1;

    await mkdir(dataDir, { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await sleep(1100);
  }

  const mapReadyListings = listings.map((listing) => {
    const location = normalizeLocation(listing.location);
    const geocode = cache[location] ?? {
      lat: null,
      lng: null,
      geocode_display_name: null,
      geocode_source: "nominatim",
      geocode_found: false,
    };

    return {
      ...listing,
      ...geocode,
    };
  });

  const resolvedCount = mapReadyListings.filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng)).length;
  const unresolvedCount = mapReadyListings.length - resolvedCount;

  await mkdir(dataDir, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(mapReadyListings, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        inputFile,
        outputFile,
        cacheFile,
        listings: listings.length,
        uniqueLocations: uniqueLocations.length,
        cacheHits,
        geocodedNow,
        resolvedCount,
        unresolvedCount,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
