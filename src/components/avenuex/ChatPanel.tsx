"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useSpiderPrefs, type SpiderAxes } from "@/lib/spider-prefs-context";

// ── Types ────────────────────────────────────────────────────────────────────

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  prefUpdate?: SpiderAxes;
};

function TypewriterText({
  text,
  enabled,
  onProgress,
}: {
  text: string;
  enabled: boolean;
  onProgress?: () => void;
}) {
  const [shown, setShown] = useState(enabled ? "" : text);

  useEffect(() => {
    if (!enabled) {
      setShown(text);
      onProgress?.();
      return;
    }

    if (typeof window !== "undefined") {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) {
        setShown(text);
        onProgress?.();
        return;
      }
    }

    const chars = Array.from(text);
    if (chars.length === 0) {
      setShown("");
      onProgress?.();
      return;
    }

    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const step = () => {
      const chunk = Math.max(1, Math.ceil(chars.length / 36));
      i = Math.min(chars.length, i + chunk);
      setShown(chars.slice(0, i).join(""));
      onProgress?.();
      if (i < chars.length) {
        timer = setTimeout(step, 18);
      }
    };

    step();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [enabled, text, onProgress]);

  return <>{shown}</>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Component ────────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const { hasProfile, setPrefs, chatOpen, openChat, closeChat } = useSpiderPrefs();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    });
  }, []);

  useEffect(() => {
    if (!chatOpen || initialized) return;
    setInitialized(true);
    const greeting = hasProfile
      ? "Welcome back! Ask me about listings, neighborhoods, or budgets."
      : "Hey! I'm Canopi. Tell me a bit about your lifestyle and I'll find neighborhoods that fit.";
    setMessages([{ id: uid(), role: "assistant", content: greeting }]);
  }, [chatOpen, hasProfile, initialized]);

  useEffect(() => {
    if (!chatOpen) return;
    scrollToBottom();
  }, [messages, loading, chatOpen, scrollToBottom]);

  const append = (msg: ChatMsg) => setMessages(prev => [...prev, msg]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMsg = { id: uid(), role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.prefUpdate) {
        setPrefs(data.prefUpdate as SpiderAxes);
        append({ id: uid(), role: "assistant", content: data.content, prefUpdate: data.prefUpdate as SpiderAxes });
      } else {
        append({ id: uid(), role: "assistant", content: data.content });
      }
    } catch { append({ id: uid(), role: "assistant", content: "Sorry, something went wrong." }); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  return (
    <>
      {/* Message history — transparent overlay directly on map */}
      {chatOpen && (
        <div className="absolute inset-x-0 z-40 flex justify-center px-4 pointer-events-none" style={{ bottom: 76 }}>
          <div
            className="w-full max-w-2xl flex flex-col"
            style={{ maxHeight: "20vh" }}
          >
            {/* Fade-out gradient mask at top */}
            <div
              ref={scrollRef}
              className="pointer-events-auto overflow-y-auto px-1 pb-3 space-y-2"
              style={{
                maskImage: "linear-gradient(to bottom, transparent 0px, black 48px)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 48px)",
                scrollbarWidth: "none",
                paddingTop: 48,
              }}
            >
              {messages.map((msg, idx) => (
                <div key={msg.id}>
                  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`chat-bubble-enter max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"}`}
                      style={{ animationDelay: `${Math.min(280, idx * 35)}ms`, whiteSpace: "pre-wrap", backdropFilter: "blur(12px)", backgroundColor: msg.role === "user" ? "var(--brand)" : "rgba(250,248,245,0.82)", border: msg.role === "user" ? undefined : "1px solid rgba(231,227,222,0.6)", color: msg.role === "user" ? "white" : "var(--foreground)" }}
                    >
                      <span className={msg.role === "assistant" ? "chat-text-reveal" : undefined}>
                        <TypewriterText
                          text={msg.content}
                          enabled={msg.role === "assistant"}
                          onProgress={msg.role === "assistant" ? scrollToBottom : undefined}
                        />
                      </span>
                    </div>
                  </div>

                  {/* Preference updated indicator */}
                  {msg.prefUpdate && (
                    <div className="chat-bubble-enter mt-1.5 mx-0.5 flex items-center gap-1.5" style={{ animationDelay: `${Math.min(280, idx * 35 + 70)}ms` }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--brand)", flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-[11px] font-semibold" style={{ color: "var(--brand)" }}>Refined search.</span>
                    </div>
                  )}

                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="chat-bubble-enter flex items-center gap-1.5 rounded-2xl rounded-bl-md px-4 py-3" style={{ animationDelay: "40ms", backgroundColor: "rgba(250,248,245,0.75)", backdropFilter: "blur(8px)" }}>
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
            placeholder="Ask about listings, neighborhoods, or budget…"
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
