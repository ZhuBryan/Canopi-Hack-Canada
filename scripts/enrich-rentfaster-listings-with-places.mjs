import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

const sourceConfigFile = path.join(dataDir, "livability-sources.json");
const listingsFile = path.join(dataDir, "rentfaster-listings.map-ready.json");
const cacheFile = path.join(dataDir, "geoapify-places-cache.json");
const outputFile = path.join(dataDir, "rentfaster-listings.livable-data.json");

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildCacheKey = ({ lat, lng, categories, radiusMeters, limit }) =>
  `${lat}|${lng}|${categories.join(",")}|${radiusMeters}|${limit}`;

const normalizePlace = (feature) => ({
  name:
    feature?.properties?.name ??
    feature?.properties?.address_line1 ??
    feature?.properties?.formatted ??
    "Unnamed place",
  address: feature?.properties?.formatted ?? null,
  distance_meters: feature?.properties?.distance ?? null,
  categories: feature?.properties?.categories ?? [],
  place_id: feature?.properties?.place_id ?? null,
});

const fetchPlaces = async ({
  apiKey,
  lat,
  lng,
  categories,
  radiusMeters,
  limit,
}) => {
  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set("categories", categories.join(","));
  url.searchParams.set("filter", `circle:${lng},${lat},${radiusMeters}`);
  url.searchParams.set("bias", `proximity:${lng},${lat}`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Geoapify request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.features) ? payload.features.map(normalizePlace) : [];
};

const main = async () => {
  const config = await readJson(sourceConfigFile);
  const listings = await readJson(listingsFile);
  const cache = await readJson(cacheFile, {});

  if (!config?.primaryPlaces) {
    throw new Error("The livability source config is missing a primaryPlaces definition.");
  }

  if (!Array.isArray(listings)) {
    throw new Error("The map-ready listing file does not contain a JSON array.");
  }

  const apiKey = process.env[config.primaryPlaces.envVar];
  if (!apiKey) {
    throw new Error(`Missing required environment variable: ${config.primaryPlaces.envVar}`);
  }

  const amenityBuckets = Array.isArray(config.primaryPlaces.amenityBuckets)
    ? config.primaryPlaces.amenityBuckets
    : [];
  const radiusMeters = Number(config.primaryPlaces.defaultRadiusMeters ?? 1500);
  const limit = Number(config.primaryPlaces.defaultLimit ?? 5);

  let fetchedNow = 0;
  let cacheHits = 0;

  const enrichedListings = [];

  for (const listing of listings) {
    if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) {
      enrichedListings.push({
        ...listing,
        livability_sources: {
          primary_places: config.primaryPlaces.provider,
          schools: config.schoolsSource?.provider ?? null,
          context_layers: (config.contextLayers ?? []).map((layer) => layer.provider),
        },
        nearby: {},
      });
      continue;
    }

    const nearby = {};

    for (const bucket of amenityBuckets) {
      const categories = Array.isArray(bucket.categories) ? bucket.categories : [];
      const cacheKey = buildCacheKey({
        lat: listing.lat,
        lng: listing.lng,
        categories,
        radiusMeters,
        limit,
      });

      let places = cache[cacheKey];
      if (places) {
        cacheHits += 1;
      } else {
        places = await fetchPlaces({
          apiKey,
          lat: listing.lat,
          lng: listing.lng,
          categories,
          radiusMeters,
          limit,
        });
        cache[cacheKey] = places;
        fetchedNow += 1;
        await mkdir(dataDir, { recursive: true });
        await writeFile(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
        await sleep(250);
      }

      nearby[bucket.id] = {
        label: bucket.label,
        source: config.primaryPlaces.provider,
        radius_meters: radiusMeters,
        count: places.length,
        places,
      };
    }

    enrichedListings.push({
      ...listing,
      livability_sources: {
        primary_places: config.primaryPlaces.provider,
        schools: config.schoolsSource?.provider ?? null,
        context_layers: (config.contextLayers ?? []).map((layer) => layer.provider),
      },
      nearby,
    });
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(enrichedListings, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sourceConfigFile,
        listingsFile,
        outputFile,
        listings: listings.length,
        amenityBuckets: amenityBuckets.length,
        fetchedNow,
        cacheHits,
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
