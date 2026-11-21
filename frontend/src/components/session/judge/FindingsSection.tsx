"use client";

import React, { useState } from "react";
import {
  C,
  Donut,
  Gauge,
  PriceBars,
  ScoreBars,
  extractStat,
} from "./charts";
import {
  extractDomain,
  formatAnalystFraming,
  formatPrice,
  formatRubricLabel,
  type PitchCompetitor,
  type PitchResearchData,
} from "./types";

interface FindingsSectionProps {
  research: PitchResearchData | null;
}

function shortenTitle(title: string, maxLen = 22): string {
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLen) return cleaned;
  const sliced = cleaned.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLen * 0.55)) {
    return `${sliced.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${sliced.trimEnd()}…`;
}

function formatWebSource(url: string | null | undefined): string | null {
  const domain = extractDomain(url);
  if (!domain) return null;
  return domain.toLowerCase().includes("vertexaisearch")
    ? "web search"
    : domain;
}

function scoreColor(value: number): string {
  if (value >= 0.6) return C.green;
  if (value >= 0.4) return C.blue;
  return C.red;
}

function isPricedCompetitor(
  item: PitchCompetitor
): item is PitchCompetitor & { price_usd: number } {
  return (
    typeof item.price_usd === "number" &&
    Number.isFinite(item.price_usd) &&
    item.price_usd > 0
  );
}

