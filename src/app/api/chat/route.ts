import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

interface NearbyBucket {
    count: number;
}

interface RawListing {
    listing_id: string;
    url: string | null;
    title: string | null;
    location: string | null;
    price: string | null;
    photo: string | null;
    lat: number | null;
    lng: number | null;
    nearby?: {
        schools?: NearbyBucket;
        groceries?: NearbyBucket;
        restaurants?: NearbyBucket;
        cafes?: NearbyBucket;
        parks?: NearbyBucket;
        pharmacies?: NearbyBucket;
        transit?: NearbyBucket;
    };
}

// ── Helpers (mirrored from suggestions route) ────────────────────────────────

const BUCKET_KEYS = [
    "schools",
    "groceries",
    "restaurants",
    "cafes",
    "parks",
    "pharmacies",
    "transit",
] as const;

type BucketKey = (typeof BUCKET_KEYS)[number];

const BUCKET_LABELS: Record<BucketKey, string> = {
    schools: "Schools",
    groceries: "Grocery",
    restaurants: "Restaurants",
    cafes: "Cafes",
    parks: "Parks",
    pharmacies: "Pharmacies",
    transit: "Transit",
};

function parsePrice(raw: string | null | undefined): number {
    if (!raw) return 0;
    const digits = raw.replace(/[^0-9]/g, "");
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : 0;
}

function extractAddress(location: string | null | undefined): string {
    if (!location) return "Unknown address";
    const parts = location
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return parts[0] ?? location;
}

function computeIncomeNeeded(monthlyRent: number): number {
    return Math.round(((monthlyRent / 0.3) * 12) / 1000) * 1000;
}

interface Weights {
    schools: number;
    groceries: number;
    restaurants: number;
    cafes: number;
    parks: number;
    pharmacies: number;
    transit: number;
}

function computePersonalScore(nearby: RawListing["nearby"], weights: Weights): number {
    if (!nearby) return 0;
    let weightedSum = 0;
    let totalWeight = 0;
    for (const key of BUCKET_KEYS) {
        const w = weights[key];
        if (w <= 0) continue;
        const count = nearby[key]?.count ?? 0;
        const normalized = Math.min(count, 5) / 5;
        weightedSum += w * normalized;
        totalWeight += w;
    }
    if (totalWeight === 0) return 0;
    return Math.round((weightedSum / totalWeight) * 100);
}

function buildMatchReason(nearby: RawListing["nearby"], weights: Weights): string {
    if (!nearby) return "No nearby data available";
    const scored: { key: BucketKey; contribution: number }[] = [];
    for (const key of BUCKET_KEYS) {
        const w = weights[key];
        const count = nearby[key]?.count ?? 0;
        const normalized = Math.min(count, 5) / 5;
        scored.push({ key, contribution: w * normalized });
    }
    scored.sort((a, b) => b.contribution - a.contribution);
    const top = scored.slice(0, 2).filter((s) => s.contribution > 0);
    if (top.length === 0) return "Limited data for your priorities";
    const labels = top.map((s) => BUCKET_LABELS[s.key].toLowerCase());
    return `Strong ${labels.join(" and ")} access`;
}

// ── Data loading ─────────────────────────────────────────────────────────────

let cachedRaw: RawListing[] | null = null;

async function loadRaw(): Promise<RawListing[]> {
    if (cachedRaw) return cachedRaw;
    const filePath = path.join(process.cwd(), "data", "rentfaster-listings.livable-data.json");
    const raw = await readFile(filePath, "utf8");
    cachedRaw = JSON.parse(raw);
    return cachedRaw!;
}

// ── Keyword-based fallback ───────────────────────────────────────────────────

const KEYWORD_MAP: Record<string, BucketKey> = {
    school: "schools",
    schools: "schools",
    university: "schools",
    college: "schools",
    grocery: "groceries",
    groceries: "groceries",
    supermarket: "groceries",
    restaurant: "restaurants",
    restaurants: "restaurants",
    dining: "restaurants",
    food: "restaurants",
    cafe: "cafes",
    cafes: "cafes",
    coffee: "cafes",
    park: "parks",
    parks: "parks",
    green: "parks",
    nature: "parks",
    pharmacy: "pharmacies",
    pharmacies: "pharmacies",
    drugstore: "pharmacies",
    health: "pharmacies",
    transit: "transit",
    subway: "transit",
    bus: "transit",
    train: "transit",
    commute: "transit",
    transportation: "transit",
};

