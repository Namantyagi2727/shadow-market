"use client";

import React from "react";
import {
  formatSourceLabel,
  type JudgeQuestion,
  type ResearchStepInfo,
} from "./types";

interface QuestionsPanelProps {
  questions: JudgeQuestion[];
  researchSteps: ResearchStepInfo[];
}

export function QuestionsPanel({
  questions,
  researchSteps,
}: QuestionsPanelProps) {
  const activeStep = researchSteps.find((s) => s.state === "running") ?? null;

  return (
    <section
      aria-label="Questions worth asking"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mb-3.5 flex shrink-0 items-center justify-between gap-4">
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
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto pr-0.5">
          {questions.map((item, idx) => (
            <article
              key={`${item.id}-${item.question}`}
              className="judge-fade-in rounded-[14px] border border-[#2A2B30] bg-[#16171A] px-6 py-4"
              style={{ animationDelay: `${idx * 90}ms` }}
            >
              <h2 className="text-[22px] font-normal leading-[1.32] tracking-[-0.015em] text-[#E8EAED]">
                {item.question}
              </h2>

              {item.why && (
                <p className="mt-2 text-[14px] font-normal leading-[1.45] text-[#9AA0A6]">
                  <span className="mr-2 font-medium text-[#5F6368]">Why</span>
                  {item.why}
                </p>
              )}

              {item.evidence && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-1.5">
                    <span className="text-[13px] font-normal leading-[1.35] text-[#E8EAED]">
                      {item.evidence}
                    </span>
                    <span
                      className="h-3 w-px shrink-0 bg-[#2A2B30]"
                      aria-hidden="true"
                    />
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-[#9AA0A6]">
                      {formatSourceLabel(item.source)}
                    </span>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
