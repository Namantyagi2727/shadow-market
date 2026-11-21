"use client";

import React from "react";
import { AlertCircle, Check } from "lucide-react";
import type { ResearchStepInfo } from "./types";

interface ResearchStripProps {
  steps: ResearchStepInfo[];
}

export function ResearchStrip({ steps }: ResearchStripProps) {
  return (
    <section
      aria-label="Research status"
      className="shrink-0 border-t border-[#2A2B30] bg-[#0E0F11] px-6 py-4"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
          Research
        </h2>
      </div>

      <ul className="space-y-1.5">
        {steps.map((step) => {
          const isRunning = step.state === "running";
          const isDone = step.state === "done";
          const isFailed = step.state === "failed";

          return (
            <li
              key={step.id}
              className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-[10px] border px-3 py-1.5 ${
                isRunning
                  ? "border-[#2A2B30] bg-[#16171A]"
                  : "border-transparent bg-[#16171A]/45"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {isDone ? (
                    <Check
                      className="h-3.5 w-3.5 text-[#81C995]"
                      strokeWidth={2}
                    />
                  ) : isFailed ? (
                    <AlertCircle
                      className="h-3.5 w-3.5 text-[#F28B82]"
                      strokeWidth={1.75}
                    />
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isRunning
                          ? "judge-pulse-dot bg-[#E8EAED]"
                          : "bg-[#5F6368]"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </span>

                <span
                  className={`shrink-0 text-[13px] ${
                    isRunning || isDone
                      ? "font-medium text-[#E8EAED]"
                      : isFailed
                      ? "font-medium text-[#F28B82]"
                      : "font-normal text-[#5F6368]"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              <span
                className={`truncate text-right text-[12px] ${
                  isFailed
                    ? "text-[#F28B82]"
                    : isRunning
                    ? "text-[#9AA0A6]"
                    : "text-[#5F6368]"
                }`}
              >
                {step.message ||
                  (isDone
                    ? "Done"
                    : isRunning
                    ? "Running…"
                    : isFailed
                    ? "Failed"
                    : "Waiting")}
              </span>

              {isRunning && (
                <span
                  className="judge-shimmer-bar absolute inset-x-0 bottom-0 h-[2px]"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
