import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const outputDir = path.join(repoRoot, "data");
const outputFile = path.join(outputDir, "rentfaster-listings.unique.json");
const excludedListingIds = new Set(["578041"]);

const isSnapshotFile = (fileName) =>
  /^rentfaster-listings-\d+\.json$/i.test(fileName) || fileName === "rentals.json";

const readListings = async (filePath) => {
  const fileContents = await readFile(filePath, "utf8");
  const parsed = JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} does not contain a JSON array.`);
  }

  return parsed;
};

const chooseBetterValue = (currentValue, incomingValue, key) => {
  if (incomingValue === undefined || incomingValue === null || incomingValue === "") {
    return currentValue;
  }

  if (currentValue === undefined || currentValue === null || currentValue === "") {
    return incomingValue;
  }

  if (key === "url" && currentValue === null && incomingValue) {
    return incomingValue;
  }

  if (typeof currentValue === "string" && typeof incomingValue === "string") {
    return incomingValue.length > currentValue.length ? incomingValue : currentValue;
  }

  return currentValue;
};

const mergeListing = (currentListing, incomingListing) => {
  const merged = { ...currentListing };

  for (const [key, value] of Object.entries(incomingListing)) {
    merged[key] = chooseBetterValue(merged[key], value, key);
  }

  return merged;
};

const main = async () => {
  const workspaceFiles = await readdir(workspaceRoot);
  const sourceFiles = workspaceFiles
    .filter(isSnapshotFile)
    .sort((a, b) => {
      if (a === "rentals.json") return 1;
      if (b === "rentals.json") return -1;
      return a.localeCompare(b);
    });

  if (sourceFiles.length === 0) {
    throw new Error("No RentFaster JSON files were found in the workspace root.");
  }

  const listingsById = new Map();

  for (const fileName of sourceFiles) {
    const filePath = path.join(workspaceRoot, fileName);
    const listings = await readListings(filePath);

    for (const listing of listings) {
      const listingId = String(listing.listing_id ?? "").trim();

      if (!listingId || excludedListingIds.has(listingId)) {
        continue;
      }

      const normalizedListing = {
        listing_id: listingId,
        url: listing.url ?? null,
        title: listing.title ?? null,
        location: listing.location ?? null,
        price: listing.price ?? null,
        photo: listing.photo ?? null,
      };

      const existingListing = listingsById.get(listingId);
      listingsById.set(
        listingId,
        existingListing ? mergeListing(existingListing, normalizedListing) : normalizedListing,
      );
    }
  }

  const mergedListings = [...listingsById.values()].sort((a, b) =>
    a.listing_id.localeCompare(b.listing_id, undefined, { numeric: true }),
  );

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(mergedListings, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        outputFile,
        sourceFiles,
        uniqueListings: mergedListings.length,
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
