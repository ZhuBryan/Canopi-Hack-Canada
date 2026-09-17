import { NextResponse } from "next/server";
import { loadListings } from "@/lib/listings-db";
import { CITIES, DEFAULT_CITY, isCitySlug, type CitySlug } from "@/lib/cities";
import { BUCKET_KEYS } from "@/lib/listing-score";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

interface ChatRequest {
    messages: ChatMessage[];
    city?: CitySlug;
}

// ── Gemini path ──────────────────────────────────────────────────────────────

async function buildSystemPrompt(city: CitySlug): Promise<string> {
    const cfg = CITIES[city];
    const listings = await loadListings(city);
    const summaries = listings
        .map((l) => {
            const counts = BUCKET_KEYS.map((k) => l.nearbyServices?.[k] ?? 0).join(",");
            return `${l.id}|${l.address}|$${l.monthlyRent}|${l.lat.toFixed(3)},${l.lng.toFixed(3)}|${counts}`;
        })
        .join("\n");

    const greeting = `You are Canopi, a warm, perceptive AI assistant for ${cfg.promptBlurb}. You help renters find apartments and understand neighborhoods — but more importantly, you understand *people*.`;

    return `${greeting}

You MUST always respond with a valid JSON object in this exact shape:
{
  "content": "<your natural language reply here>",
  "prefUpdate": { "walkability": 0-100, ... } | null,
  "listingIds": ["rf-123", "rf-456"] | null
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
You are not a form. You are not a chatbot running through a checklist. You are a sharp, emotionally intelligent friend who happens to know ${cfg.label} deeply.

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

HANDLING HUMOR AND ABSURDITY: When someone gives a joke, weird, or unhinged answer — LEAN IN. Match their chaotic energy, riff on what they said, and extract lifestyle signals from it anyway. "DESTROYING HOUSES" → they're high-energy, probably extroverted, buzz-seeker. Acknowledge the bit, laugh about it, then move forward. NEVER sanitize or ignore a funny answer by restating the question as if they didn't say anything. That kills the vibe. Examples:
- "DESTROYING HOUSES" → "Okay demolition crew, noted. I'm reading: high energy, needs a neighborhood that can match the chaos. So when you're NOT leveling structures, what's the vibe — dive bar with friends, or a park where you can decompress?"
- "I eat air" → "Breatharian lifestyle, very niche. That's either a very expensive juice habit or you're the one person who doesn't need to be near food — but I doubt it. What's actually your go-to when you're hungry?"
- "I sleep 20 hours a day" → "Respect. That's a very specific optimization. What fills the other 4?"

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

LISTING DATA — ${listings.length} real ${cfg.label} rentals (format: id|address|price|lat,lng|schools,groceries,restaurants,cafes,parks,pharmacies,transit):
${summaries}

LISTING RECOMMENDATION RULES:
1. When recommending, suggest 2–3 specific listings using real addresses and prices from the data.
2. Frame recommendations as conclusions from the conversation: "Based on what you've told me, here's what I think actually fits you..."
3. For location queries, use lat/lng to find closest listings.
4. ${cfg.label} landmarks: ${cfg.landmarks}.
5. Format listings as: "**[Address]** — $X,XXX/mo"
6. Always populate listingIds with the listing IDs (rf-… or rc-…) of any listings you mention. Set to null if no listings are referenced.
6. After recommending, briefly explain *why* each listing fits their personality — not just their checklist.

---

TONE: Warm, perceptive, unhurried. You're not selling — you're helping someone figure out where they belong.

LANGUAGE: Detect the language of the user's most recent message and respond exclusively in that language — every sentence, question, listing recommendation and reason. If the user switches language mid-conversation, switch with them. Keep addresses and place names as written in the listing data.

Always return valid JSON — no markdown fences, no extra text outside the JSON.`;
}

interface GeminiResult {
    content: string;
    prefUpdate: Record<string, number> | null;
    listingIds: string[] | null;
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
            const ids = parsed?.listingIds;
            return {
                content:
                    typeof parsed?.content === "string" && parsed.content.trim()
                        ? parsed.content
                        : "I'm not sure how to help with that.",
                prefUpdate: normalizePrefUpdate(parsed?.prefUpdate),
                listingIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : null,
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

async function geminiResponse(messages: ChatMessage[], city: CitySlug): Promise<GeminiResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("No Gemini API key");

    const systemPrompt = await buildSystemPrompt(city);

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
                    maxOutputTokens: 8000,
                    temperature: 0.4,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            content: { type: "STRING" },
                            listingIds: {
                                type: "ARRAY",
                                nullable: true,
                                items: { type: "STRING" },
                            },
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
                        required: ["content", "prefUpdate", "listingIds"],
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
        return { content: "That response got cut off. Ask again and I'll keep it shorter.", prefUpdate: null, listingIds: null };
    }

    console.warn("Gemini JSON parse fallback used", { finishReason, preview: raw.slice(0, 160) });
    return { content: "I hit a formatting issue on that response. Please try again.", prefUpdate: null, listingIds: null };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const body: ChatRequest = await request.json();
        const messages: ChatMessage[] = body.messages ?? [];

        if (messages.length === 0) {
            return NextResponse.json({ role: "assistant", content: "Please send a message to get started!" });
        }

        const city: CitySlug = isCitySlug(body.city) ? body.city : DEFAULT_CITY;
        const result = await geminiResponse(messages, city);
        return NextResponse.json({ role: "assistant", content: result.content, prefUpdate: result.prefUpdate, listingIds: result.listingIds });
    } catch (error) {
        console.error("Chat route error:", error);
        return NextResponse.json(
            { role: "assistant", content: "Sorry, something went wrong. Please try again." },
            { status: 500 }
        );
    }
}
