"use client";

import React from "react";
import {
  extractDomain,
  formatAnalystFraming,
  formatPercent,
  formatPrice,
  formatRubricLabel,
  type PitchResearchData,
} from "./types";

interface FindingsSectionProps {
  research: PitchResearchData | null;
}

export function FindingsSection({ research }: FindingsSectionProps) {
  const competitors = research?.competitors.slice(0, 3) ?? [];
  const webFacts = research?.web.slice(0, 3) ?? [];
  const buyers = research?.buyers ?? null;
  const analyst = research?.analyst ?? null;

  const weakestKey = buyers?.weakest ?? "";
  const weakestVal =
    buyers && weakestKey && weakestKey in buyers.rubrics
      ? buyers.rubrics[weakestKey]
      : null;

  const framingText = analyst
    ? formatAnalystFraming(analyst.framing, analyst.reason)
    : "";

  return (
    <section
      aria-label="What we found"
      className="mt-4 shrink-0 border-t border-[#2A2B30] pt-3.5"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
          What we found
        </h2>
        {research?.latency_ms !== null &&
          research?.latency_ms !== undefined &&
          research.latency_ms > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-[#5F6368]">
              {(research.latency_ms / 1000).toFixed(1)}s
            </span>
          )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {/* Competitors */}
        <div className="rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3.5 py-2.5">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#5F6368]">
            Competitors
          </div>
          {competitors.length === 0 ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : (
            <ul className="space-y-1">
              {competitors.map((item, idx) => (
                <li
                  key={`${idx}-${item.title}`}
                  className="flex items-baseline justify-between gap-3 text-[12px]"
                >
                  <span className="truncate text-[#E8EAED]">{item.title}</span>
                  <span className="shrink-0 font-mono tabular-nums text-[#9AA0A6]">
                    {formatPrice(item.price_usd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Web facts */}
        <div className="rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3.5 py-2.5">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#5F6368]">
            Web
          </div>
          {webFacts.length === 0 ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : (
            <ul className="space-y-1">
              {webFacts.map((item, idx) => {
                const domain = extractDomain(item.url);
                return (
                  <li
                    key={`${idx}-${item.fact.slice(0, 24)}`}
                    className="flex items-baseline justify-between gap-2.5 text-[12px]"
                    title={item.fact}
                  >
                    <span className="truncate text-[#E8EAED]">{item.fact}</span>
                    {domain && (
                      <span className="shrink-0 font-mono text-[11px] text-[#5F6368]">
                        {domain}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Buyers */}
        <div className="rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3.5 py-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#5F6368]">
            Buyers
          </div>
          {!buyers ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : (
            <p className="truncate text-[13px] text-[#E8EAED]">
              <span>{buyers.n} buyers</span>
              <span className="mx-1.5 text-[#5F6368]">·</span>
              <span className="text-[#9AA0A6]">weakest: </span>
              <span>{formatRubricLabel(weakestKey)}</span>
              {weakestVal !== null && (
                <span className="ml-1.5 font-mono tabular-nums text-[#F28B82]">
                  {formatPercent(weakestVal)}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Analyst */}
        <div className="rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3.5 py-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#5F6368]">
            Analyst
          </div>
          {!analyst ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : (
            <p
              className="truncate text-[13px] text-[#E8EAED]"
              title={
                framingText
                  ? `Launch probability ${formatPercent(analyst.probability)} — ${framingText}`
                  : `Launch probability ${formatPercent(analyst.probability)}`
              }
            >
              <span>Launch probability </span>
              <span className="font-mono font-medium tabular-nums text-[#E8EAED]">
                {formatPercent(analyst.probability)}
              </span>
              {framingText && (
                <>
                  <span className="mx-1.5 text-[#5F6368]">—</span>
                  <span className="text-[#9AA0A6]">{framingText}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