function parseBudget(text: string): number | null {
    // Match patterns like "under 2000", "below $2,500", "max 1800", "budget 2000",
    // "$2000", "2000/mo"
    const patterns = [
        /(?:under|below|max(?:imum)?|budget|less than|up to)\s*\$?\s*([\d,]+)/i,
        /\$([\d,]+)\s*(?:\/mo|per month|a month)?/i,
        /([\d,]+)\s*(?:\/mo|per month|a month)/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const num = parseInt(match[1].replace(/,/g, ""), 10);
            if (Number.isFinite(num) && num > 0) return num;
        }
    }
    return null;
}

function parseKeywords(text: string): BucketKey[] {
    const lower = text.toLowerCase();
    const found = new Set<BucketKey>();
    for (const [keyword, bucket] of Object.entries(KEYWORD_MAP)) {
        if (lower.includes(keyword)) found.add(bucket);
    }
    return Array.from(found);
}

async function fallbackResponse(lastMessage: string): Promise<string> {
    const budget = parseBudget(lastMessage);
    const priorities = parseKeywords(lastMessage);

    const weights: Weights = {
        schools: 5,
        groceries: 5,
        restaurants: 5,
        cafes: 5,
        parks: 5,
        pharmacies: 5,
        transit: 5,
    };

    // Boost matched priorities
    for (const key of priorities) {
        weights[key] = 9;
    }

    const rawListings = await loadRaw();

    const scored = rawListings
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
        .map((item) => {
            const monthlyRent = parsePrice(item.price);
            const address = extractAddress(item.location);
            const personalScore = computePersonalScore(item.nearby, weights);
            const matchReason = buildMatchReason(item.nearby, weights);
            const incomeNeeded = computeIncomeNeeded(monthlyRent);
            return { address, monthlyRent, personalScore, matchReason, incomeNeeded, location: item.location };
        })
        .filter((l) => (budget ? l.monthlyRent <= budget : true))
        .sort((a, b) => b.personalScore - a.personalScore)
        .slice(0, 3);

    if (scored.length === 0) {
        return "I couldn't find listings matching your criteria. Try adjusting your budget or priorities, or use the Personalize panel for more control.";
    }

    const lines = scored.map(
        (l, i) =>
            `${i + 1}. **${l.address}** — $${l.monthlyRent.toLocaleString()}/mo (Income needed: $${Math.round(l.incomeNeeded / 1000)}K+) — ${l.matchReason}`
    );

    let intro = "Here are my top picks";
    if (budget) intro += ` under $${budget.toLocaleString()}/mo`;
    if (priorities.length > 0)
        intro += ` prioritizing ${priorities.map((k) => BUCKET_LABELS[k].toLowerCase()).join(", ")}`;
    intro += ":\n\n";

    return intro + lines.join("\n") + "\n\nWant me to refine the search? You can also use the **Personalize** panel in the sidebar for full slider control.";
}

