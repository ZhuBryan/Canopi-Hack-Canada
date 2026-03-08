"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import AuthModal from "./AuthModal";

export default function UserMenu() {
    const { user, loading, signOut } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const [authOpen, setAuthOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    if (loading) {
        return (
            <div className="w-8 h-8 rounded-full animate-pulse" style={{ backgroundColor: "var(--line)" }} />
        );
    }

    // Not logged in → show Sign In button
    if (!user) {
        return (
            <>
                <button
                    onClick={() => setAuthOpen(true)}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition hover:opacity-90"
                    style={{ backgroundColor: "var(--brand)" }}
                >
                    Sign In
                </button>
                <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
            </>
        );
    }

    // Logged in → avatar + dropdown
    const initial = user.email?.charAt(0).toUpperCase() ?? "U";

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-full text-white font-semibold text-sm flex items-center justify-center transition hover:opacity-90 ring-2 ring-[var(--brand-soft)]"
                style={{ backgroundColor: "var(--brand)" }}
            >
                {initial}
            </button>

            {menuOpen && (
                <div className="absolute right-0 top-12 w-64 rounded-2xl overflow-hidden z-50 fade-pop" style={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--line)", boxShadow: "0 8px 32px rgba(28,25,23,0.12)" }}>
                    {/* User info */}
                    <div className="px-4 py-3 border-b" style={{ borderColor: "var(--line)" }}>
                        <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                            {user.email}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted-light)" }}>Canopi member</div>
                    </div>

                    {/* Menu items */}
                    <div className="py-1">
                        <button className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition hover:opacity-80" style={{ color: "var(--foreground)" }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M8 1l2.35 4.76L15.5 6.5l-3.75 3.66.89 5.16L8 12.88l-4.64 2.44.89-5.16L.5 6.5l5.15-.74L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                            </svg>
                            Saved Listings
                        </button>
                        <button className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition hover:opacity-80" style={{ color: "var(--foreground)" }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M6 2.5a4 4 0 00-4 4v3l-1 2h10l-1-2v-3a4 4 0 00-4-4zM4.5 12a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(2,0)" />
                            </svg>
                            My Preferences
                        </button>
                    </div>

                    {/* Sign out */}
                    <div className="border-t py-1" style={{ borderColor: "var(--line)" }}>
                        <button
                            onClick={async () => {
                                await signOut();
                                setMenuOpen(false);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path
                                    d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            Sign Out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
