"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export function useChatHistory() {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [historyId, setHistoryId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Load chat history when user signs in
    useEffect(() => {
        if (!user) {
            setMessages([]);
            setHistoryId(null);
            return;
        }

        setLoading(true);
        supabase
            .from("chat_history")
            .select("*")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .single()
            .then(({ data }) => {
                if (data) {
                    setMessages(data.messages as ChatMessage[]);
                    setHistoryId(data.id);
                }
                setLoading(false);
            });
    }, [user]);

    const saveMessages = useCallback(
        async (msgs: ChatMessage[]) => {
            setMessages(msgs);
            if (!user) return;

            if (historyId) {
                await supabase
                    .from("chat_history")
                    .update({
                        messages: msgs,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", historyId);
            } else {
                const { data } = await supabase
                    .from("chat_history")
                    .insert({
                        user_id: user.id,
                        messages: msgs,
                    })
                    .select("id")
                    .single();
                if (data) setHistoryId(data.id);
            }
        },
        [user, historyId]
    );

    const clearHistory = useCallback(async () => {
        setMessages([]);
        if (!user || !historyId) return;
        await supabase.from("chat_history").delete().eq("id", historyId);
        setHistoryId(null);
    }, [user, historyId]);

    return { messages, saveMessages, clearHistory, loading, isLoggedIn: !!user };
}
