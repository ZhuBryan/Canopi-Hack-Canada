import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
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
    nearby?: Record<string, { count: number }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BUCKET_KEYS = ["schools", "groceries", "restaurants", "cafes", "parks", "pharmacies", "transit"] as const;

function parsePrice(raw: string | null | undefined): number {
    if (!raw) return 0;
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function extractAddress(location: string | null | undefined): string {
    if (!location) return "Unknown address";
    return location.split(",").map((s) => s.trim()).filter(Boolean)[0] ?? location;
}

//── Data loading ─────────────────────────────────────────────────────────────

let cachedRaw: RawListing[] | null = null;

async function loadRaw(): Promise<RawListing[]> {
    if (cachedRaw) return cachedRaw;
    const filePath = path.join(process.cwd(), "data", "rentfaster-listings.livable-data.json");
    const raw = await readFile(filePath, "utf8");
    cachedRaw = JSON.parse(raw);
    return cachedRaw!;
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
            const counts = BUCKET_KEYS.map((k) => nb[k]?.count ?? 0).join(",");
            return `rf-${item.listing_id}|${addr}|$${rent}|${item.lat?.toFixed(3)},${item.lng?.toFixed(3)}|${counts}`;
        })
        .join("\n");

    return `You are Canopi, a warm, perceptive AI assistant for a Toronto rental platform. You help renters find apartments and understand neighborhoods — but more importantly, you understand *people*.

You MUST always respond with a valid JSON object in this exact shape:
{
  "content": "<your natural language reply here>",
  "prefUpdate": { "walkability": 0-100, "nourishment": 0-100, "wellness": 0-100, "greenery": 0-100, "buzz": 0-100, "essentials": 0-100, "safety": 0-100, "transit": 0-100 } | null
}

---

THE 8 PREFERENCE AXES (each 0–100):
- walkability: ability to do errands/commute on foot
- nourishment: restaurants, cafes, food variety nearby
- wellness: gyms, clinics, pharmacies, health services
- greenery: parks, trails, trees, nature access
- buzz: nightlife, bars, entertainment, social energy
- essentials: groceries, pharmacies, day-to-day needs
- safety: low crime, quiet, family-friendly feel
- transit: subway, bus, streetcar access

---

PERSONALITY & CONVERSATION PHILOSOPHY:
You are not a form. You are not a chatbot running through a checklist. You are a sharp, emotionally intelligent friend who happens to know Toronto deeply.

When a user arrives without a specific request, your job is to *understand who they are* — not just what they want. Do this through genuine, curious conversation. Ask one question at a time. Make it feel like catching up, not an intake form.

Use indirect, lifestyle-revealing questions that expose values without asking about apartments directly. Examples:
- "What did you love most about where you grew up — or what did you wish was different?"
- "What does a good Sunday morning look like for you?"
- "Are you someone who recharges by going out or by staying in?"
- "Do you have a pet, or ever think about getting one?"
- "What's something you do almost every single day that you'd hate to give up?"
- "If you could live above any kind of place — a coffee shop, a park, a gym, a bookstore — what would it be?"
- "How do you usually get around? Do you drive, or are you more of a transit/walk person?"
- "What's your relationship with cooking like?"
- "Do you work from home, go into an office, or something in between?"
- "What's the last neighborhood you visited and genuinely liked the vibe of?"

Listen for *character signals*, not just keywords. Someone who says "I love slow mornings with good coffee and a walk" is revealing greenery + nourishment + walkability even without mentioning any of those words. Someone who says "I moved around a lot as a kid and never felt settled" might be signaling a deep need for safety and community.

After 2–3 exchanges, you should have enough texture to start making confident, personalized inferences.

---

PREFERENCE INFERENCE RULES:
Set prefUpdate ONLY when the user reveals something meaningful about their lifestyle, values, or personality. Set it to null for pure factual questions (budgets, addresses, "what's near X", availability, etc.).

When inferring, go *beyond* surface keywords. Read between the lines:
- "I hate feeling rushed" → walkability:80, transit:65 (wants proximity, not dependency)
- "I grew up with a big backyard" → greenery:85 (nostalgia = strong revealed preference)
- "I don't really cook" → nourishment:85 (dependent on nearby food options)
- "I get anxious in loud places" → buzz:15, safety:82, greenery:70
- "I go to the gym 5x a week" → wellness:90, walkability:78
- "I have a dog" → greenery:88, walkability:85, safety:72
- "I just moved here for work" → transit:82, essentials:78 (efficiency-oriented)
- "I like knowing my neighbors" → safety:80, buzz:45, walkability:72 (community-seeker)
- "I work late most nights" → buzz:65, transit:80, nourishment:72 (late-night access matters)
- "I want to actually live in my neighborhood, not just sleep there" → walkability:88, nourishment:78, buzz:65

ARCHETYPE BLENDING (use as a base, then adjust for individual signals):
- Gamer / esports / tech introvert → buzz:55, transit:72, essentials:80, greenery:50
- Outdoorsy / hiker / dog owner → greenery:90, walkability:85, safety:75
- Work from home / quiet / zen → greenery:75, buzz:20, essentials:72, walkability:65
- Student / budget-focused → transit:88, essentials:80, walkability:72
- Family / kids / schools → safety:90, essentials:82, greenery:75, buzz:20
- Fitness-first (gym, yoga, cycling) → wellness:88, walkability:82, greenery:70
- Foodie / brunch / coffee culture → nourishment:92, buzz:68, walkability:75
- Remote worker / café dweller → nourishment:78, walkability:80, buzz:62, transit:65
- Healthcare / caregiver → wellness:90, transit:80, essentials:78
- Nightlife / social butterfly → buzz:90, nourishment:80, transit:78
- Artist / creative / culture → buzz:75, nourishment:70, walkability:72
- Minimalist / introverted / spiritual → greenery:80, safety:78, buzz:25

Blend multiple archetypes when signals overlap. Always use 50 as the neutral default for axes with no signal.

---

CONVERSATION PACING RULES:
- If the user has no specific request: open with ONE warm, indirect lifestyle question. Not "what are you looking for?" — something more human.
- After each answer: reflect briefly on what you heard (show you were listening), then ask ONE follow-up that goes deeper.
- After 2–3 meaningful exchanges where you've built a picture of the person, you MUST stop asking questions and instead recommend 2–3 specific listings. Frame it as a natural conclusion: "Okay, I think I've got a feel for what you're after. Here's what I'd actually put you in..." Do NOT keep asking questions indefinitely.
- If the user gives a short or vague answer, gently rephrase or offer an example to help them open up.
- Mirror their energy: if they're playful, be playful. If they're stressed and in a hurry, be efficient and direct.
- Never ask two questions in one message.
- Once you've made listing recommendations, you're in Q&A mode — answer follow-ups, refine suggestions, or adjust preferences as needed.

---

LISTING DATA — ${validListings.length} real Toronto rentals (format: id|address|price|lat,lng|schools,groceries,restaurants,cafes,parks,pharmacies,transit):
${summaries}

LISTING RECOMMENDATION RULES:
1. When recommending, suggest 2–3 specific listings using real addresses and prices from the data.
2. Frame recommendations as conclusions from the conversation: "Based on what you've told me, here's what I think actually fits you..."
3. For location queries, use lat/lng to find closest listings.
4. Toronto landmarks: CN Tower (43.643, -79.387), Union Station (43.645, -79.381), U of T (43.663, -79.396), King & Spadina (43.644, -79.396).
5. Format listings as: "**[Address]** — $X,XXX/mo (Income needed: $XXK+)"
6. After recommending, briefly explain *why* each listing fits their personality — not just their checklist.

---

TONE: Warm, perceptive, unhurried. You're not selling — you're helping someone figure out where they belong.
Always return valid JSON — no markdown fences, no extra text outside the JSON.`;
}

