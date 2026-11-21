"use client";

import React from "react";
import type { RoomGateTopic } from "@/lib/contracts";

export interface GateLightProps {
  isFlashing: boolean;
  lastGate: {
    topic: RoomGateTopic;
    latency_ms: number;
    triggered: boolean;
  } | null;
}

export function GateLight({ isFlashing, lastGate }: GateLightProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-full border px-4 py-2 transition-colors duration-300 ${
        isFlashing
          ? "border-amber-400/60 bg-amber-500/15"
          : "border-white/10 bg-[#0d1018]/90"
      }`}
    >
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        {isFlashing && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-80" />
        )}
        <span
          className={`relative inline-flex h-3 w-3 rounded-full transition-colors duration-300 ${
            isFlashing
              ? "bg-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.95)]"
              : lastGate?.triggered
              ? "bg-amber-400/65"
              : "bg-zinc-600"
          }`}
        />
      </span>

      <span className="font-mono text-xs uppercase tracking-widest text-zinc-300">
        Gate
      </span>

      {lastGate ? (
        <span className="flex items-center gap-2 font-mono text-xs text-zinc-400">
          <span
            className={`rounded px-1.5 py-0.5 ${
              isFlashing || lastGate.triggered
                ? "bg-amber-500/15 text-amber-200"
                : "bg-white/[0.05] text-zinc-400"
            }`}
          >
            {lastGate.topic}
          </span>
          <span className="text-zinc-500">{lastGate.latency_ms} ms</span>
        </span>
      ) : (
        <span className="font-mono text-xs text-zinc-500">standby</span>
      )}
    </div>
  );
}
