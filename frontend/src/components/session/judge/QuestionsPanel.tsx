"use client";

import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  FileText,
  Globe,
  LineChart,
  Maximize2,
  Mic,
  Minimize2,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { C, extractStat } from "./charts";
import {
  formatSourceLabel,
  type JudgeQuestion,
  type ResearchStepInfo,
} from "./types";

interface QuestionsPanelProps {
  questions: JudgeQuestion[];
  researchSteps: ResearchStepInfo[];
  /** When true, all questions are shown in full (the parent hides "What we found" to make room). */
  showAll?: boolean;
  onToggleShowAll?: () => void;
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
  const s = source.trim().toLowerCase();
  if (s === "buyers" || s === "analyst") {
    const m = stat.match(/^(\d+(?:\.\d+)?)%$/);
    if (m && parseFloat(m[1]) < 30) return C.red;
  }
  return C.text;
}

function SourceChip({ source }: { source: string }) {
  const Icon = getSourceIcon(source);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] border border-[#2A2B30] bg-[#16171A] px-2 py-0.5 text-[11px] font-medium text-[#9AA0A6]">
      <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {formatSourceLabel(source)}
    </span>
  );
}

export function QuestionsPanel({
  questions,
  researchSteps,
  showAll = false,
  onToggleShowAll,
}: QuestionsPanelProps) {
  const activeStep = researchSteps.find((s) => s.state === "running") ?? null;
  const [focused, setFocused] = useState(0);

  // Keep the focused index valid when questions change.
  useEffect(() => {
    if (focused >= questions.length) setFocused(0);
  }, [questions.length, focused]);

  // Keyboard: 1/2/3 focus a question, A toggles "see all".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= questions.length) setFocused(n - 1);
      if ((e.key === "a" || e.key === "A") && onToggleShowAll) onToggleShowAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions.length, onToggleShowAll]);

  return (
    <section aria-label="Questions worth asking" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-2.5 flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-[13px] font-medium text-[#9AA0A6]">Questions worth asking</h1>
        {questions.length > 0 && onToggleShowAll && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2B30] px-3 py-1 text-[12px] text-[#9AA0A6] transition-colors hover:border-[#3F414A] hover:text-[#E8EAED]"
            title="Keyboard: A"
          >
            {showAll ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {showAll ? "Back to findings" : `See all ${questions.length} in full`}
          </button>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[14px] border border-[#2A2B30] bg-[#16171A] px-8 text-center">
          <p className="text-[22px] font-normal tracking-[-0.015em] text-[#E8EAED]">Listening to the pitch…</p>
          <div className="judge-shimmer-bar mt-4 h-[2px] w-48 rounded-full" aria-hidden="true" />
          {activeStep && (
            <p className="mt-3 text-[13px] text-[#9AA0A6]">
              {activeStep.message || `Running ${activeStep.label.toLowerCase()}…`}
            </p>
          )}
        </div>
      ) : (
        <div className={`flex min-h-0 flex-1 flex-col gap-2 ${showAll ? "" : "overflow-hidden"}`}>
          {questions.map((item, idx) => {
            const open = showAll || idx === focused;
            const stat = item.evidence ? extractStat(item.evidence) : null;
            const statColor = stat ? getStatColor(stat, item.source) : C.text;

            return (
              <article
                key={`${item.id}-${idx}`}
                onClick={() => !showAll && setFocused(idx)}
                className={`judge-fade-in rounded-[14px] border px-4 transition-colors ${
                  open
                    ? "border-[#3F414A] bg-[#16171A] py-3"
                    : "cursor-pointer border-[#2A2B30] bg-[#121316] py-2.5 hover:border-[#3F414A]"
                } ${showAll ? "flex min-h-0 flex-1 flex-col" : open ? "shrink" : "shrink-0"}`}
                style={{ animationDelay: `${idx * 80}ms` }}
                aria-expanded={open}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-label={`Question ${idx + 1}`}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
                      open ? "bg-[#4285F4] text-[#0E0F11]" : "border border-[#2A2B30] bg-[#1C1D21] text-[#9AA0A6]"
                    }`}
                  >
                    {idx + 1}
                  </span>

                  <h2
                    className={`min-w-0 flex-1 tracking-[-0.01em] ${
                      open
                        ? "text-[19px] leading-[1.3] text-[#E8EAED]"
                        : "line-clamp-2 text-[15px] leading-[1.35] text-[#C4C7CC]"
                    }`}
                    title={open ? undefined : item.question}
                  >
                    {item.question}
                  </h2>

                  {stat && (
                    <span
                      className={`shrink-0 font-medium tabular-nums leading-none ${open ? "text-[26px]" : "text-[18px]"}`}
                      style={{ color: statColor }}
                      title={item.evidence}
                    >
                      {stat}
                    </span>
                  )}
                  {!open && (
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[#5F6368]" aria-hidden="true" />
                  )}
                </div>

                {open && (item.why || item.evidence) && (
                  <div className="mt-2 space-y-1.5 pl-10">
                    {item.evidence && (
                      <div className="flex items-start gap-2">
                        <p className={`min-w-0 flex-1 text-[13px] leading-[1.4] text-[#E8EAED] ${showAll ? "line-clamp-3" : "line-clamp-2"}`} title={item.evidence}>
                          {item.evidence}
                        </p>
                        <SourceChip source={item.source} />
                      </div>
                    )}
                    {item.why && (
                      <p className="line-clamp-1 text-[12px] leading-[1.35] text-[#9AA0A6]" title={item.why}>
                        <span className="mr-1.5 text-[#5F6368]">Why</span>
                        {item.why}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!showAll && questions.length > 1 && (
            <p className="shrink-0 text-[11px] text-[#5F6368]">Click a question or press 1–{questions.length} · A to see all in full</p>
          )}
        </div>
      )}
    </section>
  );
}
