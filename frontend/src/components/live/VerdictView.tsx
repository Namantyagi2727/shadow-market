"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { VerdictData } from "@/lib/contracts";
import { truncateWords } from "./types";

interface VerdictViewProps {
  verdict: VerdictData | null;
  analystFraming: string | null;
  isActive: boolean;
}

function buildOneSentenceReason(verdict: VerdictData): string {
  const source = (verdict.analyst_reason || verdict.summary || "").trim();
  if (!source) return "";
  const firstSentenceMatch = source.match(/^[^.!?]+[.!?]/);
  const candidate = firstSentenceMatch ? firstSentenceMatch[0].trim() : source;
  return truncateWords(candidate, 30);
}

function formatFraming(framing: string): string {
  const trimmed = framing.trim();
  if (/^assumed:/i.test(trimmed)) return trimmed;
  return `Assumed: ${trimmed}`;
}

export function VerdictView({
  verdict,
  analystFraming,
  isActive,
}: VerdictViewProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  if (!verdict) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-[#5F6368]">
            Waiting for calibrated launch verdict…
          </p>
          {isActive && (
            <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  const pct = Math.round(verdict.launch_probability * 100);
  const reason = buildOneSentenceReason(verdict);
  const failureModes = verdict.failure_modes.slice(0, 3);

  return (
    <div className="relative flex h-full flex-col justify-center overflow-y-auto px-8 py-8 lg:px-14">
      <div className="mx-auto w-full max-w-[760px]">
        {/* Hero launch probability */}
        <div>
          <div className="text-[110px] font-light leading-none tracking-[-0.04em] tabular-nums text-[#E8EAED]">
            {pct}%
          </div>
          <div className="mt-3 text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
            Launch probability
          </div>
        </div>

        {/* One-sentence reason & framing */}
        <div className="mt-7 space-y-2.5">
          {reason && (
            <p className="max-w-[660px] text-[16px] font-normal leading-[1.55] text-[#E8EAED]">
              {reason}
            </p>
          )}
          {analystFraming && (
            <p className="text-[12px] leading-[1.5] text-[#5F6368]">
              {formatFraming(analystFraming)}
            </p>
          )}
        </div>

        {/* 3 numbered failure modes */}
        {failureModes.length > 0 && (
          <div className="mt-10 border-t border-[#2A2B30] pt-6">
            <div className="mb-4 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
              Primary failure modes
            </div>
            <ol className="space-y-4">
              {failureModes.map((mode, idx) => (
                <li key={idx} className="flex items-start gap-4">
                  <span className="mt-0.5 shrink-0 font-mono text-[12px] text-[#5F6368]">
                    0{idx + 1}
                  </span>
                  <p className="text-[14px] font-normal leading-[1.55] text-[#E8EAED]">
                    {mode}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Backtest side-sheet trigger */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="text-[13px] font-normal text-[#9AA0A6] transition-colors duration-200 hover:text-[#E8EAED]"
          >
            How we know →
          </button>
        </div>
      </div>

      {/* Side sheet (text only, no images) */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/60"
          onClick={() => setSheetOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Backtest methodology"
            className="live-sheet-in flex h-full w-full max-w-[440px] flex-col border-l border-[#2A2B30] bg-[#16171A] p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2A2B30] pb-4">
              <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
                How we know
              </span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close methodology sheet"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] text-[#9AA0A6] transition-colors hover:text-[#E8EAED]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="mt-6 flex-1 space-y-6 overflow-y-auto">
              <p className="text-[18px] font-normal leading-[1.5] text-[#E8EAED]">
                Backtested on 120 real 2026 Kickstarter launches · analyst AUC
                0.88 vs single-model leak-free baseline · we caught and removed
                an image leak
              </p>

              <div className="space-y-4 border-t border-[#2A2B30] pt-5 text-[13px] leading-[1.6] text-[#9AA0A6]">
                <div>
                  <div className="mb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                    Validation set
                  </div>
                  <p>
                    Evaluated out-of-sample across 120 real 2026 Kickstarter
                    launches with verified funded/failed outcomes, comparing
                    calibrated analyst probability estimates against a
                    single-model baseline.
                  </p>
                </div>

                <div>
                  <div className="mb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                    Leak detection &amp; removal
                  </div>
                  <p>
                    During evaluation we detected that campaign hero images
                    leaked outcome signals (such as post-launch funded badges).
                    Images were stripped from the analyst input so the 0.88 AUC
                    reflects a leak-free text and framing evaluation.
                  </p>
                </div>

                <div>
                  <div className="mb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                    Separation of idea vs. page
                  </div>
                  <p>
                    The analyst probability scores the underlying product
                    concept, category base rate, and funding goal framing. Page
                    iterations in V2 measure held-out conversion and buyer
                    rubric deltas without inflating the idea score.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
