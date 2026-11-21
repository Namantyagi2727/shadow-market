"use client";

import React from "react";
import { BookmarkCheck } from "lucide-react";
import { getBadgeConfig, type SessionFounderBriefPayload } from "./types";

interface HeroAnswerCardProps {
  brief: SessionFounderBriefPayload | null;
  judgeQuestion: string | null;
}

export function HeroAnswerCard({ brief, judgeQuestion }: HeroAnswerCardProps) {
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

      {/* Main speakable answer line in 30px */}
      <h1 className="mt-3 text-[30px] font-medium leading-[1.22] tracking-[-0.015em] text-[#E8EAED]">
        {brief.line}
      </h1>

      {/* Proof pills */}
      {proofs.length > 0 && (
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