// ── Gemini path ──────────────────────────────────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
    const rawListings = await loadRaw();
    const validListings = rawListings.filter(
        (item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)
    );
    const summaries = validListings
        .map((item) => {
            const rent = parsePrice(item.price);
            const addr = extractAddress(item.location);
            const nb = item.nearby ?? {};
            const buckets = BUCKET_KEYS.map((k) => `${k}: ${nb[k]?.count ?? 0}`).join(", ");
            const income = computeIncomeNeeded(rent);
            return `• rf-${item.listing_id}: ${addr} ($${rent}/mo) @ ${item.lat},${item.lng} | ${buckets} | income: $${Math.round(income / 1000)}K+`;
        })
        .join("\n");

    return `You are Canopi, a warm and sharp AI assistant for a Toronto rental platform. You help renters find apartments and understand neighborhoods.

You MUST always respond with a valid JSON object in this exact shape:
{
  "content": "<your natural language reply here>",
  "prefUpdate": { "walkability": 0-100, "nourishment": 0-100, "wellness": 0-100, "greenery": 0-100, "buzz": 0-100, "essentials": 0-100, "safety": 0-100, "transit": 0-100 } | null
}

THE 8 PREFERENCE AXES (each 0–100):
- walkability: ability to do errands/commute on foot
- nourishment: restaurants, cafes, food variety nearby
- wellness: gyms, clinics, pharmacies, health services
- greenery: parks, trails, trees, nature access
- buzz: nightlife, bars, entertainment, social energy
- essentials: groceries, pharmacies, day-to-day needs
- safety: low crime, quiet, family-friendly feel
- transit: subway, bus, streetcar access

PREFERENCE INFERENCE RULES:
Set prefUpdate ONLY when the user is describing their lifestyle, personality, or what they like/need. Set it to null for pure questions (budgets, addresses, "what's near X", etc.).

When you do infer preferences, use these mappings as a guide and blend intelligently:
- Gaming, esports, nightlife, bars, clubbing → buzz:85, transit:75, nourishment:70
- Outdoors, hiking, dog owner, nature lover → greenery:90, walkability:85
- Work from home, introvert, quiet, peaceful → greenery:75, buzz:20, essentials:70, walkability:65
- Student, budget-conscious, broke → transit:88, essentials:78, walkability:72
- Family, kids, schools → safety:90, essentials:82, greenery:75, buzz:20, walkability:70
- Fitness, gym, yoga, cycling, running → wellness:88, walkability:82, greenery:70
- Foodie, restaurants, brunch, coffee, cafes → nourishment:92, buzz:68, walkability:75
- Remote work, coffee shops, coworking → nourishment:78, walkability:80, buzz:62, transit:65
- Healthcare worker, elderly care → wellness:90, transit:80, essentials:78
- Nightlife, party, social butterfly → buzz:90, nourishment:80, transit:78
- Artist, creative, culture → buzz:75, nourishment:70, walkability:72
- Minimalist, zen, introverted → greenery:80, safety:78, buzz:25

You can blend multiple signals (e.g. "I'm a gamer who loves coffee" → merge gaming + foodie axes).
Only include axes you have a clear signal for. For axes you have no signal on, use 50.

LISTING DATA — ${validListings.length} real Toronto rentals:
${summaries}

LISTING RECOMMENDATION RULES:
1. When asked for suggestions, recommend 2-3 specific listings using actual addresses and prices from the data.
2. For location queries, use lat/lng to find closest listings.
3. Toronto landmarks: CN Tower (43.643, -79.387), Union Station (43.645, -79.381), U of T (43.663, -79.396), King & Spadina (43.644, -79.396).
4. Format recommendations as: "**[Address]** — $X,XXX/mo (Income needed: $XXK+)"

Keep replies concise and conversational. Always return valid JSON — no markdown fences, no extra text outside the JSON.`;
}

interface GeminiResult {
    content: string;
    prefUpdate: Record<string, number> | null;
}

async function geminiResponse(messages: ChatMessage[]): Promise<GeminiResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("No Gemini API key");

    const systemPrompt = await buildSystemPrompt();

    const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }));

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: {
                    maxOutputTokens: 600,
                    temperature: 0.7,
                    response_mime_type: "application/json",
                },
            }),
        }
    );

    if (!res.ok) {
        const text = await res.text();
        console.error("Gemini API error:", text);
        throw new Error("Gemini API request failed");
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    try {
        const parsed = JSON.parse(raw);
        return {
            content: parsed.content ?? "I'm not sure how to help with that.",
            prefUpdate: parsed.prefUpdate ?? null,
        };
    } catch {
        return { content: raw, prefUpdate: null };
    }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const messages: ChatMessage[] = body.messages ?? [];

        if (messages.length === 0) {
            return NextResponse.json({ role: "assistant", content: "Please send a message to get started!" });
        }

        const lastUserMessage = messages.filter((m) => m.role === "user").pop()?.content ?? "";

        let content = "";
        let prefUpdate: Record<string, number> | null = null;

        if (process.env.GEMINI_API_KEY) {
            try {
                const result = await geminiResponse(messages);
                content = result.content;
                prefUpdate = result.prefUpdate;
            } catch (err) {
                console.error("Gemini error, using fallback:", err);
                content = await fallbackResponse(lastUserMessage);
            }
        } else {
            content = await fallbackResponse(lastUserMessage);
        }

        return NextResponse.json({ role: "assistant", content, prefUpdate });
    } catch (error) {
        console.error("Chat route error:", error);
        return NextResponse.json(
            { role: "assistant", content: "Sorry, something went wrong. Please try again." },
            { status: 500 }
        );
    }
}
