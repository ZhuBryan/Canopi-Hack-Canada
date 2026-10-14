import type { Listing } from "./avenuex-data";
import { BUCKET_KEYS } from "./listing-score.ts";

export const LISTING_LINE_FORMAT = `id|address|price|lat,lng|${BUCKET_KEYS.join(",")}`;

// One pipe-delimited line per listing instead of JSON: no keys, no quotes, no braces.
// prompt-encoding.test.mts asserts the result is shorter than JSON.stringify of the same records.
export function encodeListingsForPrompt(listings: Listing[]): string {
  return listings
    .map((l) => {
      const counts = BUCKET_KEYS.map((k) => l.nearbyServices?.[k] ?? 0).join(",");
      return `${l.id}|${l.address}|$${l.monthlyRent}|${l.lat.toFixed(3)},${l.lng.toFixed(3)}|${counts}`;
    })
    .join("\n");
}