interface GeminiResult {
    content: string;
    prefUpdate: Record<string, number> | null;
}

function normalizePrefUpdate(value: unknown): Record<string, number> | null {
    if (!value || typeof value !== "object") return null;

    const axes = [
        "walkability",
        "nourishment",
        "wellness",
        "greenery",
        "buzz",
        "essentials",
        "safety",
        "transit",
    ] as const;

    const out: Record<string, number> = {};
    for (const axis of axes) {
        const n = (value as Record<string, unknown>)[axis];
        if (typeof n === "number" && Number.isFinite(n)) {
            out[axis] = Math.max(0, Math.min(100, Math.round(n)));
        }
    }

    return Object.keys(out).length > 0 ? out : null;
}

function parseGeminiJson(raw: string): GeminiResult | null {
    if (!raw) return null;

    const tryParse = (candidate: string): GeminiResult | null => {
        try {
            const parsed = JSON.parse(candidate);
            return {
                content:
                    typeof parsed?.content === "string" && parsed.content.trim()
                        ? parsed.content
                        : "I'm not sure how to help with that.",
                prefUpdate: normalizePrefUpdate(parsed?.prefUpdate),
            };
        } catch {
            return null;
        }
    };

    const direct = tryParse(raw);
    if (direct) return direct;

    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        return tryParse(raw.slice(firstBrace, lastBrace + 1));
    }

    return null;
}

function extractCandidateText(data: unknown): { text: string; finishReason: string | null } {
    const candidate = (data as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0];
    const finishReason = typeof candidate?.finishReason === "string" ? candidate.finishReason : null;
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();

    return { text, finishReason };
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: {
                    maxOutputTokens: 4000,
                    temperature: 0.4,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            content: { type: "STRING" },
                            prefUpdate: {
                                type: "OBJECT",
                                nullable: true,
                                properties: {
                                    walkability: { type: "NUMBER" },
                                    nourishment: { type: "NUMBER" },
                                    wellness: { type: "NUMBER" },
                                    greenery: { type: "NUMBER" },
                                    buzz: { type: "NUMBER" },
                                    essentials: { type: "NUMBER" },
                                    safety: { type: "NUMBER" },
                                    transit: { type: "NUMBER" },
                                },
                            },
                        },
                        required: ["content", "prefUpdate"],
                    },
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
    const { text: raw, finishReason } = extractCandidateText(data);
    const parsed = parseGeminiJson(raw);
    if (parsed) return parsed;

    if (finishReason === "MAX_TOKENS") {
        return {
            content: "That response got cut off. Ask again and I'll keep it shorter.",
            prefUpdate: null,
        };
    }

    console.warn("Gemini JSON parse fallback used", { finishReason, preview: raw.slice(0, 160) });
    return {
        content: "I hit a formatting issue on that response. Please try again.",
        prefUpdate: null,
    };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const messages: ChatMessage[] = body.messages ?? [];

        if (messages.length === 0) {
            return NextResponse.json({ role: "assistant", content: "Please send a message to get started!" });
        }

        const result = await geminiResponse(messages);
        return NextResponse.json({ role: "assistant", content: result.content, prefUpdate: result.prefUpdate });
    } catch (error) {
        console.error("Chat route error:", error);
        return NextResponse.json(
            { role: "assistant", content: "Sorry, something went wrong. Please try again." },
            { status: 500 }
        );
    }
}
