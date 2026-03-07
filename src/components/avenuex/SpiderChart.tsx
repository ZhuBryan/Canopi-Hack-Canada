import { useState, useMemo } from "react";

const CATEGORIES = [
  { key: "walkability", label: "Walkability", color: "#6366F1" },
  { key: "nourishment", label: "Nourishment", color: "#F97316" },
  { key: "wellness", label: "Wellness", color: "#EC4899" },
  { key: "greenery", label: "Greenery", color: "#22C55E" },
  { key: "buzz", label: "Buzz", color: "#EAB308" },
  { key: "essentials", label: "Essentials", color: "#64748B" },
  { key: "safety", label: "Safety", color: "#8B5CF6" },
  { key: "transit", label: "Transit", color: "#3B82F6" },
];

const RINGS = [25, 50, 75, 100];

function polarToXY(angleDeg, radius, cx, cy) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function buildPolygonPoints(values, keys, maxRadius, cx, cy) {
  const step = 360 / keys.length;
  return keys
    .map((key, i) => {
      const val = values[key] ?? 0;
      const r = (val / 100) * maxRadius;
      const { x, y } = polarToXY(i * step, r, cx, cy);
      return `${x},${y}`;
    })
    .join(" ");
}

// ── sample data ──
const SAMPLE_USER = {
  walkability: 85,
  nourishment: 70,
  wellness: 40,
  greenery: 90,
  buzz: 20,
  essentials: 60,
  safety: 75,
  transit: 55,
};

const SAMPLE_LISTING = {
  walkability: 72,
  nourishment: 88,
  wellness: 65,
  greenery: 80,
  buzz: 45,
  essentials: 70,
  safety: 60,
  transit: 78,
};

function computeMatch(user, listing) {
  let dotProduct = 0;
  let magU = 0;
  let magL = 0;
  CATEGORIES.forEach(({ key }) => {
    const u = user[key] ?? 0;
    const l = listing[key] ?? 0;
    dotProduct += u * l;
    magU += u * u;
    magL += l * l;
  });
  if (magU === 0 || magL === 0) return 0;
  const cosine = dotProduct / (Math.sqrt(magU) * Math.sqrt(magL));
  return Math.round(cosine * 100);
}

