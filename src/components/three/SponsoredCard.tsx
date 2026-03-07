"use client";

/**
 * Avenue-X: SponsoredCard
 *
 * A glassmorphism 3D pop-up card that appears when a golden (small business) 
 * tether is clicked. Shows business info + a promo/discount code.
 * Uses Drei's <Html /> to render 2D content floating in 3D space.
 */

import { Html } from "@react-three/drei";
import { getCategoryColor } from "@/lib/cloudinary";

interface SponsoredCardProps {
  position: [number, number, number];
  businessName: string;
  category: string;
  discount?: string;
  onClose: () => void;
}

export default function SponsoredCard({
  position,
  businessName,
  category,
  discount = "WELCOME15",
  onClose,
}: SponsoredCardProps) {
  const accentColor = getCategoryColor(category);

  return (
    <Html
      position={position}
      center
      distanceFactor={8}
      zIndexRange={[100, 0]}
      style={{ pointerEvents: "auto" }}
    >
      <div
        style={{
          width: "280px",
          padding: "24px",
          borderRadius: "20px",
          background: "rgba(15, 15, 35, 0.85)",
          backdropFilter: "blur(20px)",
          border: `1px solid ${accentColor}40`,
          boxShadow: `0 0 40px ${accentColor}30, 0 20px 60px rgba(0,0,0,0.5)`,
          color: "#ffffff",
          fontFamily: "'Inter', 'Geist', sans-serif",
          animation: "cardEntry 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "12px",
            right: "14px",
            background: "rgba(255,255,255,0.1)",
            border: "none",
            color: "#888",
            fontSize: "16px",
            cursor: "pointer",
            borderRadius: "50%",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.2)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            e.currentTarget.style.color = "#888";
          }}
        >
          ✕
        </button>

        {/* Sponsored badge */}
        <div
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: "6px",
            background: `${accentColor}25`,
            color: accentColor,
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: "12px",
          }}
        >
          ★ SPONSORED LOCAL BUSINESS
        </div>

        {/* Business name */}
        <h3
          style={{
            margin: "0 0 6px 0",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {businessName}
        </h3>

        {/* Category */}
        <p
          style={{
            margin: "0 0 16px 0",
            fontSize: "13px",
            color: "#999",
            textTransform: "capitalize",
          }}
        >
          {category} • Near your new home
        </p>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            background: `linear-gradient(90deg, transparent, ${accentColor}50, transparent)`,
            margin: "0 0 16px 0",
          }}
        />

        {/* Discount code */}
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: "12px",
            color: "#aaa",
          }}
        >
          Welcome discount for new residents:
        </p>
        <div
          style={{
            padding: "12px",
            borderRadius: "10px",
            background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)`,
            border: `1px dashed ${accentColor}60`,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "3px",
              color: accentColor,
              fontFamily: "'Geist Mono', monospace",
            }}
          >
            {discount}
          </span>
          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: "11px",
              color: "#777",
            }}
          >
            15% off your first visit
          </p>
        </div>

        {/* CTA */}
        <button
          style={{
            width: "100%",
            marginTop: "16px",
            padding: "10px",
            borderRadius: "10px",
            border: "none",
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}CC)`,
            color: "#0F0F23",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
            boxShadow: `0 4px 15px ${accentColor}40`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.03)";
            e.currentTarget.style.boxShadow = `0 6px 25px ${accentColor}60`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = `0 4px 15px ${accentColor}40`;
          }}
        >
          View Business →
        </button>
      </div>
    </Html>
  );
}
