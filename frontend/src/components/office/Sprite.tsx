"use client";

import React, { useState } from "react";

export type SpriteState =
  | "idle"
  | "talking"
  | "working"
  | "confused"
  | "quit"
  | "celebrating";

export interface SpriteProps {
  id: string;
  name: string;
  initials: string;
  /** Optional filename inside /public/sprites/<spriteFile>.png (falls back to pixel block) */
  spriteFile?: string;
  color: string;
  accentColor?: string;
  /** Scene coordinates in percent (0..100) of the 16:9 OfficeScene */
  x: number;
  y: number;
  state: SpriteState;
  bubble?: string | null;
  badge?: string | null;
  showConfusedMark?: boolean;
  size?: "sm" | "md";
  zIndex?: number;
  onClick?: () => void;
  title?: string;
}

function truncateBubble(text: string, maxLen = 92): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

export function Sprite({
  name,
  initials,
  spriteFile,
  color,
  accentColor = "#0f172a",
  x,
  y,
  state,
  bubble,
  badge,
  showConfusedMark = false,
  size = "md",
  zIndex = 20,
  onClick,
  title,
}: SpriteProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const isSmall = size === "sm";
  const boxSize = isSmall ? "h-8 w-8" : "h-10 w-10";

  const animClass =
    state === "talking"
      ? "animate-pixel-talk"
      : state === "working"
      ? "animate-pixel-work"
      : state === "celebrating"
      ? "animate-pixel-celebrate"
      : "";

  const borderClass =
    state === "talking"
      ? "ring-2 ring-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.65)]"
      : state === "quit"
      ? "ring-2 ring-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
      : state === "celebrating"
      ? "ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
      : state === "confused"
      ? "ring-2 ring-amber-400"
      : "ring-1 ring-black/80";

  const showBubble = Boolean(bubble && bubble.trim().length > 0);
  const spriteSrc = spriteFile ? `/sprites/${spriteFile}.png` : null;

  return (
    <div
      className="pointer-events-none absolute inset-0 transition-transform duration-[400ms] ease-out will-change-transform"
      style={{
        transform: `translate3d(${x}%, ${y}%, 0)`,
        zIndex,
      }}
    >
      <div
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        title={title || name}
        className={`pointer-events-auto relative inline-flex -translate-x-1/2 -translate-y-1/2 flex-col items-center select-none ${
          onClick ? "cursor-pointer group" : ""
        }`}
      >
        {/* Speech / Thought Bubble */}
        {showBubble && (
          <div
            className={`absolute bottom-full mb-2 w-44 sm:w-52 rounded-md border-2 px-2 py-1 text-[10px] leading-tight shadow-lg ${
              state === "talking"
                ? "border-cyan-300 bg-[#0a1420]/95 text-cyan-50"
                : "border-zinc-500 bg-[#121622]/95 text-zinc-100"
            }`}
          >
            <p className="font-mono break-words">{truncateBubble(bubble!)}</p>
            <span
              className={`absolute left-1/2 top-full -translate-x-1/2 border-x-4 border-t-4 border-x-transparent ${
                state === "talking" ? "border-t-cyan-300" : "border-t-zinc-500"
              }`}
            />
          </div>
        )}

        {/* Status Floating Indicator: Yellow ? / Red X / Green Check */}
        <div className="absolute -top-3.5 right-0 flex items-center gap-0.5 z-30">
          {(showConfusedMark || state === "confused") && state !== "quit" && state !== "celebrating" && (
            <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-amber-950 bg-amber-400 font-mono text-[10px] font-black text-zinc-950 shadow">
              ?
            </span>
          )}
          {state === "quit" && (
            <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-rose-950 bg-rose-500 font-mono text-[10px] font-black text-white shadow">
              ✕
            </span>
          )}
          {state === "celebrating" && (
            <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-emerald-950 bg-emerald-400 font-mono text-[10px] font-black text-zinc-950 shadow">
              ✓
            </span>
          )}
        </div>

        {/* Character Avatar (Real /public/sprites/*.png or Crisp Pixel-Art Placeholder) */}
        <div
          className={`relative flex ${boxSize} items-center justify-center overflow-hidden rounded-[4px] border-2 border-black/80 pixelated transition-transform ${animClass} ${borderClass} ${
            onClick ? "group-hover:scale-110" : ""
          }`}
          style={{ backgroundColor: color }}
        >
          {spriteSrc && !imgFailed ? (
            <img
              src={spriteSrc}
              alt={name}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-contain pixelated"
            />
          ) : (
            <div className="relative flex h-full w-full flex-col items-center justify-between p-0.5">
              {/* Pixel hair / top highlight */}
              <div
                className="h-1.5 w-full rounded-[1px] opacity-80"
                style={{ backgroundColor: accentColor }}
              />
              {/* Pixel eyes */}
              <div className="flex items-center gap-1.5">
                <span className="h-1 w-1 bg-zinc-950" />
                <span className="h-1 w-1 bg-zinc-950" />
              </div>
              {/* Crisp initials badge */}
              <span className="font-mono text-[9px] font-black leading-none tracking-tighter text-zinc-950 bg-white/85 px-0.5 rounded-[1px]">
                {initials}
              </span>
            </div>
          )}
        </div>

        {/* Name Tag */}
        <div className="mt-0.5 max-w-[84px] truncate rounded-sm border border-white/15 bg-black/85 px-1.5 py-[1px] font-mono text-[9px] font-semibold leading-tight text-zinc-100 shadow">
          {name}
        </div>

        {/* Optional Action/Outcome Badge (e.g., Quit at 14.2s) */}
        {badge && (
          <div
            className={`mt-0.5 whitespace-nowrap rounded-sm border px-1.5 py-[1px] font-mono text-[8px] font-bold uppercase tracking-tight shadow ${
              state === "quit"
                ? "border-rose-400/80 bg-rose-600/95 text-white group-hover:bg-rose-500"
                : state === "celebrating"
                ? "border-emerald-400/80 bg-emerald-600/95 text-white"
                : "border-white/20 bg-zinc-900/90 text-zinc-200"
            }`}
          >
            {badge}
          </div>
        )}
      </div>
    </div>
  );
}
