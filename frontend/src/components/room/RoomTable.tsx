"use client";

import React from "react";
import type { TwinChallengeData } from "@/lib/contracts";
import type { TwinSeat, TwinStatus } from "@/lib/room-twins";

export interface SeatStatusInfo {
  status: TwinStatus;
  detail?: string;
}

export interface RoomTableProps {
  seats: TwinSeat[];
  seatStatuses: Record<number, SeatStatusInfo>;
  twinChallenges: TwinChallengeData[];
  liveTranscripts: Record<number, string>;
}

const SEAT_STATUS_STYLE: Record<
  TwinStatus,
  { dotClass: string; label: string; textClass: string }
> = {
  idle: {
    dotClass: "bg-zinc-500",
    label: "Idle",
    textClass: "text-zinc-400",
  },
  connecting: {
    dotClass: "bg-amber-400 animate-pulse",
    label: "Connecting",
    textClass: "text-amber-300",
  },
  ready: {
    dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.75)]",
    label: "Ready",
    textClass: "text-emerald-300",
  },
  speaking: {
    dotClass: "bg-cyan-400 animate-pulse shadow-[0_0_14px_rgba(34,211,238,0.9)]",
    label: "Speaking",
    textClass: "text-cyan-300",
  },
  error: {
    dotClass: "bg-rose-500",
    label: "Error",
    textClass: "text-rose-300",
  },
  closed: {
    dotClass: "bg-zinc-600",
    label: "Closed",
    textClass: "text-zinc-500",
  },
};

export function RoomTable({
  seats,
  seatStatuses,
  twinChallenges,
  liveTranscripts,
}: RoomTableProps) {
  const latestBySeat = new Map<number, TwinChallengeData>();
  for (const ch of twinChallenges) {
    latestBySeat.set(ch.seat, ch);
  }

  const gridColsClass =
    seats.length >= 3
      ? "grid-cols-1 lg:grid-cols-3"
      : "grid-cols-1 md:grid-cols-2";

  return (
    <section aria-label="Judge seats around the table" className="flex flex-1 flex-col justify-center gap-6">
      <div className={`grid gap-6 ${gridColsClass}`}>
        {seats.map((seat) => {
          const statusInfo = seatStatuses[seat.seat] ?? { status: "idle" as TwinStatus };
          const statusMeta = SEAT_STATUS_STYLE[statusInfo.status] ?? SEAT_STATUS_STYLE.idle;
          const isSpeaking = statusInfo.status === "speaking";
          const liveText = liveTranscripts[seat.seat]?.trim() || "";
          const latestChallenge = latestBySeat.get(seat.seat);

          // While speaking, show live output transcription if available; otherwise show the Speaking indicator
          const bubbleText = isSpeaking
            ? liveText
            : latestChallenge?.text || liveText || "";

          const showingLiveTranscript = isSpeaking && liveText.length > 0;

          return (
            <div
              key={seat.seat}
              className={`flex flex-col justify-between rounded-3xl border p-6 transition-all duration-300 sm:p-8 ${
                isSpeaking
                  ? "border-cyan-400/55 bg-[#101827] shadow-[0_0_40px_rgba(34,211,238,0.14)]"
                  : "border-white/12 bg-[#0d1018]/95"
              }`}
            >
              {/* Seat header: role name + status dot */}
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs uppercase tracking-widest text-zinc-500">
                      Seat {seat.seat}
                    </div>
                    <h2
                      className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {seat.role}
                    </h2>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusMeta.dotClass}`} />
                    <span className={`font-mono text-xs font-medium ${statusMeta.textClass}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                </div>

                {statusInfo.status === "error" && statusInfo.detail && (
                  <p className="mt-2 font-mono text-xs text-rose-300/90">
                    {statusInfo.detail}
                  </p>
                )}
              </div>

              {/* Speech bubble */}
              <div
                className={`relative mt-6 flex min-h-[180px] flex-col justify-between rounded-2xl border p-6 sm:min-h-[210px] ${
                  isSpeaking
                    ? "border-cyan-400/35 bg-cyan-950/20"
                    : bubbleText
                    ? "border-white/10 bg-[#131824]/90"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                {bubbleText ? (
                  <p className="text-xl font-normal leading-relaxed text-zinc-100 sm:text-2xl">
                    &ldquo;{bubbleText}&rdquo;
                  </p>
                ) : isSpeaking ? (
                  <div className="flex items-center gap-3 text-xl text-cyan-200">
                    <span className="flex items-end gap-1 h-5">
                      <span className="w-1 h-full rounded-full bg-cyan-400 animate-voice-bar" />
                      <span
                        className="w-1 h-full rounded-full bg-cyan-400 animate-voice-bar"
                        style={{ animationDelay: "0.18s" }}
                      />
                      <span
                        className="w-1 h-full rounded-full bg-cyan-400 animate-voice-bar"
                        style={{ animationDelay: "0.36s" }}
                      />
                    </span>
                    <span>Speaking…</span>
                  </div>
                ) : (
                  <p className="text-lg text-zinc-500 sm:text-xl">
                    Listening for a claim to challenge…
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between font-mono text-xs text-zinc-500">
                  <span>
                    {showingLiveTranscript
                      ? "Live voice"
                      : latestChallenge
                      ? latestChallenge.source === "live"
                        ? "Live twin"
                        : "Server voice"
                      : ""}
                  </span>
                  {isSpeaking && (
                    <span className="flex items-center gap-1.5 text-cyan-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                      Active
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtle conference table surface bar */}
      <div className="mx-auto hidden w-full max-w-4xl items-center justify-center md:flex">
        <div className="h-3 w-full rounded-full border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent shadow-[0_-8px_30px_rgba(0,0,0,0.45)]" />
      </div>
    </section>
  );
}
