"use client";

import { useRef, useState, useEffect } from "react";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export default function ChatPanel() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: "assistant", content: "Hi! I'm your Canopi Assistant. Ask me about listings, budget, or neighborhoods." },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg: ChatMessage = { role: "user", content: text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: newMessages }),
            });

            if (!res.ok) throw new Error("Chat request failed");
            const data = await res.json();
            setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Sorry, something went wrong. Please try again." },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* Floating button */}
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="fixed bottom-6 right-16 z-50 grid h-14 w-14 place-items-center rounded-full bg-green-500 text-white shadow-lg transition hover:bg-green-600 hover:scale-105 active:scale-95"
                    aria-label="Open chat"
                >
                    {/* Chat bubble icon */}
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </button>
            )}

            {/* Chat panel */}
            {open && (
                <div
                    className="fixed bottom-6 right-16 z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl glass-panel fade-pop"
                    style={{ width: 380, height: 500 }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-200 bg-green-500 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-sm font-bold text-white">
                                C
                            </span>
                            <span className="font-display text-sm font-bold text-white">Canopi Assistant</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="grid h-7 w-7 place-items-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
                            aria-label="Close chat"
                        >
                            ×
                        </button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "user"
                                        ? "bg-green-500 text-white rounded-br-md"
                                        : "bg-white border border-gray-200 text-slate-700 rounded-bl-md"
                                        }`}
                                    style={{ whiteSpace: "pre-wrap" }}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3">
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="border-t border-gray-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about listings..."
                                className="flex-1 rounded-xl border border-gray-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-green-400 focus:ring-1 focus:ring-green-400"
                            />
                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={!input.trim() || loading}
                                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-green-500 text-white transition hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed"
                                aria-label="Send message"
                            >
                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
