import { readFile } from "node:fs/promises";
import path from "node:path";

type AmenityBucket = {
  id: string;
  label: string;
  categories: string[];
};

type SourcesConfig = {
  primaryPlaces: {
    provider: string;
    role: string;
    status: string;
    endpoint: string;
    envVar: string;
    reason: string;
    defaultRadiusMeters: number;
    defaultLimit: number;
    amenityBuckets: AmenityBucket[];
  };
  schoolsSource: {
    provider: string;
    role: string;
    status: string;
    reason: string;
    categories: string[];
    fallback: string;
  };
  contextLayers: {
    id: string;
    provider: string;
    role: string;
    status: string;
    coverage: string;
    reason: string;
  }[];
};

type Listing = {
  listing_id: string;
  title: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  geocode_found?: boolean;
};

type EnrichedListing = Listing & {
  nearby?: Record<
    string,
    {
      label: string;
      count: number;
      places: { name: string; distance_meters: number | null }[];
    }
  >;
};

const dataDir = path.join(process.cwd(), "data");

const readJson = async <T,>(fileName: string, fallbackValue: T): Promise<T> => {
  try {
    const fileContents = await readFile(path.join(dataDir, fileName), "utf8");
    return JSON.parse(fileContents) as T;
  } catch {
    return fallbackValue;
  }
};

const formatDistance = (distanceMeters: number | null) => {
  if (!Number.isFinite(distanceMeters)) {
    return "distance unavailable";
  }

  if ((distanceMeters ?? 0) < 1000) {
    return `${distanceMeters} m`;
  }

  return `${((distanceMeters ?? 0) / 1000).toFixed(1)} km`;
};

export default async function Home() {
  const sources = await readJson<SourcesConfig>("livability-sources.json", {
    primaryPlaces: {
      provider: "Not configured",
      role: "",
      status: "",
      endpoint: "",
      envVar: "",
      reason: "",
      defaultRadiusMeters: 0,
      defaultLimit: 0,
      amenityBuckets: [],
    },
    schoolsSource: {
      provider: "Not configured",
      role: "",
      status: "",
      reason: "",
      categories: [],
      fallback: "",
    },
    contextLayers: [],
  });
  const listings = await readJson<Listing[]>("rentfaster-listings.map-ready.json", []);
  const enrichedListings = await readJson<EnrichedListing[]>(
    "rentfaster-listings.livable-data.json",
    [],
  );

  const geocodedCount = listings.filter((listing) => listing.geocode_found).length;
  const sampleListing = enrichedListings[0] ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-12 sm:px-10">
        <section className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4">
            <span className="w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
              Livability data implementation
            </span>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight">
              RentFaster listings now have a selected livability data stack.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-zinc-300">
              The repo is set up around one primary nearby-places provider plus a small set of
              Canada- and Toronto-specific context layers for schools, transit, demographics, and
              optional safety data.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-zinc-400">Listings in map-ready file</p>
              <p className="mt-2 text-3xl font-semibold">{listings.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-zinc-400">Geocoded listings</p>
              <p className="mt-2 text-3xl font-semibold">{geocodedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-zinc-400">Primary provider</p>
              <p className="mt-2 text-xl font-semibold">{sources.primaryPlaces.provider}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-zinc-400">Amenity buckets ready</p>
              <p className="mt-2 text-3xl font-semibold">
                {sources.primaryPlaces.amenityBuckets.length}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-semibold">Primary places source</h2>
            <p className="mt-3 text-zinc-300">{sources.primaryPlaces.reason}</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-sm text-zinc-400">Endpoint</p>
                <p className="mt-2 break-all text-sm text-zinc-200">
                  {sources.primaryPlaces.endpoint}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-sm text-zinc-400">Environment variable</p>
                <p className="mt-2 text-sm text-zinc-200">{sources.primaryPlaces.envVar}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sources.primaryPlaces.amenityBuckets.map((bucket) => (
                <article
                  key={bucket.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <p className="text-base font-medium">{bucket.label}</p>
                  <p className="mt-2 text-sm text-zinc-400">{bucket.categories.join(", ")}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <h2 className="text-2xl font-semibold">School source</h2>
              <p className="mt-3 text-zinc-300">{sources.schoolsSource.reason}</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-5">
                <p className="text-sm text-zinc-400">Selected provider</p>
                <p className="mt-2 text-base font-medium">{sources.schoolsSource.provider}</p>
                <p className="mt-3 text-sm text-zinc-400">
                  {sources.schoolsSource.categories.join(", ")}
                </p>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <h2 className="text-2xl font-semibold">Context layers</h2>
              <div className="mt-4 grid gap-4">
                {sources.contextLayers.map((layer) => (
                  <article
                    key={layer.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{layer.provider}</p>
                        <p className="mt-1 text-sm text-zinc-400">{layer.role}</p>
                      </div>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
                        {layer.coverage}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">{layer.reason}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-semibold">Commands</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono">
                npm run merge:rentfaster
              </p>
              <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono">
                npm run geocode:rentfaster
              </p>
              <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono">
                npm run enrich:places
              </p>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-400">
              The places enrichment command reads `rentfaster-listings.map-ready.json`, uses the
              selected provider config, caches requests in `geoapify-places-cache.json`, and writes
              `rentfaster-listings.livable-data.json`.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-semibold">Sample enrichment output</h2>
            {sampleListing ? (
              <div className="mt-4 grid gap-5">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <p className="text-sm text-zinc-400">Listing</p>
                  <p className="mt-2 text-lg font-medium">
                    {sampleListing.title ?? "Untitled listing"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {sampleListing.location ?? "Unknown location"}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {Object.entries(sampleListing.nearby ?? {}).map(([bucketId, bucket]) => (
                    <article
                      key={bucketId}
                      className="rounded-2xl border border-white/10 bg-black/20 p-5"
                    >
                      <p className="font-medium">{bucket.label}</p>
                      <p className="mt-1 text-sm text-zinc-400">{bucket.count} nearby results</p>
                      <div className="mt-4 space-y-2 text-sm text-zinc-300">
                        {bucket.places.slice(0, 3).map((place) => (
                          <div
                            key={`${bucketId}-${place.name}-${place.distance_meters ?? "na"}`}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                          >
                            <p>{place.name}</p>
                            <p className="text-xs text-zinc-500">
                              {formatDistance(place.distance_meters)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-sm leading-6 text-zinc-300">
                No places enrichment file has been generated yet. Set
                {" "}
                <span className="font-mono">{sources.primaryPlaces.envVar}</span>
                {" "}
                and run
                {" "}
                <span className="font-mono">npm run enrich:places</span>.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
