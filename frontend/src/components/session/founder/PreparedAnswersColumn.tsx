"use client";

import React from "react";
import type { FounderPrepAnswer, ResearchStatusPayload } from "./types";

interface PreparedAnswersColumnProps {
  answers: FounderPrepAnswer[];
  matchedQuestionId: string | null;
  prepStatus: ResearchStatusPayload | null;
  questionsStatus: ResearchStatusPayload | null;
}

export function PreparedAnswersColumn({
  answers,
  matchedQuestionId,
  prepStatus,
  questionsStatus,
}: PreparedAnswersColumnProps) {
  const isRunning =
    prepStatus?.state === "running" || questionsStatus?.state === "running";
  const runningMessage =
    prepStatus?.state === "running"
      ? prepStatus.message || "Drafting speakable answers…"
      : questionsStatus?.message || "Predicting judge questions…";

  const visibleAnswers = answers.slice(0, 3);

  return (
    <section
      aria-label="Prepared answers"
      className="flex min-h-0 flex-col rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-5"
    >
      <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
          Prepared answers
        </h2>
        {visibleAnswers.length > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-[#5F6368]">
            {visibleAnswers.length} ready
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {isRunning && visibleAnswers.length === 0 && (
          <div className="space-y-2 rounded-[12px] border border-[#2A2B30] bg-[#1C1D21]/60 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="font-medium text-[#E8EAED]">Preparing answers</span>
              <span className="truncate text-[11px] text-[#5F6368]">
                {runningMessage}
              </span>
            </div>
            <div className="founder-shimmer-bar h-[2px] w-full rounded-full" />
          </div>
        )}

        {!isRunning && visibleAnswers.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-[12px] border border-[#2A2B30] bg-[#0E0F11]/40 px-4 py-6 text-center">
            <p className="text-[13px] leading-[1.5] text-[#5F6368]">
              Three prepared answers to likely judge questions will appear here.
            </p>
          </div>
        )}

        {visibleAnswers.map((item, idx) => {
          const isMatched = Boolean(
            matchedQuestionId &&
              item.question_id &&
              item.question_id === matchedQuestionId
          );
          const points = Array.isArray(item.points) ? item.points.slice(0, 2) : [];

          return (
            <article
              key={item.question_id || `prep-${idx}`}
              className={`founder-fade-in rounded-[12px] border p-3.5 transition-colors duration-200 ${
                isMatched
                  ? "border-[#81C995]/60 bg-[#81C995]/[0.07]"
                  : "border-[#2A2B30] bg-[#0E0F11]/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`text-[12px] leading-[1.35] ${
                    isMatched ? "text-[#9AA0A6]" : "text-[#5F6368]"
                  }`}
                >
                  {item.question}
                </p>
                {isMatched && (
                  <span className="shrink-0 rounded-[8px] border border-[#81C995]/40 bg-[#81C995]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#81C995]">
                    Matched
                  </span>
                )}
              </div>

              <p className="mt-2 text-[18px] font-medium leading-[1.3] tracking-[-0.01em] text-[#E8EAED]">
                {item.line}
              </p>

              {points.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {points.map((pt, ptIdx) => (
                    <li
                      key={`${item.question_id}-pt-${ptIdx}`}
                      className="flex items-start gap-2 text-[12.5px] leading-[1.4] text-[#9AA0A6]"
                    >
                      <span
                        className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${
                          isMatched ? "bg-[#81C995]" : "bg-[#5F6368]"
                        }`}
                        aria-hidden="true"
                      />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
