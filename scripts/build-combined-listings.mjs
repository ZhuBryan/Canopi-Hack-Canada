import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

const currentFile = path.join(dataDir, "rentfaster-listings.detailed.json");
const oldBackupFile = path.join(
  dataDir,
  "backups",
  "old-126-listing-source",
  "rentfaster-listings.detailed.json",
);
const outputFile = path.join(dataDir, "rentfaster-listings.combined.json");

const readJson = async (filePath) => {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
};

const normalizeAddressKey = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

async function main() {
  const current = await readJson(currentFile);
  const old = await readJson(oldBackupFile);

  if (!Array.isArray(current) || !Array.isArray(old)) {
    throw new Error("Expected both source files to contain JSON arrays.");
  }

  const currentKeys = new Set(
    current.map((item) => normalizeAddressKey(item.address ?? item.location)),
  );

  const oldUnique = old.filter(
    (item) => !currentKeys.has(normalizeAddressKey(item.address ?? item.location)),
  );

  const combined = [...current, ...oldUnique];

  await writeFile(outputFile, `${JSON.stringify(combined, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        currentFile,
        oldBackupFile,
        outputFile,
        current: current.length,
        old: old.length,
        oldUnique: oldUnique.length,
        combined: combined.length,
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
