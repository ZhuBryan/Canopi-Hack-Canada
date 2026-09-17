"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ImageTrail from "./ImageTrail";

const CONDO_IMAGES = [
  "/condos/0.jpg",
  "/condos/14-dec-2018-UNIT-2.png",
  "/condos/66isabella-1024x691.jpg",
  "/condos/960px-Absolute_Towers_Mississauga._South-west_view.jpg",
  "/condos/Calgary-Skyline.jpg",
  "/condos/IMG_7515-1.jpeg",
  "/condos/Shangri-La-Vancouver-01-e1460782872253.jpg",
  "/condos/Vessel in New York City_Courtesy of Vessel_0.jpg",
  "/condos/canada-toronto-city-cn-tower.jpg",
  "/condos/toronto-modern-skyscrapers-hnciwjoneb746tdn.jpg",
  "/condos/Screenshot 2026-03-08 005146.png",
  "/condos/Screenshot 2026-03-08 005421.png",
  "/condos/Screenshot 2026-03-08 005831.png",
  "/condos/Screenshot 2026-03-08 005856.png",
  "/condos/Screenshot 2026-03-08 005926.png",
];

/* ── Letter-by-letter blur reveal ────────────────────────── */
function BlurText({
  text,
  mounted,
  baseDelay = 0,
  letterStagger = 0.04,
  className,
  style,
}: {
  text: string;
  mounted: boolean;
  baseDelay?: number;
  letterStagger?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={className} style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", ...style }}>
      {text.split("").map((char, i) => {
        const delay = baseDelay + i * letterStagger;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: char === " " ? "pre" : undefined,
              opacity: mounted ? 1 : 0,
              filter: mounted ? "blur(0px)" : "blur(12px)",
              transform: mounted ? "translateY(0) scale(1)" : "translateY(6px) scale(0.5)",
              // Fade/blur stay smooth; only the transform overshoots (elastic pop).
              transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, filter 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.45s cubic-bezier(0.2,1.8,0.4,1) ${delay}s`,
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

type Phase = "blur-in" | "ready" | "trail-active" | "fading-out" | "done";

interface IntroScreenProps {
  onComplete: () => void;
}

export default function IntroScreen({ onComplete }: IntroScreenProps) {
  const [phase, setPhase] = useState<Phase>("blur-in");
  const [mounted, setMounted] = useState(false);
  const [trailEnabled, setTrailEnabled] = useState(false);
  const phaseRef = useRef<Phase>("blur-in");
  phaseRef.current = phase;

  // Trigger blur-in on next frame so the initial blurred state renders first
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Text animation timing:
  // Main title: 0ms + (18 × 0.06s) + 0.6s = 1.68s
  // Subtitle: 1.4s baseDelay + (40 × 0.04s) + 0.6s = 3.6s total
  // Add 3s delay for user to play with trail, then show "Click to begin"
  useEffect(() => {
    // Enable trail after blur finishes (3.6s)
    const enableTimer = setTimeout(() => {
      setTrailEnabled(true);
    }, 3600);

    // Show ready prompt after blur + 3s delay = 6.6s
    const readyTimer = setTimeout(() => {
      setPhase("ready");
    }, 6600);

    return () => {
      clearTimeout(enableTimer);
      clearTimeout(readyTimer);
    };
  }, []);

  const handleClick = useCallback(() => {
    const p = phaseRef.current;
    if (p === "ready") {
      setPhase("fading-out");
      setTimeout(() => {
        setPhase("done");
        onComplete();
      }, 800);
    }
  }, [onComplete]);

  if (phase === "done") return null;

  const isFading = phase === "fading-out";

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer transition-opacity duration-700 ${
        isFading ? "opacity-0" : "opacity-100"
      }`}
      style={{ backgroundColor: "var(--background)" }}
      onClick={handleClick}
    >
      {/* Subtle grid background */}
      <div className="absolute inset-0 avenue-grid opacity-40" />

      {/* Image trail layer — enabled after blur finishes */}
      <div className="absolute inset-0 z-[5]">
        <ImageTrail items={CONDO_IMAGES} maxVelocity={600} enabled={trailEnabled} />
      </div>

      {/* Text overlay */}
      <div
        className="relative z-10 flex flex-col items-center gap-4 select-none pointer-events-none"
      >
        {/* "Welcome to Canopi" — letter by letter, slowly */}
        <BlurText
          text="Welcome to Canopi"
          mounted={mounted}
          baseDelay={0}
          letterStagger={0.06}
          className="font-display text-6xl md:text-7xl font-bold tracking-tight"
          style={{ color: "var(--brand)" }}
        />

        {/* Subtitle — letter by letter, delayed */}
        <BlurText
          text="Find the right place, not just a listing"
          mounted={mounted}
          baseDelay={1.4}
          letterStagger={0.04}
          className="font-ui text-xl md:text-2xl"
          style={{ color: "var(--muted)" }}
        />

        {/* "Click to begin" prompt */}
        <div
          className={`mt-8 transition-all duration-700 ${
            phase === "ready" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <span
            className="font-ui text-sm tracking-widest uppercase intro-pulse"
            style={{ color: "var(--brand-mid)" }}
          >
            Click to begin
          </span>
        </div>
      </div>

    </div>
  );
}
