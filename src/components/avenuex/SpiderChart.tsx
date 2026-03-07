"use client";

import { useState } from "react";
import { useSpiderPrefs, type SpiderAxes } from "@/lib/spider-prefs-context";

export const SPIDER_CATEGORIES = [
  { key: "walkability" as const, label: "Walkability", color: "#6366F1" },
  { key: "nourishment" as const, label: "Nourishment", color: "#F97316" },
  { key: "wellness" as const, label: "Wellness", color: "#EC4899" },
  { key: "greenery" as const, label: "Greenery", color: "#22C55E" },
  { key: "buzz" as const, label: "Buzz", color: "#EAB308" },
  { key: "essentials" as const, label: "Essentials", color: "#64748B" },
  { key: "safety" as const, label: "Safety", color: "#8B5CF6" },
  { key: "transit" as const, label: "Transit", color: "#3B82F6" },
];

const RINGS = [25, 50, 75, 100];

function polarToXY(angleDeg: number, radius: number, cx: number, cy: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function buildPoly(values: SpiderAxes, maxR: number, cx: number, cy: number) {
  const step = 360 / SPIDER_CATEGORIES.length;
  return SPIDER_CATEGORIES.map(({ key }, i) => {
    const r = ((values[key] ?? 0) / 100) * maxR;
    const { x, y } = polarToXY(i * step, r, cx, cy);
    return `${x},${y}`;
  }).join(" ");
}

function computeMatch(user: SpiderAxes, listing: SpiderAxes) {
  let dot = 0, mU = 0, mL = 0;
  for (const { key } of SPIDER_CATEGORIES) {
    const u = user[key] ?? 0, l = listing[key] ?? 0;
    dot += u * l; mU += u * u; mL += l * l;
  }
  if (!mU || !mL) return 0;
  return Math.round((dot / (Math.sqrt(mU) * Math.sqrt(mL))) * 100);
}

interface Props {
  listingAxes: SpiderAxes;
}

export default function SpiderChart({ listingAxes }: Props) {
  const { prefs, hasProfile, openChat, openWidget } = useSpiderPrefs();
  const [hovered, setHovered] = useState<string | null>(null);

  const size = 260;
  const cx = size / 2, cy = size / 2, maxR = 92;
  const step = 360 / SPIDER_CATEGORIES.length;

  const matchScore = computeMatch(prefs, listingAxes);
  const dotColor = matchScore >= 80 ? "var(--brand)" : matchScore >= 50 ? "#F59E0B" : "#EF4444";

  if (!hasProfile) {
    return (
      <div className="rounded-2xl border p-5 text-center" style={{ borderColor: "var(--line)", backgroundColor: "var(--surface)" }}>
        <div className="flex justify-center mb-3">
          <svg width={140} height={140} viewBox="0 0 140 140" style={{ opacity: 0.18 }}>
            {RINGS.map((ring) => {
              const r = (ring / 100) * 50;
              const pts = SPIDER_CATEGORIES.map((_, i) => {
                const { x, y } = polarToXY(i * (360 / 8), r, 70, 70);
                return `${x},${y}`;
              }).join(" ");
              return <polygon key={ring} points={pts} fill="none" stroke="var(--muted)" strokeWidth={0.8} />;
            })}
            {SPIDER_CATEGORIES.map((_, i) => {
              const { x, y } = polarToXY(i * (360 / 8), 50, 70, 70);
              return <line key={i} x1={70} y1={70} x2={x} y2={y} stroke="var(--muted)" strokeWidth={0.6} />;
            })}
          </svg>
        </div>
        <p className="text-sm mb-1 font-semibold" style={{ color: "var(--foreground)" }}>No preferences set yet</p>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Chat with Canopi to personalize your match scores
        </p>
        <button
          type="button"
          onClick={openChat}
          className="rounded-full px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}
        >
          💬 Start Chat
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Score header */}
      <div className="flex items-center justify-between mb-0.5">
        <span className="label-overline">Your Match</span>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
          <span className="text-xl font-bold leading-none" style={{ color: "var(--foreground)" }}>{matchScore}</span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>/ 100</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
          {/* Rings */}
          {RINGS.map((ring) => {
            const r = (ring / 100) * maxR;
            const pts = SPIDER_CATEGORIES.map((_, i) => {
              const { x, y } = polarToXY(i * step, r, cx, cy);
              return `${x},${y}`;
            }).join(" ");
            return (
              <polygon key={ring} points={pts} fill="none"
                stroke="var(--line)"
                strokeWidth={ring === 100 ? 1.5 : 0.8}
                strokeDasharray={ring === 100 ? undefined : "3,3"} />
            );
          })}

          {/* Axis lines */}
          {SPIDER_CATEGORIES.map((_, i) => {
            const { x, y } = polarToXY(i * step, maxR, cx, cy);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth={0.8} />;
          })}

          {/* Listing polygon (green) */}
          <polygon
            points={buildPoly(listingAxes, maxR, cx, cy)}
            fill="rgba(22,101,52,0.10)"
            stroke="var(--brand)"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ transition: "all 0.5s cubic-bezier(0.4,0,0.2,1)" }}
          />

          {/* User prefs polygon (indigo dashed) */}
          <polygon
            points={buildPoly(prefs, maxR, cx, cy)}
            fill="rgba(99,102,241,0.07)"
            stroke="#6366F1"
            strokeWidth={2}
            strokeDasharray="6,4"
            strokeLinejoin="round"
            style={{ transition: "all 0.5s cubic-bezier(0.4,0,0.2,1)" }}
          />

          {/* Listing data points */}
          {SPIDER_CATEGORIES.map(({ key }, i) => {
            const r = ((listingAxes[key] ?? 0) / 100) * maxR;
            const { x, y } = polarToXY(i * step, r, cx, cy);
            return (
              <circle key={`l-${key}`} cx={x} cy={y}
                r={hovered === key ? 5 : 3.5}
                fill="var(--brand)" stroke="white" strokeWidth={2}
                style={{ transition: "r 0.15s ease", cursor: "default" }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)} />
            );
          })}

          {/* User pref data points */}
          {SPIDER_CATEGORIES.map(({ key }, i) => {
            const r = ((prefs[key] ?? 0) / 100) * maxR;
            const { x, y } = polarToXY(i * step, r, cx, cy);
            return (
              <circle key={`u-${key}`} cx={x} cy={y}
                r={hovered === key ? 5 : 3.5}
                fill="#6366F1" stroke="white" strokeWidth={2}
                style={{ transition: "r 0.15s ease", cursor: "default" }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)} />
            );
          })}

          {/* Axis labels */}
          {SPIDER_CATEGORIES.map(({ key, label }, i) => {
            const { x, y } = polarToXY(i * step, maxR + 22, cx, cy);
            const active = hovered === key;
            return (
              <text key={key} x={x} y={y}
                textAnchor="middle" dominantBaseline="central"
                style={{
                  fontSize: active ? 12 : 10,
                  fontWeight: active ? 700 : 500,
                  fill: active ? "var(--foreground)" : "var(--muted-light)",
                  fontFamily: "var(--font-dm-sans), system-ui",
                  transition: "all 0.15s ease",
                  cursor: "default",
                }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
              >
                {label}
              </text>
            );
          })}

          {/* Hover tooltip */}
          {hovered && (() => {
            const i = SPIDER_CATEGORIES.findIndex(c => c.key === hovered);
            const { x, y } = polarToXY(i * step, maxR * 0.45, cx, cy);
            return (
              <g>
                <rect x={x - 52} y={y - 30} width={104} height={56} rx={10} fill="#1c1917" opacity={0.93} />
                <text x={x} y={y - 13} textAnchor="middle"
                  style={{ fontSize: 10, fill: "#818cf8", fontWeight: 600, fontFamily: "system-ui" }}>
                  You: {prefs[hovered as keyof SpiderAxes]}
                </text>
                <text x={x} y={y + 6} textAnchor="middle"
                  style={{ fontSize: 10, fill: "#4ade80", fontWeight: 600, fontFamily: "system-ui" }}>
                  Listing: {listingAxes[hovered as keyof SpiderAxes]}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 -mt-2 mb-3">
        <div className="flex items-center gap-1.5">
          <div style={{ width: 20, height: 2.5, borderRadius: 2, backgroundImage: "repeating-linear-gradient(90deg,#6366F1 0,#6366F1 4px,transparent 4px,transparent 7px)" }} />
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>Your Preferences</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 20, height: 2.5, borderRadius: 2, backgroundColor: "var(--brand)" }} />
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>This Listing</span>
        </div>
      </div>

      {/* Open preferences widget */}
      <button
        type="button"
        onClick={openWidget}
        className="w-full rounded-xl border px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition hover:border-[var(--brand)]"
        style={{ borderColor: "var(--line)", color: "var(--muted)", backgroundColor: "var(--surface-raised)" }}
      >
        <span>⚙</span>
        Adjust Preferences
      </button>
    </div>
  );
}
