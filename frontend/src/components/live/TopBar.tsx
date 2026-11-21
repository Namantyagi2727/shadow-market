"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { formatClock } from "./types";
import type { ConnectionStatus, ReplaySpeed } from "./useLiveRun";

const SPEED_OPTIONS: readonly ReplaySpeed[] = [1, 2, 4, 8];

interface TopBarProps {
  runId: string;
  runTitle: string | null;
  mode: "live" | "replay";
  connectionStatus: ConnectionStatus;
  replaySpeed: ReplaySpeed;
  replayComplete: boolean;
  replayProgress: number;
  elapsedMs: number;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onRestartReplay: () => void;
}

export function TopBar({
  runId,
  runTitle,
  mode,
  connectionStatus,
  replaySpeed,
  replayComplete,
  replayProgress,
  elapsedMs,
  onSpeedChange,
  onRestartReplay,
}: TopBarProps) {
  const isConnected = connectionStatus === "connected";
  const isWarning =
    connectionStatus === "connecting" || connectionStatus === "reconnecting";

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-[#2A2B30] bg-[#0E0F11] px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-[15px] font-medium tracking-[-0.01em] text-[#E8EAED]">
          Shadow Market
        </span>
        <span className="h-3.5 w-px shrink-0 bg-[#2A2B30]" aria-hidden="true" />
        <span className="truncate text-[14px] font-normal text-[#9AA0A6]">
          {runTitle || runId}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {mode === "replay" ? (
          <div className="flex items-center gap-2">
            <div
              className="flex items-center rounded-[10px] border border-[#2A2B30] bg-[#16171A] p-0.5"
              role="group"
              aria-label="Replay speed"
            >
              {SPEED_OPTIONS.map((speed) => {
                const active = replaySpeed === speed;
                return (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => onSpeedChange(speed)}
                    className={`rounded-[8px] px-2 py-1 font-mono text-[12px] transition-colors duration-200 ${
                      active
                        ? "bg-[#1C1D21] text-[#E8EAED]"
                        : "text-[#5F6368] hover:text-[#9AA0A6]"
                    }`}
                  >
                    {speed}x
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onRestartReplay}
              className="flex items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#16171A] px-2.5 py-1.5 text-[12px] font-medium text-[#9AA0A6] transition-colors duration-200 hover:bg-[#1C1D21] hover:text-[#E8EAED]"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Restart</span>
            </button>

            <span className="rounded-[10px] border border-[#2A2B30] bg-[#16171A] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
              {replayComplete ? "REPLAY · DONE" : "REPLAY"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-[10px] border border-[#2A2B30] bg-[#16171A] px-2.5 py-1">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? "live-pulse-dot bg-[#81C995]"
                  : isWarning
                  ? "live-pulse-dot bg-[#FDD663]"
                  : "bg-[#F28B82]"
              }`}
              aria-hidden="true"
            />
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#E8EAED]">
              {isConnected
                ? "LIVE"
                : connectionStatus === "reconnecting"
                ? "RECONNECTING"
                : connectionStatus === "connecting"
                ? "CONNECTING"
                : "OFFLINE"}
            </span>
          </div>
        )}

        <span className="w-[46px] text-right font-mono text-[12px] tabular-nums text-[#9AA0A6]">
          {formatClock(elapsedMs)}
        </span>
      </div>

      {mode === "replay" && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#1C1D21]"
          aria-hidden="true"
        >
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{
              width: `${Math.round(replayProgress * 100)}%`,
              background:
                "linear-gradient(90deg, #4285F4 0%, #9B72CB 50%, #D96570 100%)",
            }}
          />
        </div>
      )}
    </header>
  );
}
