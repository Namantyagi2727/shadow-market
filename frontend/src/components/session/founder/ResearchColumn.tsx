"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import {
  extractDomain,
  formatPercent,
  formatPrice,
  formatResearchStep,
  formatRubricLabel,
  type PitchResearchPayload,
  type ResearchStatusPayload,
} from "./types";

interface ResearchColumnProps {
  research: PitchResearchPayload | null;
  researchStatuses: Record<string, ResearchStatusPayload>;
}

const RESEARCH_STEPS_ORDER = [
  "competitors",
  "web",
  "buyers",
  "analyst",
  "pitch",
  "questions",
  "prep",
];

export function ResearchColumn({
  research,
  researchStatuses,
}: ResearchColumnProps) {
  const runningSteps = RESEARCH_STEPS_ORDER.map((step) => researchStatuses[step])
    .filter(
      (item): item is ResearchStatusPayload =>
        Boolean(item) && item.state === "running"
    );

  // Also include any unexpected step keys that are running
  for (const item of Object.values(researchStatuses)) {
    if (
      item.state === "running" &&
      !runningSteps.some((s) => s.step === item.step)
    ) {
      runningSteps.push(item);
    }
  }

  const analyst = research?.analyst ?? null;
  const buyers = research?.buyers ?? null;
  const competitors = Array.isArray(research?.competitors)
    ? research.competitors
    : [];
  const webFacts = Array.isArray(research?.web) ? research.web : [];

  const hasAnyFindings = Boolean(
    analyst || buyers || competitors.length > 0 || webFacts.length > 0
  );

  const weakestRubricKey = buyers?.weakest ?? null;
  const weakestScore =
    weakestRubricKey && buyers?.rubrics
      ? buyers.rubrics[weakestRubricKey]
      : undefined;

  return (
    <section
      aria-label="What the judges' assistant found"
      className="flex min-h-0 flex-col rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-5"
    >
      <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
          What the judges&apos; assistant found
        </h2>
        {typeof research?.latency_ms === "number" && research.latency_ms > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-[#5F6368]">
            {(research.latency_ms / 1000).toFixed(1)}s
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pr-1">
        {/* In-progress shimmer rows */}
        {runningSteps.length > 0 && (
          <div className="space-y-2">
            {runningSteps.map((status) => (
              <div
                key={status.step}
                className="space-y-1.5 rounded-[12px] border border-[#2A2B30] bg-[#1C1D21]/60 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-medium text-[#E8EAED]">
                    {formatResearchStep(status.step)}
                  </span>
                  <span className="truncate text-[11px] text-[#5F6368]">
                    {status.message || "Running…"}
                  </span>
                </div>
                <div className="founder-shimmer-bar h-[2px] w-full rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!hasAnyFindings && runningSteps.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-[12px] border border-[#2A2B30] bg-[#0E0F11]/40 px-4 py-6 text-center">
            <p className="text-[13px] leading-[1.5] text-[#5F6368]">
              Competitors, web facts, buyer scores, and launch probability will appear here once research runs.
            </p>
          </div>
        )}

        {/* Analyst probability + framing & Buyers weakest rubric side by side / stacked cleanly */}
        {(analyst || buyers) && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {analyst && (
              <div className="founder-fade-in rounded-[12px] border border-[#2A2B30] bg-[#0E0F11]/60 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Analyst
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[26px] font-normal leading-none tabular-nums text-[#E8EAED]">
                    {formatPercent(analyst.probability)}
                  </span>
                  <span className="text-[11px] text-[#9AA0A6]">launch prob</span>
                </div>
                {(analyst.framing || analyst.reason) && (
                  <p className="mt-2 line-clamp-3 text-[12px] leading-[1.4] text-[#9AA0A6]">
                    {analyst.framing || analyst.reason}
                  </p>
                )}
              </div>
            )}

            {buyers && (
              <div className="founder-fade-in rounded-[12px] border border-[#2A2B30] bg-[#0E0F11]/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                    {buyers.n || 200} buyers
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-[#9AA0A6]">
                    {formatPercent(buyers.intent_mean)} intent
                  </span>
                </div>
                {weakestRubricKey && (
                  <div className="mt-2">
                    <div className="text-[11px] text-[#5F6368]">Weakest rubric</div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-medium text-[#F28B82]">
                        {formatRubricLabel(weakestRubricKey)}
                      </span>
                      {weakestScore !== undefined && (
                        <span className="font-mono text-[13px] tabular-nums text-[#F28B82]">
                          {formatPercent(weakestScore)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {buyers.rubrics && Object.keys(buyers.rubrics).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[#5F6368]">
                    {Object.entries(buyers.rubrics)
                      .filter(([key]) => key !== weakestRubricKey)
                      .slice(0, 3)
                      .map(([key, score]) => (
                        <span key={key} className="font-mono tabular-nums">
                          {formatRubricLabel(key).split(" ")[0]} {formatPercent(score)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Competitors */}
        {competitors.length > 0 && (
          <div className="founder-fade-in space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
              Competitors
            </div>
            <ul className="divide-y divide-[#2A2B30] rounded-[12px] border border-[#2A2B30] bg-[#0E0F11]/60">
              {competitors.slice(0, 4).map((comp, idx) => (
                <li
                  key={`${idx}-${comp.title}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]"
                >
                  {comp.url ? (
                    <a
                      href={comp.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center gap-1.5 text-[#E8EAED] transition-colors hover:text-white"
                    >
                      <span className="truncate">{comp.title}</span>
                      <ExternalLink
                        className="h-3 w-3 shrink-0 text-[#5F6368]"
                        strokeWidth={1.5}
                      />
                    </a>
                  ) : (
                    <span className="truncate text-[#E8EAED]">{comp.title}</span>
                  )}
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-[#9AA0A6]">
                    {formatPrice(comp.price_usd)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Web facts (fact + domain) */}
        {webFacts.length > 0 && (
          <div className="founder-fade-in space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
              Web facts
            </div>
            <ul className="space-y-2">
              {webFacts.slice(0, 4).map((item, idx) => {
                const domain = extractDomain(item.url);
                return (
                  <li
                    key={`${idx}-${item.fact}`}
                    className="rounded-[12px] border border-[#2A2B30] bg-[#0E0F11]/60 px-3 py-2"
                  >
                    <p className="text-[12.5px] leading-[1.4] text-[#E8EAED]">
                      {item.fact}
                    </p>
                    {domain && item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-[#5F6368] transition-colors hover:text-[#9AA0A6]"
                      >
                        <span>{domain}</span>
                        <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
