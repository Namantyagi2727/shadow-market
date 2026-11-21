"use client";

import React from "react";
import { BookmarkCheck, Globe } from "lucide-react";
import { getBadgeConfig, type SessionFounderBriefPayload } from "./types";

/** founder_brief_update: the same answer after a live Google Search on the judge's exact question. */
export interface FounderBriefUpdate {
  challenge_id: string;
  line: string;
  changed: boolean;
  web: { fact: string; url: string | null }[];
  latency_ms: number;
}

interface HeroAnswerCardProps {
  brief: SessionFounderBriefPayload | null;
  judgeQuestion: string | null;
  update?: FounderBriefUpdate | null;
  compact?: boolean;
}

function domainOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function HeroAnswerCard({ brief, judgeQuestion, update, compact }: HeroAnswerCardProps) {
  if (!brief) {
    return (
      <section
        aria-label="Live answer card"
        className="flex min-h-[148px] shrink-0 items-center justify-between rounded-[16px] border border-[#2A2B30] bg-[#16171A] px-7 py-6"
      >
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
            Live answer
          </div>
          <p className="text-[22px] font-normal tracking-[-0.01em] text-[#9AA0A6]">
            When a judge asks, your answer appears here.
          </p>
        </div>
        <span className="hidden rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-1.5 font-mono text-[11px] text-[#5F6368] sm:inline-block">
          Standing by
        </span>
      </section>
    );
  }

  const badge = getBadgeConfig(brief.badge);
  const isPrepared = Boolean(
    typeof brief.matched_question_id === "string" &&
      brief.matched_question_id.trim().length > 0
  );
  const proofs = Array.isArray(brief.proof) ? brief.proof : [];

  return (
    <section
      aria-label="Live answer card"
      className="founder-fade-in shrink-0 rounded-[16px] border border-[#2A2B30] bg-[#16171A] px-7 py-5"
    >
      {/* Top metadata row: badge + Prepared tag + judge question + latency */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={`inline-flex shrink-0 items-center rounded-[10px] border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${badge.className}`}
          >
            {badge.label}
          </span>

          {isPrepared && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[#81C995]/30 bg-[#81C995]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#81C995]">
              <BookmarkCheck className="h-3 w-3" strokeWidth={1.75} />
              <span>Prepared</span>
            </span>
          )}

          {judgeQuestion && (
            <p
              className="min-w-0 truncate text-[13px] font-normal text-[#5F6368]"
              title={judgeQuestion}
            >
              &ldquo;{judgeQuestion}&rdquo;
            </p>
          )}
        </div>

        {typeof brief.latency_ms === "number" && brief.latency_ms > 0 && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#5F6368]">
            {brief.latency_ms} ms
          </span>
        )}
      </div>

      {/* Main speakable answer line (updated by the live web check when it changes the answer) */}
      <h1
        className={`mt-3 font-medium tracking-[-0.015em] text-[#E8EAED] ${
          compact ? "text-[17px] leading-[1.35]" : "text-[30px] leading-[1.22]"
        }`}
      >
        {update?.changed ? update.line : brief.line}
      </h1>

      {/* Live web check: facts found for this exact question */}
      {!compact && update && update.web.length > 0 && (
        <div className="founder-fade-in mt-3 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3.5 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[#9AA0A6]">
            <Globe className="h-3 w-3" strokeWidth={1.75} />
            <span>{update.changed ? "Updated with web check" : "Web check"}</span>
            <span className="font-mono text-[#5F6368]">{Math.round(update.latency_ms / 100) / 10}s</span>
          </div>
          <ul className="space-y-1">
            {update.web.map((f, i) => (
              <li key={i} className="text-[13px] leading-snug text-[#E8EAED]">
                {f.fact}
                {f.url && <span className="ml-2 font-mono text-[11px] text-[#5F6368]">{domainOf(f.url)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Proof pills */}
      {!compact && proofs.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {proofs.map((pill, idx) => (
            <div
              key={`${idx}-${pill.label}`}
              className="flex items-center gap-2 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-1 text-[12px]"
            >
              <span className="text-[#9AA0A6]">{pill.label}</span>
              <span className="font-medium text-[#E8EAED]">{pill.value}</span>
              {pill.source && (
                <span className="font-mono text-[11px] text-[#5F6368]">
                  {pill.source}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
