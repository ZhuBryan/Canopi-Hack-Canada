"use client";

import { useRef, useState, useEffect } from "react";
import { useSpiderPrefs, type SpiderAxes } from "@/lib/spider-prefs-context";
import { SPIDER_CATEGORIES } from "./SpiderChart";

// ── Types ────────────────────────────────────────────────────────────────────

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pills?: string[];
  multiPills?: string[];
  prefUpdate?: SpiderAxes;
};

type OnboardingStep = "greeting" | "priorities" | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function personaLine(persona: string): string {
  if (persona === "I'm a student") return "Students usually need solid transit, affordable essentials, and some buzz nearby. Got it!";
  if (persona === "I'm a young professional") return "Young professionals love walkable, buzzy neighborhoods with great transit and good dining. Perfect.";
  if (persona === "I have a family") return "Families need safety, green spaces, and everyday essentials close by. Makes sense!";
  return "Happy exploring! Let's figure out what matters most to you.";
}

function computeAxes(persona: string, priorities: string[]): SpiderAxes {
  const base: SpiderAxes = { walkability: 50, nourishment: 50, wellness: 50, greenery: 50, buzz: 50, essentials: 50, safety: 50, transit: 50 };
  if (persona === "I'm a student") Object.assign(base, { walkability: 72, transit: 80, essentials: 65, buzz: 60, nourishment: 58 });
  else if (persona === "I'm a young professional") Object.assign(base, { walkability: 78, transit: 80, nourishment: 72, buzz: 68 });
  else if (persona === "I have a family") Object.assign(base, { safety: 88, essentials: 80, greenery: 80, wellness: 74, buzz: 28 });
  const boosts: Record<string, Partial<SpiderAxes>> = {
    "Walkability": { walkability: 90 }, "Green spaces": { greenery: 90 },
    "Nightlife & dining": { nourishment: 85, buzz: 85 }, "Healthcare": { wellness: 86 },
    "Safety": { safety: 90 }, "Transit": { transit: 90 },
  };
  for (const p of priorities) {
    const boost = boosts[p];
    if (!boost) continue;
    for (const [k, v] of Object.entries(boost)) {
      const key = k as keyof SpiderAxes;
      base[key] = Math.max(base[key], v as number);
    }
  }
  return base;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const { hasProfile, setPrefs, chatOpen, openChat, closeChat } = useSpiderPrefs();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(null);
  const [persona, setPersona] = useState("");
  const [pendingPriorities, setPendingPriorities] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatOpen || initialized) return;
    setInitialized(true);
    if (!hasProfile) {
      setOnboardingStep("greeting");
      setMessages([{ id: uid(), role: "assistant", content: "Hey! I'm Canopi. Tell me about your lifestyle and I'll match you with neighborhoods that fit. 🌿", pills: ["I'm a student", "I'm a young professional", "I have a family", "Just exploring"] }]);
    } else {
      setMessages([{ id: uid(), role: "assistant", content: "Welcome back! Ask me about listings, neighborhoods, or budgets." }]);
    }
  }, [chatOpen, hasProfile, initialized]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const append = (msg: ChatMsg) => setMessages(prev => [...prev, msg]);
  const stripPills = () => setMessages(prev => prev.map(m => ({ ...m, pills: undefined, multiPills: undefined })));

  const handlePersonaSelect = (p: string) => {
    setPersona(p); stripPills();
    append({ id: uid(), role: "user", content: p });
    setTimeout(() => {
      append({ id: uid(), role: "assistant", content: `${personaLine(p)}\n\nWhat matters most to you in a neighborhood?`, multiPills: ["Walkability", "Green spaces", "Nightlife & dining", "Healthcare", "Safety", "Transit"] });
      setOnboardingStep("priorities");
    }, 350);
  };

  const handlePriorityToggle = (p: string) =>
    setPendingPriorities(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const handlePrioritiesDone = () => {
    const selected = pendingPriorities.length > 0 ? pendingPriorities : ["Walkability"];
    stripPills();
    append({ id: uid(), role: "user", content: selected.join(", ") });
    setPendingPriorities([]); setOnboardingStep(null);
    const axes = computeAxes(persona, selected);
    setPrefs(axes);
    setTimeout(() => {
      append({ id: uid(), role: "assistant", content: "Here's what I'm setting for you:", prefUpdate: axes });
      setTimeout(() => append({ id: uid(), role: "assistant", content: "Look right? You can always drag the map widget or use listing sliders to tweak.", pills: ["✓ Looks great", "✏ Adjust manually"] }), 600);
    }, 450);
  };

  const handleConfirmPill = (pill: string) => {
    stripPills(); append({ id: uid(), role: "user", content: pill });
    if (pill === "✓ Looks great") {
      setTimeout(() => { append({ id: uid(), role: "assistant", content: "You're all set! Match scores are live now. Happy hunting 🏡" }); setTimeout(() => closeChat(), 1800); }, 350);
    } else {
      setTimeout(() => append({ id: uid(), role: "assistant", content: "No problem! Drag the map widget or open any listing to fine-tune sliders." }), 350);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (onboardingStep) { setOnboardingStep(null); stripPills(); }
    const userMsg: ChatMsg = { id: uid(), role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      append({ id: uid(), role: "assistant", content: data.content });
    } catch { append({ id: uid(), role: "assistant", content: "Sorry, something went wrong." }); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  return (
    <>
      {/* Message history panel — floats above the bar */}
      {chatOpen && (
        <div className="absolute inset-x-0 z-40 flex justify-center px-4 pointer-events-none" style={{ bottom: 76 }}>
          <div
            className="pointer-events-auto w-full max-w-2xl rounded-2xl border overflow-hidden flex flex-col"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line)", boxShadow: "0 -8px 40px rgba(28,25,23,0.12)", maxHeight: 400 }}
          >
            {/* Panel header */}
            <div className="flex flex-shrink-0 items-center justify-between px-4 py-2.5" style={{ backgroundColor: "var(--brand)", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <div className="flex items-center gap-2">
                <span className="text-sm">🌿</span>
                <span className="font-display text-sm font-bold text-white">Canopi</span>
              </div>
              <button type="button" onClick={closeChat} className="text-white/60 hover:text-white transition text-lg leading-none px-1">×</button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id}>
                  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "rounded-br-md" : "border rounded-bl-md"}`}
                      style={{ whiteSpace: "pre-wrap", backgroundColor: msg.role === "user" ? "var(--brand)" : "var(--surface-raised)", borderColor: msg.role === "user" ? undefined : "var(--line)", color: msg.role === "user" ? "white" : "var(--foreground)" }}
                    >
                      {msg.content}
                    </div>
                  </div>

                  {/* Preference update card */}
                  {msg.prefUpdate && (
                    <div className="mt-2 mx-0.5 rounded-xl border p-3 space-y-1.5" style={{ borderLeftWidth: 3, borderLeftColor: "var(--brand)", borderColor: "var(--line)", backgroundColor: "var(--surface)" }}>
                      {SPIDER_CATEGORIES.map(({ key, label, color }) => {
                        const val = msg.prefUpdate![key];
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
                            <span className="text-[11px] font-semibold w-[72px] flex-shrink-0" style={{ color: "var(--foreground)" }}>{label}</span>
                            <span className="text-[11px]" style={{ color: "var(--muted)" }}>→</span>
                            <span className="text-[11px] font-bold font-mono w-5 flex-shrink-0" style={{ color: "var(--foreground)" }}>{val}</span>
                            <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: "var(--line)", minWidth: 24 }}>
                              <div style={{ width: `${val}%`, height: "100%", backgroundColor: color, borderRadius: 99 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Single-select pills */}
                  {msg.pills && (
                    <div className="mt-2 flex flex-wrap gap-1.5 ml-0.5">
                      {msg.pills.map((pill) => (
                        <button key={pill} type="button"
                          onClick={() => onboardingStep === "greeting" ? handlePersonaSelect(pill) : handleConfirmPill(pill)}
                          className="rounded-full border px-3 py-1 text-xs font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                          style={{ borderColor: "var(--line)", color: "var(--foreground)", backgroundColor: "var(--surface-raised)" }}
                        >{pill}</button>
                      ))}
                    </div>
                  )}

                  {/* Multi-select priority pills */}
                  {msg.multiPills && (
                    <div className="mt-2 ml-0.5">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.multiPills.map((pill) => {
                          const active = pendingPriorities.includes(pill);
                          return (
                            <button key={pill} type="button" onClick={() => handlePriorityToggle(pill)}
                              className="rounded-full border px-3 py-1 text-xs font-semibold transition"
                              style={active ? { borderColor: "var(--brand)", backgroundColor: "var(--brand-soft)", color: "var(--brand-ink)" } : { borderColor: "var(--line)", color: "var(--foreground)", backgroundColor: "var(--surface-raised)" }}
                            >{pill}</button>
                          );
                        })}
                      </div>
                      {pendingPriorities.length > 0 && (
                        <button type="button" onClick={handlePrioritiesDone}
                          className="rounded-full px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                          style={{ backgroundColor: "var(--brand)" }}
                        >Done →</button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border px-4 py-3" style={{ borderColor: "var(--line)", backgroundColor: "var(--surface-raised)" }}>
                    {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ backgroundColor: "var(--muted-light)", animationDelay: `${d}ms` }} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persistent bottom chat bar */}
      <div className="absolute bottom-0 inset-x-0 z-40 flex justify-center px-4 pb-3 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl rounded-2xl border flex items-center gap-3 px-4 py-3 transition-all duration-200"
          style={{
            backgroundColor: "rgba(250,248,245,0.97)",
            borderColor: chatOpen ? "var(--brand)" : "var(--line)",
            backdropFilter: "blur(20px)",
            boxShadow: chatOpen ? "0 0 0 1px var(--brand), 0 -4px 32px rgba(28,25,23,0.10)" : "0 -2px 20px rgba(28,25,23,0.07)",
          }}
        >
          {/* Left: logo + status */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-base select-none">🌿</span>
            {!hasProfile && <span className="h-2 w-2 rounded-full bg-red-400" />}
          </div>

          {/* Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => !chatOpen && openChat()}
            onKeyDown={handleKeyDown}
            placeholder={onboardingStep ? "Or type your own response…" : "Ask about listings, neighborhoods, or budget…"}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--foreground)" }}
          />

          {/* Mic button */}
          {!input.trim() && (
            <button
              type="button"
              aria-label="Voice input (coming soon)"
              title="Voice input (coming soon)"
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full transition hover:bg-[var(--line)]"
              style={{ color: "var(--muted-light)" }}
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
              </svg>
            </button>
          )}

          {/* Close button when open + no input */}
          {chatOpen && !input.trim() && (
            <button type="button" onClick={closeChat}
              className="text-[var(--muted-light)] hover:text-[var(--muted)] transition text-xl leading-none flex-shrink-0 px-0.5"
            >×</button>
          )}

          {/* Send button when there's input */}
          {input.trim() && (
            <button type="button" onClick={handleSend} disabled={loading}
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: "var(--brand)" }}
              aria-label="Send"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
