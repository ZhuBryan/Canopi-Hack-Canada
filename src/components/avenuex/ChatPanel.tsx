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

function extractListingIds(payload: { listingIds?: unknown; content?: unknown }): string[] {
  const fromPayload = Array.isArray(payload.listingIds)
    ? payload.listingIds.filter((id): id is string => typeof id === "string")
    : [];
  const fromContent =
    typeof payload.content === "string"
      ? Array.from(payload.content.matchAll(/\brf-\d+\b/gi)).map((m) => m[0].toLowerCase())
      : [];
  return Array.from(new Set([...fromPayload, ...fromContent]));
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ChatPanel({ onSelectListing }: { onSelectListing?: (id: string) => void }) {
  const { hasProfile, setPrefs, chatOpen, openChat, closeChat } = useSpiderPrefs();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [suggestedListingIds, setSuggestedListingIds] = useState<string[]>([]);
  const [suggestedListingIndex, setSuggestedListingIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [language, setLanguage] = useState<"en" | "fr">("en");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // ── TTS ──────────────────────────────────────────────────────────────────

  const speakText = useCallback(async (text: string) => {
    if (!ttsEnabled) return;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    try {
      setIsSpeaking(true);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { setIsSpeaking(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); currentAudioRef.current = null; };
      audio.onerror = () => { setIsSpeaking(false); currentAudioRef.current = null; };
      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, [ttsEnabled]);

  const stopSpeaking = () => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    setIsSpeaking(false);
  };

  // ── STT ──────────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "recording.webm");
          const res = await fetch("/api/stt", { method: "POST", body: form });
          if (res.ok) {
            const data = await res.json();
            if (data.text) setInput(data.text);
          }
        } catch { /* silent */ }
        finally { setIsTranscribing(false); }
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      if (!chatOpen) openChat();
    } catch {
      console.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  };

  const handleMicClick = () => { if (isRecording) stopRecording(); else startRecording(); };

  // ── Chat ─────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMsg = { id: uid(), role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })), language }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.prefUpdate) {
        setPrefs(data.prefUpdate as SpiderAxes);
        append({ id: uid(), role: "assistant", content: data.content, prefUpdate: data.prefUpdate as SpiderAxes });
      } else {
        append({ id: uid(), role: "assistant", content: data.content });
      }
      speakText(data.content);
      const uniqueIds = extractListingIds(data);
      if (uniqueIds.length > 0) {
        setSuggestedListingIds(uniqueIds);
        setSuggestedListingIndex(0);
        onSelectListing?.(uniqueIds[0]);
      }
    } catch { append({ id: uid(), role: "assistant", content: language === "en" ? "Sorry, something went wrong." : "Désolé, quelque chose s'est mal passé." }); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const canGoPrevSuggestion = suggestedListingIndex > 0;
  const canGoNextSuggestion = suggestedListingIndex < suggestedListingIds.length - 1;

  const goToSuggestion = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= suggestedListingIds.length) return;
    setSuggestedListingIndex(nextIndex);
    onSelectListing?.(suggestedListingIds[nextIndex]);
  };

  return (
    <>
      {/* Message history — transparent overlay directly on map */}
      {chatOpen && (
        <div className="absolute inset-x-0 z-40 flex justify-center px-4 pointer-events-none" style={{ bottom: 76 }}>
          <div
            className="w-full max-w-2xl flex flex-col overflow-hidden"
            style={{
              maxHeight: "20vh",
              maskImage: "linear-gradient(to bottom, transparent 0px, black 56px)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 56px)",
            }}
          >
            {/* Scrollable message list */}
            <div
              ref={scrollRef}
              className="pointer-events-auto overflow-y-auto px-1 pb-3 space-y-2"
              style={{
                scrollbarWidth: "none",
                paddingTop: 56,
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

      {suggestedListingIds.length > 0 && (
        <div className="absolute inset-x-0 z-40 flex justify-center px-4 pb-1 pointer-events-none" style={{ bottom: 76 }}>
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5"
            style={{
              backgroundColor: "rgba(250,248,245,0.96)",
              borderColor: "var(--line)",
              boxShadow: "0 2px 16px rgba(28,25,23,0.10)",
            }}
          >
            <span className="text-[11px] font-bold" style={{ color: "var(--foreground)" }}>
              Suggested homes {suggestedListingIndex + 1}/{suggestedListingIds.length}
            </span>
            <button
              type="button"
              onClick={() => goToSuggestion(suggestedListingIndex - 1)}
              disabled={!canGoPrevSuggestion}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--line)", color: "var(--muted)" }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToSuggestion(suggestedListingIndex + 1)}
              disabled={!canGoNextSuggestion}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--brand-soft)", color: "var(--brand-ink)" }}
            >
              Next
            </button>
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
            {chatOpen && (
              <button
                type="button"
                aria-label={language === "en" ? "Switch to French" : "Switch to English"}
                title={language === "en" ? "French" : "English"}
                onClick={() => setLanguage(p => p === "en" ? "fr" : "en")}
                className="text-xs font-semibold px-2 py-1 rounded-full transition border"
                style={{
                  borderColor: "var(--line)",
                  color: "var(--muted-light)",
                  backgroundColor: language === "en" ? "transparent" : "var(--brand-soft)",
                }}
              >
                {language === "en" ? "EN" : "FR"}
              </button>
            )}
          </div>

          {/* Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => !chatOpen && openChat()}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording ? "Recording… tap mic to stop" :
              isTranscribing ? "Transcribing…" :
              "Ask about listings, neighborhoods, or budget…"
            }
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--foreground)" }}
          />

          {/* TTS toggle — shown when chat is open */}
          {chatOpen && (
            <button
              type="button"
              aria-label={isSpeaking ? "Stop speaking" : ttsEnabled ? "Mute voice" : "Unmute voice"}
              title={isSpeaking ? "Stop speaking" : ttsEnabled ? "Mute voice" : "Unmute voice"}
              onClick={() => { if (isSpeaking) stopSpeaking(); else setTtsEnabled(p => !p); }}
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full transition hover:bg-[var(--line)]"
              style={{ color: isSpeaking ? "var(--brand)" : "var(--muted-light)", opacity: !isSpeaking && !ttsEnabled ? 0.4 : 1 }}
            >
              {isSpeaking ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : ttsEnabled ? (
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                </svg>
              ) : (
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" />
                  <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" />
                </svg>
              )}
            </button>
          )}

          {/* Mic button — shown when input is empty */}
          {!input.trim() && (
            <button
              type="button"
              aria-label={isRecording ? "Stop recording" : isTranscribing ? "Transcribing…" : "Voice input"}
              title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing…" : "Voice input"}
              onClick={handleMicClick}
              disabled={isTranscribing}
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full transition hover:bg-[var(--line)]"
              style={{
                color: isRecording ? "var(--brand)" : "var(--muted-light)",
                backgroundColor: isRecording ? "var(--brand-soft)" : undefined,
              }}
            >
              {isTranscribing ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                  <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="2" width="6" height="11" rx="3" fill={isRecording ? "currentColor" : "none"} />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
                </svg>
              )}
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