export default function SpiderChart() {
  const [userPrefs, setUserPrefs] = useState(SAMPLE_USER);
  const [listingData] = useState(SAMPLE_LISTING);
  const [hovered, setHovered] = useState(null);
  const [showSliders, setShowSliders] = useState(false);

  const matchScore = useMemo(
    () => computeMatch(userPrefs, listingData),
    [userPrefs, listingData]
  );

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 120;
  const keys = CATEGORIES.map((c) => c.key);
  const step = 360 / keys.length;

  const userPoly = buildPolygonPoints(userPrefs, keys, maxR, cx, cy);
  const listingPoly = buildPolygonPoints(listingData, keys, maxR, cx, cy);

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
        background: "#FAFAF8",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 2px 20px rgba(0,0,0,0.07)",
          width: 380,
          overflow: "hidden",
        }}
      >
        {/* ── header ── */}
        <div
          style={{
            padding: "20px 24px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#9CA3AF",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 2,
              }}
            >
              Your Match
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>
              450 Markham Street
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background:
                  matchScore >= 80
                    ? "#22C55E"
                    : matchScore >= 50
                    ? "#F59E0B"
                    : "#EF4444",
              }}
            />
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#1A1A1A",
                lineHeight: 1,
              }}
            >
              {matchScore}
            </span>
            <span style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 500 }}>
              / 100
            </span>
          </div>
        </div>

        {/* ── spider chart SVG ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "8px 0 0",
          }}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ overflow: "visible" }}
          >
            {/* ring grid */}
            {RINGS.map((ring) => {
              const r = (ring / 100) * maxR;
              const pts = keys
                .map((_, i) => {
                  const { x, y } = polarToXY(i * step, r, cx, cy);
                  return `${x},${y}`;
                })
                .join(" ");
              return (
                <polygon
                  key={ring}
                  points={pts}
                  fill="none"
                  stroke="#E5E7EB"
                  strokeWidth={ring === 100 ? 1.5 : 0.8}
                  strokeDasharray={ring === 100 ? "none" : "3,3"}
                />
              );
            })}

            {/* axis lines */}
            {keys.map((_, i) => {
              const { x, y } = polarToXY(i * step, maxR, cx, cy);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeWidth={0.8}
                />
              );
            })}

            {/* listing fill (green) */}
            <polygon
              points={listingPoly}
              fill="rgba(34, 197, 94, 0.12)"
              stroke="#22C55E"
              strokeWidth={2}
              strokeLinejoin="round"
              style={{
                transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />

            {/* user preference outline (dashed) */}
            <polygon
              points={userPoly}
              fill="rgba(99, 102, 241, 0.06)"
              stroke="#6366F1"
              strokeWidth={2}
              strokeDasharray="6,4"
              strokeLinejoin="round"
              style={{
                transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />

            {/* listing data points */}
            {keys.map((key, i) => {
              const val = listingData[key] ?? 0;
              const r = (val / 100) * maxR;
              const { x, y } = polarToXY(i * step, r, cx, cy);
              return (
                <circle
                  key={`lp-${key}`}
                  cx={x}
                  cy={y}
                  r={hovered === key ? 5 : 3.5}
                  fill="#22C55E"
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ transition: "r 0.2s ease" }}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}

            {/* user pref data points */}
            {keys.map((key, i) => {
              const val = userPrefs[key] ?? 0;
              const r = (val / 100) * maxR;
              const { x, y } = polarToXY(i * step, r, cx, cy);
              return (
                <circle
                  key={`up-${key}`}
                  cx={x}
                  cy={y}
                  r={hovered === key ? 5 : 3.5}
                  fill="#6366F1"
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ transition: "r 0.2s ease" }}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}

            {/* axis labels */}
            {CATEGORIES.map((cat, i) => {
              const labelR = maxR + 24;
              const { x, y } = polarToXY(i * step, labelR, cx, cy);
              const isActive = hovered === cat.key;
              return (
                <g key={cat.key}>
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontSize: isActive ? 12 : 11,
                      fontWeight: isActive ? 700 : 500,
                      fill: isActive ? "#1A1A1A" : "#9CA3AF",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: "all 0.2s ease",
                      cursor: "default",
                    }}
                    onMouseEnter={() => setHovered(cat.key)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {cat.label}
                  </text>
                </g>
              );
            })}

            {/* hover tooltip */}
            {hovered && (() => {
              const i = keys.indexOf(hovered);
              const uVal = userPrefs[hovered];
              const lVal = listingData[hovered];
              const { x, y } = polarToXY(i * step, maxR * 0.45, cx, cy);
              return (
                <g>
                  <rect
                    x={x - 52}
                    y={y - 28}
                    width={104}
                    height={52}
                    rx={10}
                    fill="#1A1A1A"
                    opacity={0.92}
                  />
                  <text
                    x={x}
                    y={y - 12}
                    textAnchor="middle"
                    style={{
                      fontSize: 10,
                      fill: "#6366F1",
                      fontWeight: 600,
                      fontFamily: "'DM Sans', system-ui",
                    }}
                  >
                    You: {uVal}
                  </text>
                  <text
                    x={x}
                    y={y + 6}
                    textAnchor="middle"
                    style={{
                      fontSize: 10,
                      fill: "#22C55E",
                      fontWeight: 600,
                      fontFamily: "'DM Sans', system-ui",
                    }}
                  >
                    Listing: {lVal}
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>

        {/* ── legend ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            padding: "4px 0 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 20,
                height: 3,
                background: "#6366F1",
                borderRadius: 2,
                backgroundImage:
                  "repeating-linear-gradient(90deg, #6366F1 0, #6366F1 4px, transparent 4px, transparent 7px)",
              }}
            />
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>
              Your Preferences
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 20,
                height: 3,
                background: "#22C55E",
                borderRadius: 2,
              }}
            />
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>
              This Listing
            </span>
          </div>
        </div>

        {/* ── sliders toggle ── */}
        <div style={{ padding: "0 24px 8px" }}>
          <button
            onClick={() => setShowSliders(!showSliders)}
            style={{
              width: "100%",
              padding: "10px 0",
              background: "none",
              border: "1.5px solid #E5E7EB",
              borderRadius: 12,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "#6B7280",
              fontFamily: "'DM Sans', system-ui",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#22C55E";
              e.currentTarget.style.color = "#1A1A1A";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#E5E7EB";
              e.currentTarget.style.color = "#6B7280";
            }}
          >
            <span style={{ fontSize: 15 }}>⚙</span>
            {showSliders ? "Hide Preferences" : "Adjust Preferences"}
            <span
              style={{
                transform: showSliders ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.3s ease",
                display: "inline-block",
              }}
            >
              ▾
            </span>
          </button>
        </div>

        {/* ── slider panel ── */}
        <div
          style={{
            maxHeight: showSliders ? 500 : 0,
            overflow: "hidden",
            transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div style={{ padding: "8px 24px 20px" }}>
            {CATEGORIES.map((cat) => (
              <div key={cat.key} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 5,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: cat.color,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                      }}
                    >
                      {cat.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#1A1A1A",
                      fontFamily: "'Space Mono', monospace",
                      minWidth: 24,
                      textAlign: "right",
                    }}
                  >
                    {userPrefs[cat.key]}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={userPrefs[cat.key]}
                  onChange={(e) =>
                    setUserPrefs((prev) => ({
                      ...prev,
                      [cat.key]: Number(e.target.value),
                    }))
                  }
                  style={{
                    width: "100%",
                    height: 4,
                    borderRadius: 2,
                    appearance: "none",
                    background: `linear-gradient(to right, ${cat.color} 0%, ${cat.color} ${userPrefs[cat.key]}%, #E5E7EB ${userPrefs[cat.key]}%, #E5E7EB 100%)`,
                    outline: "none",
                    cursor: "pointer",
                  }}
                />
              </div>
            ))}
            <button
              onClick={() =>
                setUserPrefs({
                  walkability: 50,
                  nourishment: 50,
                  wellness: 50,
                  greenery: 50,
                  buzz: 50,
                  essentials: 50,
                  safety: 50,
                  transit: 50,
                })
              }
              style={{
                marginTop: 4,
                background: "none",
                border: "none",
                color: "#9CA3AF",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "'DM Sans', system-ui",
                padding: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#9CA3AF")}
            >
              Reset all to 50
            </button>
          </div>
        </div>

        {/* ── empty state (if no preferences set) ── */}
        {false && (
          <div
            style={{
              padding: "20px 24px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 12 }}>
              Chat with Canopi to personalize your scores
            </div>
            <button
              style={{
                padding: "8px 20px",
                background: "#22C55E",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', system-ui",
              }}
            >
              💬 Start Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}