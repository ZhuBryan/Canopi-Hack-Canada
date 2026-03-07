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
const crimeRatesCsvFile = path.join(
  dataDir,
  "Neighbourhood_Crime_Rates_Open_Data_6009069772565146495.csv",
);

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

const normalizeName = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const tokenizeName = (value) =>
  String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && token !== "toronto" && token !== "north");

const parseCsvLine = (line) => {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
};

const parseCrimeRatesCsv = async (filePath) => {
  let fileContents;
  try {
    fileContents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Map();
    }

    throw error;
  }

  const lines = fileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return new Map();
  }

  const headers = parseCsvLine(lines[0]);
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  const rateYearColumns = headers
    .map((header) => {
      const match = header.match(/^([A-Z]+)_RATE_(\d{4})$/);
      if (!match) {
        return null;
      }

      return {
        header,
        category: match[1],
        year: Number(match[2]),
      };
    })
    .filter(Boolean);

  if (rateYearColumns.length === 0) {
    return new Map();
  }

  const latestYear = Math.max(...rateYearColumns.map((column) => column.year));
  const latestRateColumns = rateYearColumns.filter((column) => column.year === latestYear);
  const neighbourhoodIndex = headerIndex.get("NEIGHBOURHOOD_NAME");

  if (!Number.isInteger(neighbourhoodIndex)) {
    return new Map();
  }

  const records = new Map();

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const neighbourhoodName = row[neighbourhoodIndex];
    const normalizedNeighbourhood = normalizeName(neighbourhoodName);

    if (!normalizedNeighbourhood) {
      continue;
    }

    const rates = {};
    let total = 0;
    let counted = 0;

    for (const column of latestRateColumns) {
      const value = Number(row[headerIndex.get(column.header)]);
      if (!Number.isFinite(value)) {
        continue;
      }

      rates[column.category.toLowerCase()] = value;
      total += value;
      counted += 1;
    }

    records.set(normalizedNeighbourhood, {
      neighbourhood_name: neighbourhoodName,
      source_file: path.basename(filePath),
      year: latestYear,
      categories_included: Object.keys(rates).sort(),
      rates_per_100k: rates,
      composite_rate_per_100k: counted > 0 ? Number(total.toFixed(3)) : null,
    });
  }

  return records;
};

const buildCrimeSearchIndex = (crimeRatesByNeighbourhood) =>
  Array.from(crimeRatesByNeighbourhood.values()).map((record) => ({
    record,
    normalized: normalizeName(record.neighbourhood_name),
    tokens: new Set(tokenizeName(record.neighbourhood_name)),
  }));

const findCrimeRecordForListing = (listing, crimeRatesByNeighbourhood, crimeSearchIndex) => {
  const candidateParts = [listing?.geocode_display_name, listing?.location]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );

  if (candidateParts.length === 0) {
    return null;
  }

  for (const part of candidateParts) {
    const key = normalizeName(part);
    if (!key) {
      continue;
    }

    const exact = crimeRatesByNeighbourhood.get(key);
    if (exact) {
      return exact;
    }
  }

  for (const part of candidateParts) {
    const partKey = normalizeName(part);
    if (partKey.length < 5) {
      continue;
    }

    const containsMatches = crimeSearchIndex.filter(
      (entry) => entry.normalized.includes(partKey) || partKey.includes(entry.normalized),
    );

    if (containsMatches.length === 1) {
      return containsMatches[0].record;
    }
  }

  let best = null;
  let bestScore = 0;
  let secondBestScore = 0;

  for (const part of candidateParts) {
    const partTokens = new Set(tokenizeName(part));
    if (partTokens.size === 0) {
      continue;
    }

    for (const entry of crimeSearchIndex) {
      const intersection = Array.from(partTokens).filter((token) => entry.tokens.has(token)).length;
      if (intersection === 0) {
        continue;
      }

      const union = new Set([...partTokens, ...entry.tokens]).size;
      const score = intersection / union;

      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        best = entry.record;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
  }

  if (best && bestScore >= 0.5 && bestScore - secondBestScore >= 0.1) {
    return best;
  }

  return null;
};

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
  const crimeRatesByNeighbourhood = await parseCrimeRatesCsv(crimeRatesCsvFile);
  const crimeSearchIndex = buildCrimeSearchIndex(crimeRatesByNeighbourhood);

  if (!config?.primaryPlaces) {
    throw new Error("The livability source config is missing a primaryPlaces definition.");
  }

  if (!Array.isArray(listings)) {
    throw new Error("The map-ready listing file does not contain a JSON array.");
  }

  const apiKey = process.env[config.primaryPlaces.envVar] ?? null;

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
        if (!apiKey) {
          throw new Error(
            `Missing required environment variable: ${config.primaryPlaces.envVar}. ` +
              "Set it to fetch uncached places data.",
          );
        }

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
      crime: findCrimeRecordForListing(listing, crimeRatesByNeighbourhood, crimeSearchIndex),
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
        crimeNeighbourhoodsLoaded: crimeRatesByNeighbourhood.size,
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
