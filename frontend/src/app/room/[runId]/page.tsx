"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { connectRunStream, postRoomSeats } from "@/lib/api";
import type { RoomGateTopic, RunEvent } from "@/lib/contracts";
import { ReplayController, startEventReplay } from "@/lib/replay-engine";
import {
  RoomMicStreamer,
  type RoomMicStats,
  type RoomMicStatus,
} from "@/lib/room-mic";
import {
  RoomTwinManager,
  type TwinSeat,
  type TwinStatus,
} from "@/lib/room-twins";
import { applyRunEvent, createInitialRunState, type RunState } from "@/lib/run-store";
import devRoomSample from "@/dev/room-sample.json";
import { CaptionTicker } from "@/components/room/CaptionTicker";
import { GateLight } from "@/components/room/GateLight";
import { MicPanel } from "@/components/room/MicPanel";
import { RoomTable, type SeatStatusInfo } from "@/components/room/RoomTable";
import { SeatSetup } from "@/components/room/SeatSetup";
import { TypedFallback } from "@/components/room/TypedFallback";

interface InlineError {
  id: string;
  message: string;
}

const DEFAULT_SEATS: TwinSeat[] = [
  { seat: 1, role: "VC partner" },
  { seat: 2, role: "Skeptical CFO" },
];

const DEFAULT_ROLE_BY_SEAT: Record<number, string> = {
  1: "VC partner",
  2: "Skeptical CFO",
  3: "Product lead",
};

