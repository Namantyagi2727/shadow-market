"use client";

import React from "react";
import {
  Check,
  Code2,
  MessageSquare,
  Mic,
  MonitorPlay,
  Radio,
  Scale,
  Users,
  Wrench,
} from "lucide-react";
import {
  MODEL_LEGEND,
  type LiveStageId,
  type StageTimelineInfo,
} from "./types";

interface AgentTimelineProps {
  timeline: StageTimelineInfo[];
  selectedStage: LiveStageId;
  autoFollow: boolean;
  onSelectStage: (stage: LiveStageId) => void;
  onToggleAuto: () => void;
}

function StageIcon({
  id,
  className,
}: {
  id: LiveStageId;
  className?: string;
}) {
  switch (id) {
    case "pitch":
      return <Mic className={className} strokeWidth={1.5} />;
    case "boardroom":
      return <MessageSquare className={className} strokeWidth={1.5} />;
    case "build":
      return <Code2 className={className} strokeWidth={1.5} />;
    case "lab":
      return <MonitorPlay className={className} strokeWidth={1.5} />;
    case "swarm":
      return <Users className={className} strokeWidth={1.5} />;
    case "verdict":
      return <Scale className={className} strokeWidth={1.5} />;
    case "iterate":
      return <Wrench className={className} strokeWidth={1.5} />;
    case "room":
      return <Radio className={className} strokeWidth={1.5} />;
  }
}

export function AgentTimeline({
  timeline,
  selectedStage,
  autoFollow,
  onSelectStage,
  onToggleAuto,
}: AgentTimelineProps) {
  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-r border-[#2A2B30] bg-[#0E0F11]">
      <div className="flex items-center justify-between px-6 pb-3 pt-5">
        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
          Agent timeline
        </span>
        <button
          type="button"
          onClick={onToggleAuto}
          aria-pressed={autoFollow}
          className={`flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-[12px] font-medium transition-colors duration-200 ${
            autoFollow
              ? "border-[#2A2B30] bg-[#1C1D21] text-[#E8EAED]"
              : "border-transparent bg-transparent text-[#5F6368] hover:border-[#2A2B30] hover:text-[#9AA0A6]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              autoFollow ? "bg-[#81C995]" : "bg-[#5F6368]"
            }`}
            aria-hidden="true"
          />
          <span>Auto</span>
        </button>
      </div>

      <nav
        aria-label="Run stages"
        className="flex-1 overflow-y-auto px-3 pb-4"
      >
        <ul className="space-y-1">
          {timeline.map((item) => {
            const isSelected = selectedStage === item.id;
            const isPending = item.status === "pending";
            const isActive = item.status === "active";
            const isDone = item.status === "done";

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectStage(item.id)}
                  aria-current={isSelected ? "step" : undefined}
                  className={`group relative flex w-full flex-col overflow-hidden rounded-[12px] border px-3.5 py-2.5 text-left transition-colors duration-200 ${
                    isSelected
                      ? "border-[#2A2B30] bg-[#16171A]"
                      : "border-transparent bg-transparent hover:bg-[#16171A]/60"
                  }`}
                >
                  <div className="flex w-full items-center gap-3">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isDone ? (
                        <Check
                          className="h-4 w-4 text-[#81C995]"
                          strokeWidth={1.75}
                        />
                      ) : (
                        <StageIcon
                          id={item.id}
                          className={`h-4 w-4 transition-colors ${
                            isActive
                              ? "text-[#E8EAED]"
                              : isPending
                              ? "text-[#5F6368]"
                              : "text-[#9AA0A6]"
                          }`}
                        />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-[13px] ${
                            isActive || isSelected
                              ? "font-medium text-[#E8EAED]"
                              : isPending
                              ? "font-normal text-[#5F6368]"
                              : "font-normal text-[#E8EAED]"
                          }`}
                        >
                          {item.label}
                        </span>

                        {item.durationLabel ? (
                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#5F6368]">
                            {item.durationLabel}
                          </span>
                        ) : null}
                      </div>

                      <p
                        className={`mt-0.5 truncate text-[12px] leading-[1.35] ${
                          isPending ? "text-[#5F6368]" : "text-[#9AA0A6]"
                        }`}
                      >
                        {item.statusLine}
                      </p>
                    </div>
                  </div>

                  {isActive && (
                    <span
                      className="live-shimmer-bar absolute inset-x-0 bottom-0 h-[2px]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-[#2A2B30] px-6 py-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
          Gemini stack
        </div>
        <dl className="space-y-1">
          {MODEL_LEGEND.map((entry) => (
            <div
              key={entry.model}
              className="flex items-baseline justify-between gap-3 text-[11px]"
            >
              <dt className="shrink-0 font-mono text-[#9AA0A6]">
                {entry.model}
              </dt>
              <dd className="truncate text-right text-[#5F6368]">
                {entry.role}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
