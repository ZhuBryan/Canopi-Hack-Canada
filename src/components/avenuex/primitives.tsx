"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type { Listing, ScoreBand } from "@/lib/avenuex-data";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Same 5-tier palette used by the Mapbox building highlights.
export function scoreColor(score: number): string {
  if (score >= 85) return "#15803d";
  if (score >= 75) return "#4ade80";
  if (score >= 65) return "#ca8a04"; // darkened yellow for text legibility
  if (score >= 55) return "#f97316";
  return "#dc2626";
}

// Kept for components that still need a band string.
const bandStyles: Record<ScoreBand, { pill: string }> = {
  great:   { pill: "bg-green-50" },
  medium:  { pill: "bg-orange-50" },
  warning: { pill: "bg-red-50" },
};

export function AppSwitch() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Landing" },
    { href: "/component-library", label: "Components" },
    { href: "/map", label: "Map" },
    { href: "/diorama", label: "3D View" },
    { href: "/listing", label: "Detail" },
    { href: "/saved", label: "Saved" },
    { href: "/saved-compact", label: "Saved Lite" },
    { href: "/compare", label: "Compare" },
    { href: "/mobile-dashboard", label: "Mobile" },
  ];

  return (
    <div className="sticky top-4 z-50 mx-auto mb-4 flex w-fit flex-wrap items-center gap-2 rounded-full border border-black/5 bg-white/90 p-2 shadow-lg backdrop-blur">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              active
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

export function DesktopNavbar({
  searchPlaceholder,
  savedCount,
  searchValue,
  onSearchValueChange,
}: {
  searchPlaceholder: string;
  savedCount: number;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
}) {
  const router = useRouter();
  const hasInput = typeof onSearchValueChange === "function";

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="flex items-center gap-2 rounded-lg px-1 py-0.5"
      >
        <Image src="/canopi-logo.png" alt="Canopi" width={99} height={99} className="rounded-md" />
        <span className="font-display text-4xl font-bold text-slate-900">Canopi</span>
      </button>
      <div className="hidden h-10 w-[400px] items-center gap-2 rounded-xl border border-gray-200 bg-slate-50 px-4 text-sm text-slate-400 md:flex">
        <span aria-hidden>[ ]</span>
        {hasInput ? (
          <input
            value={searchValue}
            onChange={(event) => onSearchValueChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        ) : (
          <span>{searchPlaceholder}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push("/saved")}
          className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 md:flex"
        >
          <span>Saved</span>
          <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-bold text-white">
            {savedCount}
          </span>
        </button>
        <div className="relative h-8 w-8 rounded-full bg-green-500 text-white">
          <span className="absolute inset-0 grid place-items-center text-xs font-bold">R</span>
        </div>
      </div>
    </header>
  );
}

export function PrimaryButton({
  children,
  className,
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "rounded-xl bg-green-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-green-300",
        className
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className,
  onClick,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "rounded-xl px-6 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300",
        className
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-white text-slate-500 transition hover:bg-slate-100",
        className
      )}
    >
      {children}
    </button>
  );
}

export function ScoreBar({
  value,
  color,
  heightClass = "h-2",
}: {
  value: number;
  color: string;
  heightClass?: string;
}) {
  return (
    <div className={cx("w-full rounded-full bg-gray-200", heightClass)}>
      <div
        className={cx("rounded-full", heightClass)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function ScorePill({ label, band, score }: { label: string; band: ScoreBand; score?: number }) {
  const color = score !== undefined ? scoreColor(score) : undefined;
  const { pill } = bandStyles[band];
  return (
    <div
      className={cx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", pill)}
      style={color ? { color } : undefined}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={color ? { backgroundColor: color } : undefined} />
      {label}
    </div>
  );
}

export function PropertyCard({
  listing,
  compact = false,
  isSaved,
  isCompared,
  onToggleSaved,
  onToggleCompare,
  onOpen,
}: {
  listing: Listing;
  compact?: boolean;
  isSaved?: boolean;
  isCompared?: boolean;
  onToggleSaved?: () => void;
  onToggleCompare?: () => void;
  onOpen?: () => void;
}) {
  const metaText =
    listing.beds === 0
      ? `Studio | ${listing.baths} bath | ${listing.sqft} sqft`
      : `${listing.beds} bed | ${listing.baths} bath | ${listing.sqft} sqft`;

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm fade-pop">
      <div className="relative h-44">
        <Image
          src={listing.image}
          alt={listing.address}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-cover"
        />
        <div className="absolute left-3 top-3 grid h-5 w-5 place-items-center rounded bg-green-500 text-xs font-bold text-white">
          {isCompared ? "C" : ""}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-alt text-xl font-bold text-slate-900">{listing.priceLabel}</p>
          <ScorePill label={`${listing.score}`} band={listing.scoreBand} />
        </div>
        <p className="font-alt text-sm font-semibold text-slate-900">{listing.address}</p>
        <p className="font-alt text-xs text-slate-500">{metaText}</p>
        {!compact && (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Vitality Score</span>
              <span>{listing.score} / 100</span>
            </div>
            <ScoreBar value={listing.score} color={scoreColor(listing.score)} />
            <p className="mt-2 text-xs font-medium" style={{ color: scoreColor(listing.score) }}>
              {listing.scoreStatus}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {onToggleSaved && (
            <button
              type="button"
              onClick={onToggleSaved}
              className={cx(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                isSaved
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-200 bg-white text-slate-600 hover:bg-slate-100"
              )}
            >
              {isSaved ? "Saved" : "Save"}
            </button>
          )}
          {onToggleCompare && (
            <button
              type="button"
              onClick={onToggleCompare}
              className={cx(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                isCompared
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-slate-600 hover:bg-slate-100"
              )}
            >
              {isCompared ? "Comparing" : "Compare"}
            </button>
          )}
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Open
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function MapPin({
  price,
  x,
  y,
  active,
  onClick,
}: {
  price: string;
  x: string;
  y: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: x, top: y } as CSSProperties}
    >
      <div
        className={cx(
          "rounded-full px-3 py-1 text-xs font-bold text-white shadow transition",
          active ? "bg-slate-900" : "bg-green-500"
        )}
      >
        {price}
      </div>
      <div
        className={cx(
          "h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent",
          active ? "border-t-slate-900" : "border-t-green-500"
        )}
      />
    </button>
  );
}

export function MetricBadge({
  text,
  background,
  textColor,
}: {
  text: string;
  background: string;
  textColor?: string;
}) {
  return (
    <span
      className="inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: background, color: textColor ?? "#fff" }}
    >
      {text}
    </span>
  );
}
