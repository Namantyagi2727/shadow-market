"use client";

import React, { useState } from "react";
import {
  FileText,
  Globe,
  LineChart,
  Mic,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BigStat, C, extractStat } from "./charts";
import {
  formatSourceLabel,
  type JudgeQuestion,
  type ResearchStepInfo,
} from "./types";

interface QuestionsPanelProps {
  questions: JudgeQuestion[];
  researchSteps: ResearchStepInfo[];
}

const SOURCE_ICONS: Record<string, LucideIcon> = {
  competitors: Store,
  web: Globe,
  buyers: Users,
  analyst: LineChart,
  pitch: Mic,
};

function getSourceIcon(source: string): LucideIcon {
  return SOURCE_ICONS[source.trim().toLowerCase()] ?? FileText;
}

function getStatColor(stat: string, source: string): string {
  const normalizedSource = source.trim().toLowerCase();
  if (normalizedSource === "buyers" || normalizedSource === "analyst") {
    const pctMatch = stat.match(/^(\d+(?:\.\d+)?)%$/);
    if (pctMatch) {
      const num = parseFloat(pctMatch[1]);
      if (Number.isFinite(num) && num < 30) {
        return C.red;
      }
    }
  }
  return C.text;
}

export function QuestionsPanel({
  questions,
  researchSteps,
}: QuestionsPanelProps) {
  const activeStep = researchSteps.find((s) => s.state === "running") ?? null;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section
      aria-label="Questions worth asking"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mb-2.5 flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
          Questions worth asking
        </h1>
        {questions.length > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-[#5F6368]">
            {questions.length} ready
          </span>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[14px] border border-[#2A2B30] bg-[#16171A] px-8 text-center">
          <p className="text-[22px] font-normal tracking-[-0.015em] text-[#E8EAED]">
            Listening to the pitch…
          </p>
          <div
            className="judge-shimmer-bar mt-4 h-[2px] w-48 rounded-full"
            aria-hidden="true"
          />
          {activeStep && (
            <p className="mt-3 text-[13px] text-[#9AA0A6]">
              {activeStep.message || `Running ${activeStep.label.toLowerCase()}…`}
            </p>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
          {questions.map((item, idx) => {
            const cardKey = `${item.id}-${idx}`;
            const whyKey = `${cardKey}:why`;
            const evidenceKey = `${cardKey}:evidence`;
            const isWhyOpen = Boolean(expanded[whyKey]);
            const isEvidenceOpen = Boolean(expanded[evidenceKey]);
            const stat = item.evidence ? extractStat(item.evidence) : null;
            const SourceIcon = getSourceIcon(item.source);

            return (
              <article
                key={`${item.id}-${item.question}`}
                className="judge-fade-in flex items-start gap-3.5 rounded-[14px] border border-[#2A2B30] bg-[#16171A] px-4 py-3"
                style={{ animationDelay: `${idx * 90}ms` }}
              >
                <span
                  aria-label={`Question ${idx + 1}`}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#2A2B30] bg-[#1C1D21] text-[15px] font-semibold tabular-nums text-[#E8EAED]"
                >
                  {idx + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[20px] font-normal leading-[1.28] tracking-[-0.015em] text-[#E8EAED]">
                    {item.question}
                  </h2>

                  {item.why && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(whyKey)}
                      aria-expanded={isWhyOpen}
                      title={isWhyOpen ? "Click to collapse" : item.why}
                      className={`mt-1 block w-full cursor-pointer text-left text-[13px] font-normal leading-[1.35] text-[#9AA0A6] transition-colors hover:text-[#E8EAED] ${
                        isWhyOpen ? "" : "line-clamp-1"
                      }`}
                    >
                      <span className="mr-1.5 font-medium text-[#5F6368]">
                        Why
                      </span>
                      {item.why}
                    </button>
                  )}

                  {item.evidence && (
                    <div className="mt-2 flex items-center gap-3 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-2">
                      {stat && (
                        <div className="shrink-0 border-r border-[#2A2B30] pr-3">
                          <BigStat
                            value={stat}
                            color={getStatColor(stat, item.source)}
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleExpanded(evidenceKey)}
                        aria-expanded={isEvidenceOpen}
                        title={
                          isEvidenceOpen ? "Click to collapse" : item.evidence
                        }
                        className={`min-w-0 flex-1 cursor-pointer text-left text-[13px] font-normal leading-[1.35] text-[#E8EAED] transition-colors hover:text-white ${
                          isEvidenceOpen ? "" : "line-clamp-2"
                        }`}
                      >
                        {item.evidence}
                      </button>

                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] border border-[#2A2B30] bg-[#16171A] px-2 py-1 text-[11px] font-medium text-[#9AA0A6]">
                        <SourceIcon
                          className="h-3 w-3 shrink-0 text-[#9AA0A6]"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span>{formatSourceLabel(item.source)}</span>
                      </span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
