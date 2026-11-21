"use client";

import React from "react";
import { X } from "lucide-react";
import { FounderBriefBadge, FounderBriefData } from "@/lib/contracts";

interface TeleprompterCardProps {
  brief: FounderBriefData | null;
  onDismiss: () => void;
}

function getBadgeDetails(badge: FounderBriefBadge): {
  label: string;
  badgeClass: string;
} {
  switch (badge) {
    case "VERIFIED":
      return {
        label: "VERIFIED",
        badgeClass: "border-emerald-500/50 bg-emerald-500/20 text-emerald-300",
      };
    case "PARTIAL":
      return {
        label: "PARTIAL",
        badgeClass: "border-amber-500/50 bg-amber-500/20 text-amber-300",
      };
    case "PUSH_BACK":
      return {
        label: "Push back",
        badgeClass: "border-rose-500/50 bg-rose-500/20 text-rose-300",
      };
    default:
      return {
        label: badge,
        badgeClass: "border-zinc-500/50 bg-zinc-500/20 text-zinc-300",
      };
  }
}

export function TeleprompterCard({ brief, onDismiss }: TeleprompterCardProps) {
  if (!brief) {
    return null;
  }

  const badgeDetails = getBadgeDetails(brief.badge);
  const confPct = Math.round(
    brief.badge_confidence <= 1
      ? brief.badge_confidence * 100
      : brief.badge_confidence
  );

  const proofPills = brief.proof ? brief.proof.slice(0, 2) : [];

  return (
    <div className="relative w-full rounded-3xl border-2 border-cyan-400/50 bg-[#090b11]/95 p-6 md:p-8 shadow-[0_0_50px_rgba(0,0,0,0.85)] ring-1 ring-white/10 backdrop-blur-2xl">
      {/* Top row: Badge + confidence percentage & Dismiss button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`rounded-full border px-3.5 py-1 font-mono text-xs font-bold uppercase tracking-wider ${badgeDetails.badgeClass}`}
          >
            {badgeDetails.label}
          </span>
          <span className="font-mono text-xs font-semibold text-zinc-400">
            {confPct}%
          </span>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-lg border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ONE huge line: read aloud verbatim, readable from 1.5 m */}
      <div className="my-5">
        <p className="text-2xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md sm:text-3xl lg:text-4xl">
          {brief.line}
        </p>
      </div>

      {/* 1–2 proof pills (label: value with small source tag) */}
      {proofPills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {proofPills.map((item, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1 text-xs text-zinc-200"
            >
              <span>
                {item.label}:{" "}
                <strong className="font-semibold text-white">
                  {item.value}
                </strong>
              </span>
              <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                {item.source}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
