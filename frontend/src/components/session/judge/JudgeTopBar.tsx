"use client";

import React from "react";
import { Mic, MicOff } from "lucide-react";
import type { StreamStatus } from "@/components/session/useSessionEvents";
import type { RoomMicStats, RoomMicStatus } from "@/lib/room-mic";

interface JudgeTopBarProps {
  runId: string;
  streamStatus: StreamStatus;
  micStatus: RoomMicStatus;
  micStats: RoomMicStats;
  micActive: boolean;
  onToggleMic: () => void;
}

function getMicDotClass(status: RoomMicStatus): string {
  switch (status) {
    case "listening":
      return "judge-pulse-dot bg-[#81C995]";
    case "starting":
    case "reconnecting":
    case "muted":
      return "judge-pulse-dot bg-[#FDD663]";
    case "error":
      return "bg-[#F28B82]";
    case "idle":
    case "stopped":
    default:
      return "bg-[#5F6368]";
  }
}

function getMicLabel(status: RoomMicStatus): string {
  switch (status) {
    case "listening":
      return "Mic listening";
    case "starting":
      return "Starting mic";
    case "reconnecting":
      return "Reconnecting mic";
    case "muted":
      return "Mic muted";
    case "error":
      return "Mic error";
    case "stopped":
    case "idle":
    default:
      return "Mic off";
  }
}

export function JudgeTopBar({
  runId,
  streamStatus,
  micStatus,
  micStats,
  micActive,
  onToggleMic,
}: JudgeTopBarProps) {
  const levelPct = Math.round(
    Math.min(1, Math.max(0, Number.isFinite(micStats.level) ? micStats.level : 0)) * 100
  );

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#2A2B30] bg-[#0E0F11] px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-[15px] font-medium tracking-[-0.01em] text-[#E8EAED]">
          Judge&apos;s assistant
        </span>
        <span className="h-3.5 w-px shrink-0 bg-[#2A2B30]" aria-hidden="true" />
        <span className="truncate font-mono text-[13px] text-[#9AA0A6]">
          {runId}
        </span>
        {streamStatus !== "connected" && (
          <span className="rounded-[8px] border border-[#2A2B30] bg-[#16171A] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#9AA0A6]">
            {streamStatus === "connecting"
              ? "Connecting"
              : streamStatus === "reconnecting"
              ? "Reconnecting"
              : "Offline"}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3.5">
        {/* Mic status indicator + subtle input level while listening */}
        <div className="flex items-center gap-2.5 rounded-[10px] border border-[#2A2B30] bg-[#16171A] px-3 py-1.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${getMicDotClass(micStatus)}`}
            aria-hidden="true"
          />
          <span className="text-[12px] font-medium text-[#E8EAED]">
            {getMicLabel(micStatus)}
          </span>
          {micStatus === "listening" && (
            <div
              className="ml-1 h-1.5 w-12 overflow-hidden rounded-full bg-[#2A2B30]"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-[#81C995] transition-[width] duration-100"
                style={{ width: `${Math.max(8, levelPct)}%` }}
              />
            </div>
          )}
        </div>

        {/* Start / Stop mic button (role: judge) */}
        <button
          type="button"
          onClick={onToggleMic}
          className={`flex items-center gap-2 rounded-[10px] border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
            micActive
              ? "border-[#F28B82]/40 bg-[#16171A] text-[#F28B82] hover:bg-[#1C1D21]"
              : "border-[#2A2B30] bg-[#E8EAED] text-[#0E0F11] hover:bg-white"
          }`}
        >
          {micActive ? (
            <>
              <MicOff className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>Stop mic</span>
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>Start mic</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