function decodeRunId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  return fallback;
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId: rawRunId } = use(params);
  const runId = decodeRunId(rawRunId || "");

  const [isDevSample, setIsDevSample] = useState(false);
  const [seats, setSeats] = useState<TwinSeat[]>(DEFAULT_SEATS);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);

  const [runState, setRunState] = useState<RunState>(() =>
    createInitialRunState(runId)
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "reconnecting" | "error"
  >("disconnected");

  const [micStatus, setMicStatus] = useState<RoomMicStatus>("idle");
  const [micDetail, setMicDetail] = useState<string | undefined>(undefined);
  const [micStats, setMicStats] = useState<RoomMicStats>({
    framesPerSec: 0,
    bytesPerSec: 0,
    level: 0,
  });
  const [manualMuted, setManualMuted] = useState(false);
  const [twinSpeaking, setTwinSpeaking] = useState(false);

  const [seatStatuses, setSeatStatuses] = useState<Record<number, SeatStatusInfo>>(
    {}
  );
  const [liveTranscripts, setLiveTranscripts] = useState<Record<number, string>>(
    {}
  );

  const [gateFlashing, setGateFlashing] = useState(false);
  const [lastGate, setLastGate] = useState<{
    topic: RoomGateTopic;
    latency_ms: number;
    triggered: boolean;
  } | null>(null);

  const [inlineErrors, setInlineErrors] = useState<InlineError[]>([]);
  const [dismissedBackendSeqs, setDismissedBackendSeqs] = useState<number[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<RoomMicStreamer | null>(null);
  const twinsRef = useRef<RoomTwinManager | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const replayCtrlRef = useRef<ReplayController | null>(null);
  const gateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handledGateIdsRef = useRef<Set<string>>(new Set());
  const seenGateIdsRef = useRef<Set<string>>(new Set());
  const handledChallengeIdsRef = useRef<Set<string>>(new Set());
  const prevSeatStatusRef = useRef<Record<number, TwinStatus>>({});
  const mountedRef = useRef(true);

  const pushError = useCallback((message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setInlineErrors((prev) => {
      if (prev.some((e) => e.message === message)) return prev;
      return [...prev, { id, message }];
    });
  }, []);

  const dismissError = useCallback((id: string) => {
    setInlineErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    setIsDevSample(searchParams.get("dev") === "1");
  }, []);

  const stopEverything = useCallback(() => {
    if (gateTimerRef.current) {
      clearTimeout(gateTimerRef.current);
      gateTimerRef.current = null;
    }
    if (streamCleanupRef.current) {
      try {
        streamCleanupRef.current();
      } catch {
        // Ignore cleanup errors
      }
      streamCleanupRef.current = null;
    }
    if (replayCtrlRef.current) {
      try {
        replayCtrlRef.current.stop();
      } catch {
        // Ignore cleanup errors
      }
      replayCtrlRef.current = null;
    }
    if (micRef.current) {
      try {
        micRef.current.stop();
      } catch {
        // Ignore cleanup errors
      }
      micRef.current = null;
    }
    if (twinsRef.current) {
      try {
        twinsRef.current.disconnectAll();
      } catch {
        // Ignore cleanup errors
      }
      twinsRef.current = null;
    }
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx.state !== "closed") {
        void ctx.close().catch(() => {
          // Ignore close errors
        });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopEverything();
    };
  }, [stopEverything]);

  const startEventSource = useCallback(
    (useDevSample: boolean) => {
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }
      if (replayCtrlRef.current) {
        replayCtrlRef.current.stop();
        replayCtrlRef.current = null;
      }

      if (useDevSample) {
        setConnectionStatus("disconnected");
        replayCtrlRef.current = startEventReplay(
          devRoomSample.events as RunEvent[],
          (evt) => {
            setRunState((prev) => applyRunEvent(prev, evt));
          },
          () => {
            // Replay finished; keep Sample data badge visible
          },
          1
        );
      } else {
        streamCleanupRef.current = connectRunStream(runId, {
          onEvent: (evt) => {
            setRunState((prev) => applyRunEvent(prev, evt));
          },
          onStatusChange: (status) => {
            setConnectionStatus(status);
          },
          onErrorMessage: (msg) => {
            pushError(`Run stream error: ${msg}`);
          },
        });
      }
    },
    [pushError, runId]
  );

  const handleStartRoom = useCallback(async () => {
    if (starting) return;
    setStarting(true);

    const normalizedSeats: TwinSeat[] = seats.map((s) => ({
      seat: s.seat,
      role: s.role.trim() || DEFAULT_ROLE_BY_SEAT[s.seat] || `Judge ${s.seat}`,
    }));
    setSeats(normalizedSeats);

    // Reset tracking refs and room state for a fresh session
    handledGateIdsRef.current.clear();
    seenGateIdsRef.current.clear();
    handledChallengeIdsRef.current.clear();
    prevSeatStatusRef.current = {};
    setSeatStatuses(
      Object.fromEntries(
        normalizedSeats.map((s) => [s.seat, { status: "idle" as TwinStatus }])
      )
    );
    setLiveTranscripts({});
    setLastGate(null);
    setGateFlashing(false);
    setDismissedBackendSeqs([]);
    setRunState(createInitialRunState(runId));

    // 1. Create and resume AudioContext on the user click
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      await ctx.resume();
      if (!mountedRef.current) {
        void ctx.close().catch(() => {});
        return;
      }
      audioCtxRef.current = ctx;
    } catch (err) {
      pushError(
        `Audio initialization failed (typed fallback still works): ${formatError(
          err,
          "Could not start AudioContext"
        )}`
      );
    }

    // 2. Register judge seats with the backend (continue if this fails)
    try {
      await postRoomSeats(runId, { seats: normalizedSeats });
    } catch (err) {
      pushError(
        `Could not save seats to backend: ${formatError(
          err,
          "Request failed"
        )}`
      );
    }

    if (!mountedRef.current) {
      return;
    }

    // 3. Create RoomMicStreamer and RoomTwinManager, wire onTwinSpeaking -> mic.setTwinSpeaking
    if (ctx) {
      try {
        const mic = new RoomMicStreamer({
          runId,
          onStatus: (status, detail) => {
            setMicStatus(status);
            setMicDetail(detail);
          },
          onStats: (stats) => {
            setMicStats(stats);
          },
        });
        micRef.current = mic;

        const twins = new RoomTwinManager({
          runId,
          seats: normalizedSeats,
          audioContext: ctx,
          onSeatStatus: (seat, status, detail) => {
            const prevStatus = prevSeatStatusRef.current[seat];
            prevSeatStatusRef.current[seat] = status;
            if (status === "speaking" && prevStatus !== "speaking") {
              setLiveTranscripts((prev) => ({ ...prev, [seat]: "" }));
            }
            setSeatStatuses((prev) => ({
              ...prev,
              [seat]: { status, detail },
            }));
          },
          onTwinSpeaking: (speaking) => {
            setTwinSpeaking(speaking);
            try {
              micRef.current?.setTwinSpeaking(speaking);
            } catch {
              // Ignore mic mute errors if mic stopped
            }
          },
          onTwinTranscript: (seat, text) => {
            setLiveTranscripts((prev) => ({ ...prev, [seat]: text }));
          },
        });
        twinsRef.current = twins;

        void mic.start(ctx).catch((err) => {
          pushError(
            `Mic start failed: ${formatError(err, "Microphone unavailable")}`
          );
        });

        void twins.connectAll().catch((err) => {
          pushError(
            `Judge twins failed to connect: ${formatError(
              err,
              "Connection failed"
            )}`
          );
        });
      } catch (err) {
        pushError(
          `Audio pipeline setup failed: ${formatError(err, "Setup error")}`
        );
      }
    }

    setStarted(true);
    setStarting(false);
    startEventSource(isDevSample);
  }, [isDevSample, pushError, runId, seats, startEventSource, starting]);

  // React to NEW room_gate events
  useEffect(() => {
    if (!started) return;

    const gates = Object.values(runState.roomGates);
    for (const gate of gates) {
      if (!seenGateIdsRef.current.has(gate.utterance_id)) {
        seenGateIdsRef.current.add(gate.utterance_id);
        setLastGate({
          topic: gate.topic,
          latency_ms: gate.latency_ms,
          triggered: gate.triggered,
        });
      }

      if (!gate.triggered) continue;
      if (handledGateIdsRef.current.has(gate.utterance_id)) continue;

      const utterance = runState.roomUtterances.find(
        (u) => u.utterance_id === gate.utterance_id
      );
      if (!utterance) continue;

      handledGateIdsRef.current.add(gate.utterance_id);

      setGateFlashing(true);
      if (gateTimerRef.current) {
        clearTimeout(gateTimerRef.current);
      }
      gateTimerRef.current = setTimeout(() => {
        setGateFlashing(false);
      }, 1800);

      try {
        twinsRef.current?.handleTriggeredGate(
          utterance.text,
          gate.utterance_id,
          gate.topic
        );
      } catch (err) {
        pushError(
          `Failed to dispatch gate to twins: ${formatError(
            err,
            "Dispatch error"
          )}`
        );
      }
    }
  }, [started, runState.roomGates, runState.roomUtterances, pushError]);

  // React to NEW twin_challenge events with source === "server" and audio_url
  useEffect(() => {
    if (!started) return;

    for (const challenge of runState.twinChallenges) {
      if (handledChallengeIdsRef.current.has(challenge.challenge_id)) continue;
      handledChallengeIdsRef.current.add(challenge.challenge_id);

      if (challenge.source === "server" && challenge.audio_url) {
        const audioUrl = challenge.audio_url;
        if (twinsRef.current) {
          void twinsRef.current.playServerChallenge(audioUrl).catch((err) => {
            pushError(
              `Server audio playback failed: ${formatError(
                err,
                "Could not play challenge audio"
              )}`
            );
          });
        }
      }
    }
  }, [started, runState.twinChallenges, pushError]);

  const handleToggleMute = useCallback(() => {
    const next = !manualMuted;
    setManualMuted(next);
    try {
      micRef.current?.setManualMute(next);
    } catch (err) {
      pushError(
        `Failed to toggle mute: ${formatError(err, "Mic unavailable")}`
      );
    }
  }, [manualMuted, pushError]);

  const handleReplaySample = useCallback(() => {
    if (!isDevSample) return;
    handledGateIdsRef.current.clear();
    seenGateIdsRef.current.clear();
    handledChallengeIdsRef.current.clear();
    setLastGate(null);
    setGateFlashing(false);
    setLiveTranscripts({});
    setRunState(createInitialRunState(runId));
    startEventSource(true);
  }, [isDevSample, runId, startEventSource]);

  const visibleBackendErrors = runState.errors.filter(
    (e) => !dismissedBackendSeqs.includes(e.seq)
  );

  if (!started) {
    return (
      <SeatSetup
        runId={runId}
        seats={seats}
        onChangeSeats={setSeats}
        onStart={() => void handleStartRoom()}
        starting={starting}
        isDevSample={isDevSample}
        errors={inlineErrors.map((e) => e.message)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stage-grid flex flex-col justify-between px-4 py-5 sm:px-8 sm:py-6">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-xl font-bold tracking-tight text-white sm:text-2xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Judges&apos; Table
            </h1>

            <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-zinc-400">
              {runId}
            </span>

            {isDevSample ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 font-mono text-xs font-medium text-amber-200">
                  Sample data
                </span>
                <button
                  type="button"
                  onClick={handleReplaySample}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-zinc-300 transition hover:bg-white/[0.1]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Replay</span>
                </button>
              </div>
            ) : (
              <span className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1018]/90 px-3 py-1 font-mono text-xs text-zinc-400">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connectionStatus === "connected"
                      ? "bg-emerald-400"
                      : connectionStatus === "connecting" ||
                        connectionStatus === "reconnecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-rose-500"
                  }`}
                />
                <span>{connectionStatus}</span>
              </span>
            )}
          </div>

          <GateLight isFlashing={gateFlashing} lastGate={lastGate} />
        </header>

        {/* Inline non-fatal error strip */}
        {(inlineErrors.length > 0 || visibleBackendErrors.length > 0) && (
          <div className="space-y-2">
            {inlineErrors.map((err) => (
              <div
                key={err.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{err.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => dismissError(err.id)}
                  aria-label="Dismiss error"
                  className="rounded-lg p-1 text-rose-300 hover:bg-rose-500/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {visibleBackendErrors.map((err) => (
              <div
                key={err.seq}
                className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{err.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDismissedBackendSeqs((prev) => [...prev, err.seq])
                  }
                  aria-label="Dismiss backend error"
                  className="rounded-lg p-1 text-rose-300 hover:bg-rose-500/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main judges table */}
        <RoomTable
          seats={seats}
          seatStatuses={seatStatuses}
          twinChallenges={runState.twinChallenges}
          liveTranscripts={liveTranscripts}
        />

        {/* Bottom area: Caption ticker + calm control strip */}
        <div className="space-y-3">
          <CaptionTicker
            roomCaption={runState.roomCaption}
            utterances={runState.roomUtterances}
          />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <MicPanel
              status={micStatus}
              detail={micDetail}
              stats={micStats}
              manualMuted={manualMuted}
              twinSpeaking={twinSpeaking}
              onToggleMute={handleToggleMute}
            />
            <TypedFallback runId={runId} seats={seats} />
          </div>
        </div>
      </div>
    </div>
  );
}
