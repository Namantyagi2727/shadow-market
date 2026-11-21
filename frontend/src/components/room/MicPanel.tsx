"use client";

import React from "react";
import { Mic, MicOff } from "lucide-react";
import type { RoomMicStats, RoomMicStatus } from "@/lib/room-mic";

export interface MicPanelProps {
  status: RoomMicStatus;
  detail?: string;
  stats: RoomMicStats;
  manualMuted: boolean;
  twinSpeaking: boolean;
  onToggleMute: () => void;
}

const STATUS_DOT: Record<RoomMicStatus, string> = {
  idle: "bg-zinc-500",
  starting: "bg-amber-400 animate-pulse",
  listening: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]",
  muted: "bg-amber-400",
  reconnecting: "bg-amber-400 animate-pulse",
  error: "bg-rose-500",
  stopped: "bg-zinc-600",
};

export function MicPanel({
  status,
  detail,
  stats,
  manualMuted,
  twinSpeaking,
  onToggleMute,
}: MicPanelProps) {
  const clampedLevel = Math.min(1, Math.max(0, Number.isFinite(stats.level) ? stats.level : 0));
  const levelPct = Math.round(clampedLevel * 100);
  const kbPerSec = (stats.bytesPerSec / 1024).toFixed(1);

  const statusText =
    status === "muted"
      ? manualMuted
        ? "Muted"
        : twinSpeaking
        ? "Paused (twin speaking)"
        : "Muted"
      : status;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0d1018]/90 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} />
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-200">
            Mic: {statusText}
          </span>
        </div>

        {/* Level meter */}
        <div className="flex min-w-[140px] flex-1 items-center gap-3 sm:max-w-[220px]">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                manualMuted || status === "muted"
                  ? "bg-amber-400/50"
                  : "bg-emerald-400"
              }`}
              style={{ width: `${levelPct}%` }}
            />
          </div>
        </div>

        {/* Small rate telemetry */}
        <div className="font-mono text-[11px] text-zinc-500">
          {stats.framesPerSec} fps · {kbPerSec} KB/s
        </div>

        {/* Manual mute toggle */}
        <button
          type="button"
          onClick={onToggleMute}
          className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
            manualMuted
              ? "border-amber-400/50 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
              : "border-white/15 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]"
          }`}
        >
          {manualMuted ? (
            <>
              <MicOff className="h-4 w-4 text-amber-300" />
              <span>Unmute mic</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 text-emerald-400" />
              <span>Mute mic</span>
            </>
          )}
        </button>
      </div>

      {status === "error" && detail && (
        <div className="font-mono text-xs text-rose-300">{detail}</div>
      )}
    </div>
  );
}
