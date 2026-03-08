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

    return `You are the Canopi Assistant, a friendly and knowledgeable AI for the Canopi rental platform in Toronto. You help renters find apartments, answer questions about neighborhoods, budgeting, and Toronto life.

You have access to ${validListings.length} REAL rental listings with their exact GPS coordinates. Here are ALL of them:

${summaries}

IMPORTANT RULES:
1. When the user asks about locations, landmarks, neighborhoods, or "places near X", use the lat/lng coordinates to find the CLOSEST listings and recommend them BY NAME with address, price, and income needed.
2. ALWAYS recommend 2-3 specific apartments from the list above when the user asks for suggestions. Use the actual addresses and prices from the data.
3. For geographic queries, Toronto landmarks you should know: Google HQ is near King & Spadina (43.644, -79.396), CN Tower (43.643, -79.387), Union Station (43.645, -79.381), U of T (43.663, -79.396), Eaton Centre (43.654, -79.381).
4. Be conversational and warm. Keep responses concise but always include specific listing recommendations when relevant.
5. When recommending, format like: "**[Address]** — $X,XXX/mo (Income needed: $XXK+)"
6. Suggest using the Personalize panel for detailed slider-based filtering when appropriate.`;
}

async function geminiResponse(messages: ChatMessage[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("No Gemini API key");

    const systemPrompt = await buildSystemPrompt();

    // Convert chat messages to Gemini "contents" format
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
                    maxOutputTokens: 500,
                    temperature: 0.7,
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
    return (
        data.candidates?.[0]?.content?.parts?.[0]?.text ??
        "I'm not sure how to help with that."
    );
}

// ── OpenAI path ──────────────────────────────────────────────────────────────

async function openaiResponse(messages: ChatMessage[]): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("No OpenAI API key");

    const systemPrompt = await buildSystemPrompt();

    const openaiMessages = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: openaiMessages,
            max_tokens: 500,
            temperature: 0.7,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("OpenAI API error:", text);
        throw new Error("OpenAI API request failed");
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "I'm not sure how to help with that.";
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

        let content: string;

        if (process.env.OPENAI_API_KEY) {
            try {
                content = await openaiResponse(messages);
            } catch (err) {
                console.error("OpenAI error, trying Gemini:", err);
                if (process.env.GEMINI_API_KEY) {
                    try {
                        content = await geminiResponse(messages);
                    } catch (err2) {
                        console.error("Gemini also failed:", err2);
                        content = await fallbackResponse(lastUserMessage);
                    }
                } else {
                    content = await fallbackResponse(lastUserMessage);
                }
            }
        } else if (process.env.GEMINI_API_KEY) {
            try {
                content = await geminiResponse(messages);
            } catch (err) {
                console.error("Gemini fallback:", err);
                content = await fallbackResponse(lastUserMessage);
            }
        } else {
            content = await fallbackResponse(lastUserMessage);
        }

        return NextResponse.json({ role: "assistant", content });
    } catch (error) {
        console.error("Chat route error:", error);
        return NextResponse.json(
            { role: "assistant", content: "Sorry, something went wrong. Please try again." },
            { status: 500 }
        );
    }
}