export function FindingsSection({ research }: FindingsSectionProps) {
  const [analystExpanded, setAnalystExpanded] = useState(false);
  const [expandedFacts, setExpandedFacts] = useState<Record<number, boolean>>(
    {}
  );

  const competitors = research?.competitors ?? [];
  const webFacts = research?.web.slice(0, 3) ?? [];
  const buyers = research?.buyers ?? null;
  const analyst = research?.analyst ?? null;

  const rubricItems = buyers
    ? Object.entries(buyers.rubrics)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .map(([key, value]) => ({
          key,
          label: formatRubricLabel(key),
          value,
        }))
    : [];

  const weakestKey = (() => {
    if (!buyers) return "";
    if (buyers.weakest && buyers.weakest in buyers.rubrics) {
      return buyers.weakest;
    }
    let minKey = "";
    let minVal = Infinity;
    for (const item of rubricItems) {
      if (item.value < minVal) {
        minVal = item.value;
        minKey = item.key;
      }
    }
    return minKey;
  })();

  const hasBuyerIntent =
    buyers !== null &&
    typeof buyers.intent_mean === "number" &&
    Number.isFinite(buyers.intent_mean);

  const hasAnalystProb =
    analyst !== null &&
    typeof analyst.probability === "number" &&
    Number.isFinite(analyst.probability);

  const framingText = analyst
    ? formatAnalystFraming(analyst.framing, analyst.reason)
    : "";

  const pricedCompetitors = competitors
    .filter(isPricedCompetitor)
    .slice(0, 4)
    .map((item) => ({
      label: shortenTitle(item.title, 22),
      price: item.price_usd,
    }));

  const pitchPrice =
    typeof research?.pitch?.price_usd === "number" &&
    Number.isFinite(research.pitch.price_usd) &&
    research.pitch.price_usd > 0
      ? research.pitch.price_usd
      : null;

  const fallbackCompetitors = competitors.slice(0, 3);

  const toggleFact = (index: number) => {
    setExpandedFacts((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <section
      aria-label="What we found"
      className="mt-3 max-h-[50vh] shrink-0 overflow-y-auto border-t border-[#2A2B30] pt-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-medium text-[#9AA0A6]">
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
        {/* Buyers */}
        <div className="min-w-0 rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3 py-2.5">
          <div className="mb-2 text-[12px] font-medium text-[#9AA0A6]">
            Buyers
          </div>
          {!buyers || (!hasBuyerIntent && rubricItems.length === 0) ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : (
            <div className="space-y-2.5">
              {hasBuyerIntent && (
                <Donut
                  value={buyers.intent_mean}
                  size={70}
                  stroke={8}
                  color={scoreColor(buyers.intent_mean)}
                  label="would buy"
                  sublabel={
                    buyers.n > 0
                      ? `of ${buyers.n} simulated buyers`
                      : undefined
                  }
                />
              )}
              {rubricItems.length > 0 && (
                <ScoreBars
                  items={rubricItems}
                  highlight={weakestKey ? [weakestKey] : []}
                  color={C.blue}
                />
              )}
            </div>
          )}
        </div>

        {/* Analyst */}
        <div className="flex min-w-0 flex-col rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3 py-2.5">
          <div className="mb-2 text-[12px] font-medium text-[#9AA0A6]">
            Analyst
          </div>
          {!analyst || !hasAnalystProb ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : (
            <div className="flex flex-1 flex-col justify-between gap-2">
              <Gauge
                value={analyst.probability}
                width={144}
                color={scoreColor(analyst.probability)}
                caption="Launch odds"
                refValue={0.5}
                refLabel="50% = coin flip"
              />
              <div className="min-w-0 space-y-1">
                {framingText && (
                  <button
                    type="button"
                    onClick={() => setAnalystExpanded((prev) => !prev)}
                    aria-expanded={analystExpanded}
                    title={framingText}
                    className={`block w-full cursor-pointer text-left text-[12px] leading-[1.35] text-[#9AA0A6] transition-colors hover:text-[#E8EAED] ${
                      analystExpanded ? "" : "line-clamp-1"
                    }`}
                  >
                    {framingText}
                  </button>
                )}
                <p className="text-[11px] text-[#5F6368]">
                  backtested: AUC 0.88 on 120 launches
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Competitors */}
        <div className="min-w-0 rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3 py-2.5">
          <div className="mb-2 text-[12px] font-medium text-[#9AA0A6]">
            Competitors
          </div>
          {competitors.length === 0 ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : pricedCompetitors.length > 0 ? (
            <PriceBars
              items={pricedCompetitors}
              yourPrice={pitchPrice}
              yourLabel="This pitch"
            />
          ) : (
            <ul className="space-y-1">
              {fallbackCompetitors.map((item, idx) => (
                <li
                  key={`${idx}-${item.title}`}
                  className="flex items-baseline justify-between gap-3 text-[12px]"
                  title={item.title}
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

        {/* Web */}
        <div className="min-w-0 rounded-[12px] border border-[#2A2B30] bg-[#16171A] px-3 py-2.5">
          <div className="mb-2 text-[12px] font-medium text-[#9AA0A6]">
            Web
          </div>
          {webFacts.length === 0 ? (
            <p className="text-[12px] text-[#5F6368]">Pending…</p>
          ) : (
            <ul className="space-y-1">
              {webFacts.map((item, idx) => {
                const sourceChip = formatWebSource(item.url);
                const stat = extractStat(item.fact);
                const isExpanded = Boolean(expandedFacts[idx]);
                return (
                  <li key={`${idx}-${item.fact.slice(0, 24)}`}>
                    <button
                      type="button"
                      onClick={() => toggleFact(idx)}
                      aria-expanded={isExpanded}
                      title={item.fact}
                      className="flex w-full cursor-pointer items-start gap-1.5 rounded-[6px] py-0.5 text-left transition-colors hover:bg-[#1C1D21]"
                    >
                      {stat && (
                        <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-[#78D9EC]">
                          {stat}
                        </span>
                      )}
                      <span
                        className={`min-w-0 flex-1 text-[12px] leading-[1.35] text-[#E8EAED] ${
                          isExpanded ? "" : "line-clamp-1"
                        }`}
                      >
                        {item.fact}
                      </span>
                      {sourceChip && (
                        <span className="max-w-[7rem] shrink-0 truncate rounded-full border border-[#2A2B30] bg-[#0E0F11] px-1.5 py-0.5 text-[10px] leading-tight text-[#9AA0A6]">
                          {sourceChip}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
