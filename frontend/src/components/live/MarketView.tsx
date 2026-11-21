"use client";

import React, { useMemo } from "react";
import type {
  CompetitorItem,
  SwarmProgressData,
  SwarmResultData,
} from "@/lib/contracts";
import { formatPrice, formatRubricLabel } from "./types";

interface MarketViewProps {
  swarmProgress: SwarmProgressData | null;
  swarmResult: SwarmResultData | null;
  swarmDurationMs: number | null;
  competitors: CompetitorItem[];
  isActive: boolean;
}

const RUBRIC_ORDER = [
  "value_clarity",
  "pain_urgency",
  "price_value_fit",
  "credibility_trust",
  "beat_competitors",
];

export function MarketView({
  swarmProgress,
  swarmResult,
  swarmDurationMs,
  competitors,
  isActive,
}: MarketViewProps) {
  const orderedRubrics = useMemo(() => {
    if (!swarmResult) return [];
    const entries = Object.entries(swarmResult.rubrics);
    entries.sort(([a], [b]) => {
      const ia = RUBRIC_ORDER.indexOf(a);
      const ib = RUBRIC_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return entries;
  }, [swarmResult]);

  const weakestKey = useMemo(() => {
    if (orderedRubrics.length === 0) return null;
    let lowestKey = orderedRubrics[0][0];
    let lowestVal = orderedRubrics[0][1];
    for (const [key, val] of orderedRubrics) {
      if (val < lowestVal) {
        lowestVal = val;
        lowestKey = key;
      }
    }
    return lowestKey;
  }, [orderedRubrics]);

  const quietCompetitors = competitors.slice(0, 3);

  if (!swarmResult && !swarmProgress && quietCompetitors.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-[#5F6368]">
            Waiting for 200-buyer market simulation…
          </p>
          {isActive && (
            <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  const personasCount = swarmResult?.personas ?? 200;
  const rubricCount = orderedRubrics.length || 5;
  const totalAnswers = swarmResult
    ? personasCount * rubricCount
    : swarmProgress?.total ?? 1000;
  const durationText =
    swarmDurationMs !== null && swarmDurationMs > 0
      ? `${(swarmDurationMs / 1000).toFixed(1)} s`
      : null;

  const progressPct =
    swarmProgress && swarmProgress.total > 0
      ? Math.min(100, Math.round((swarmProgress.done / swarmProgress.total) * 100))
      : 0;

  return (
    <div className="flex h-full flex-col justify-center overflow-y-auto px-8 py-8 lg:px-14">
      <div className="mx-auto w-full max-w-[760px] space-y-12">
        {/* Headline sentence */}
        <div>
          <h1 className="text-[28px] font-light leading-[1.25] tracking-[-0.02em] text-[#E8EAED] lg:text-[34px]">
            {swarmResult ? (
              <>
                {personasCount.toLocaleString()} buyers ·{" "}
                {totalAnswers.toLocaleString()} calibrated answers
                {durationText ? ` · ${durationText}` : ""}
              </>
            ) : (
              <>
                Scoring {personasCount.toLocaleString()} synthetic buyers ·{" "}
                {(swarmProgress?.done ?? 0).toLocaleString()} /{" "}
                {totalAnswers.toLocaleString()} answers
              </>
            )}
          </h1>

          {!swarmResult && (
            <div className="mt-5 h-[2px] w-full overflow-hidden rounded-full bg-[#2A2B30]">
              <div
                className="h-full transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.max(8, progressPct)}%`,
                  background:
                    "linear-gradient(90deg, #4285F4 0%, #9B72CB 50%, #D96570 100%)",
                }}
              />
            </div>
          )}
        </div>

        {/* 5 rubrics as thin 4px horizontal bars */}
        {orderedRubrics.length > 0 && (
          <section aria-label="Buyer rubrics" className="space-y-6">
            {orderedRubrics.map(([key, score]) => {
              const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
              const isWeakest = key === weakestKey;

              return (
                <div key={key} className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[14px] font-normal text-[#E8EAED]">
                        {formatRubricLabel(key)}
                      </span>
                      {isWeakest && (
                        <span className="text-[12px] font-normal text-[#F28B82]">
                          weakest
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-mono text-[13px] tabular-nums ${
                        isWeakest ? "text-[#F28B82]" : "text-[#9AA0A6]"
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>

                  <div className="h-[4px] w-full overflow-hidden rounded-full bg-[#2A2B30]">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: isWeakest ? "#F28B82" : "#E8EAED",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* 3 quiet Shopify competitor rows */}
        {quietCompetitors.length > 0 && (
          <section className="pt-2">
            <div className="mb-3 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
              Shopify competitors
            </div>
            <ul className="divide-y divide-[#2A2B30] border-y border-[#2A2B30]">
              {quietCompetitors.map((item, idx) => (
                <li
                  key={`${idx}-${item.title}`}
                  className="flex items-center justify-between gap-6 py-3.5"
                >
                  <span className="truncate text-[14px] text-[#9AA0A6]">
                    {item.title}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums text-[#E8EAED]">
                    {formatPrice(item.price_usd)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
