"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectRunStream, fetchRunEvents } from "@/lib/api";
import type { RunEvent } from "@/lib/contracts";
import { ReplayController, startEventReplay } from "@/lib/replay-engine";
import {
  applyRunEvent,
  createInitialRunState,
  type RunState,
} from "@/lib/run-store";
import {
  formatDurationCompact,
  formatPrice,
  formatShortModel,
  isLiveStageId,
  LIVE_STAGES,
  type LiveStageId,
  type StageStatus,
  type StageTimelineInfo,
  type V2State,
} from "./types";
import { useV2 } from "./useV2";

export type ReplaySpeed = 1 | 2 | 4 | 8;

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface UseLiveRunOptions {
  runId: string;
  initialReplay: boolean;
  initialSpeed: ReplaySpeed;
}

export interface UseLiveRunResult {
  rawEvents: RunEvent[];
  runState: RunState;
  v2State: V2State;
  analystFraming: string | null;
  mode: "live" | "replay";
  connectionStatus: ConnectionStatus;
  replaySpeed: ReplaySpeed;
  replayComplete: boolean;
  replayProgress: number;
  setReplaySpeed: (speed: ReplaySpeed) => void;
  restartReplay: () => void;
  activeLiveStage: LiveStageId;
  timeline: StageTimelineInfo[];
  elapsedMs: number;
  swarmDurationMs: number | null;
  buildDurationMs: number | null;
  loadError: string | null;
}

function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : parsed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeEventStage(event: RunEvent): LiveStageId | null {
  if (event.type === "stage_changed") {
    const data = asRecord(event.data);
    if (isLiveStageId(data.stage)) {
      return data.stage;
    }
  }
  if (event.type.startsWith("v2_")) return "iterate";
  if (
    event.type === "room_caption" ||
    event.type === "room_utterance" ||
    event.type === "room_gate" ||
    event.type === "twin_challenge" ||
    event.type === "founder_brief"
  ) {
    return "room";
  }
  if (isLiveStageId(event.stage)) return event.stage;
  return null;
}

function extractAnalystFraming(events: readonly RunEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev.type === "verdict") {
      const framing = asRecord(ev.data).analyst_framing;
      if (typeof framing === "string" && framing.trim().length > 0) {
        return framing.trim();
      }
    }
  }
  return null;
}

interface StageBounds {
  startMs: number | null;
  endMs: number | null;
  seen: boolean;
}

function computeStageBounds(events: readonly RunEvent[]): Record<LiveStageId, StageBounds> {
  const bounds: Record<LiveStageId, StageBounds> = {
    pitch: { startMs: null, endMs: null, seen: false },
    boardroom: { startMs: null, endMs: null, seen: false },
    build: { startMs: null, endMs: null, seen: false },
    lab: { startMs: null, endMs: null, seen: false },
    swarm: { startMs: null, endMs: null, seen: false },
    verdict: { startMs: null, endMs: null, seen: false },
    iterate: { startMs: null, endMs: null, seen: false },
    room: { startMs: null, endMs: null, seen: false },
  };

  for (const ev of events) {
    const stage = normalizeEventStage(ev);
    if (!stage) continue;
    const ms = parseTs(ev.ts);
    const entry = bounds[stage];
    entry.seen = true;
    if (ms !== null) {
      if (entry.startMs === null || ms < entry.startMs) entry.startMs = ms;
      if (entry.endMs === null || ms > entry.endMs) entry.endMs = ms;
    }
  }

  return bounds;
}

function deriveActiveLiveStage(events: readonly RunEvent[]): LiveStageId {
  let active: LiveStageId = "pitch";
  for (const ev of events) {
    const stage = normalizeEventStage(ev);
    if (stage) {
      active = stage;
    }
  }
  return active;
}

export function useLiveRun({
  runId,
  initialReplay,
  initialSpeed,
}: UseLiveRunOptions): UseLiveRunResult {
  const mode: "live" | "replay" = initialReplay ? "replay" : "live";

  const [rawEvents, setRawEvents] = useState<RunEvent[]>([]);
  const [runState, setRunState] = useState<RunState>(() => createInitialRunState(runId));
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    mode === "live" ? "connecting" : "disconnected"
  );
  const [replaySpeed, setReplaySpeedState] = useState<ReplaySpeed>(initialSpeed);
  const [replayComplete, setReplayComplete] = useState(false);
  const [totalReplayCount, setTotalReplayCount] = useState(0);
  const [replayNonce, setReplayNonce] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const seenSeqSetRef = useRef<Set<number>>(new Set());
  const replayCtrlRef = useRef<ReplayController | null>(null);
  const replaySpeedRef = useRef<ReplaySpeed>(initialSpeed);
  const liveSessionStartRef = useRef<number>(Date.now());

  const ingestEvent = useCallback((event: RunEvent) => {
    if (!event || typeof event !== "object" || typeof event.type !== "string") return;
    if (typeof event.seq === "number") {
      if (seenSeqSetRef.current.has(event.seq)) return;
      seenSeqSetRef.current.add(event.seq);
    }
    setRawEvents((prev) => {
      if (
        typeof event.seq === "number" &&
        prev.some((existing) => existing.seq === event.seq)
      ) {
        return prev;
      }
      const next = [...prev, event];
      next.sort((a, b) => {
        if (typeof a.seq === "number" && typeof b.seq === "number") {
          return a.seq - b.seq;
        }
        return (parseTs(a.ts) ?? 0) - (parseTs(b.ts) ?? 0);
      });
      return next;
    });
    setRunState((prev) => applyRunEvent(prev, event));
  }, []);

  const setReplaySpeed = useCallback((speed: ReplaySpeed) => {
    replaySpeedRef.current = speed;
    setReplaySpeedState(speed);
    replayCtrlRef.current?.setSpeed(speed);
  }, []);

  const restartReplay = useCallback(() => {
    setReplayNonce((n) => n + 1);
  }, []);

  // Tick elapsed timer smoothly once per second
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Connect live or launch replay
  useEffect(() => {
    let cancelled = false;
    seenSeqSetRef.current = new Set();
    liveSessionStartRef.current = Date.now();
    setRawEvents([]);
    setRunState(createInitialRunState(runId));
    setLoadError(null);
    setReplayComplete(false);
    setTotalReplayCount(0);

    if (replayCtrlRef.current) {
      replayCtrlRef.current.stop();
      replayCtrlRef.current = null;
    }

    if (!runId) {
      setLoadError("Missing run ID.");
      return undefined;
    }

    if (mode === "replay") {
      setConnectionStatus("disconnected");
      const bootReplay = async () => {
        try {
          const events = await fetchRunEvents(runId);
          if (cancelled) return;
          setTotalReplayCount(events.length);
          if (events.length === 0) {
            setReplayComplete(true);
            return;
          }
          replayCtrlRef.current = startEventReplay(
            events,
            (evt) => {
              if (!cancelled) ingestEvent(evt);
            },
            () => {
              if (!cancelled) setReplayComplete(true);
            },
            replaySpeedRef.current
          );
        } catch (err) {
          if (cancelled) return;
          setLoadError(
            err instanceof Error ? err.message : "Unable to load run events for replay."
          );
        }
      };

      void bootReplay();

      return () => {
        cancelled = true;
        if (replayCtrlRef.current) {
          replayCtrlRef.current.stop();
          replayCtrlRef.current = null;
        }
      };
    }

    // Live mode: fetch existing events immediately, then connect stream for updates
    const hydrate = async () => {
      try {
        const existing = await fetchRunEvents(runId);
        if (cancelled) return;
        for (const evt of existing) {
          ingestEvent(evt);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load initial run events."
          );
        }
      }
    };

    void hydrate();

    const disconnect = connectRunStream(runId, {
      onEvent: (evt) => {
        if (!cancelled) {
          setLoadError(null);
          ingestEvent(evt);
        }
      },
      onStatusChange: (status) => {
        if (!cancelled) setConnectionStatus(status);
      },
      onErrorMessage: (message) => {
        if (!cancelled) setLoadError(message);
      },
    });

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [runId, mode, replayNonce, ingestEvent]);

  const v2State = useV2(rawEvents);
  const analystFraming = useMemo(() => extractAnalystFraming(rawEvents), [rawEvents]);
  const stageBounds = useMemo(() => computeStageBounds(rawEvents), [rawEvents]);
  const activeLiveStage = useMemo(() => deriveActiveLiveStage(rawEvents), [rawEvents]);

  const buildDurationMs = useMemo(() => {
    const b = stageBounds.build;
    if (b.startMs !== null && b.endMs !== null && b.endMs >= b.startMs) {
      return b.endMs - b.startMs;
    }
    return null;
  }, [stageBounds]);

  const swarmDurationMs = useMemo(() => {
    const s = stageBounds.swarm;
    if (s.startMs !== null && s.endMs !== null && s.endMs >= s.startMs) {
      return s.endMs - s.startMs;
    }
    return null;
  }, [stageBounds]);

  // Compute timeline status + key fact + duration per stage
  const timeline = useMemo<StageTimelineInfo[]>(() => {
    const personasList = runState.personaOrder
      .map((id) => runState.personas[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const finishedPersonas = personasList.filter((p) => p.status !== "running");
    const quitPersonas = personasList.filter((p) => p.status === "quit");
    const convertedPersonas = personasList.filter((p) => p.status === "converted");

    const stageCompleted: Record<LiveStageId, boolean> = {
      pitch: Boolean(runState.pitch),
      boardroom: Boolean(runState.spec),
      build: Boolean(runState.mvp),
      lab:
        personasList.length > 0 &&
        finishedPersonas.length === personasList.length &&
        (activeLiveStage !== "lab" ||
          personasList.every((p) => p.status !== "running")),
      swarm: Boolean(runState.swarmResult),
      verdict: Boolean(runState.verdict),
      iterate: Boolean(v2State.result),
      room:
        runState.founderBriefs.length > 0 &&
        (mode === "replay" ? replayComplete : false),
    };

    return LIVE_STAGES.map((stage): StageTimelineInfo => {
      const bounds = stageBounds[stage.id];
      const isDone = stageCompleted[stage.id];
      const isActive =
        !isDone &&
        (activeLiveStage === stage.id ||
          (stage.id === "iterate" && v2State.started && !v2State.result) ||
          (stage.id === "room" &&
            (activeLiveStage === "room" ||
              Boolean(runState.roomCaption) ||
              runState.twinChallenges.length > 0 ||
              runState.founderBriefs.length > 0) &&
            !(mode === "replay" && replayComplete)));

      let status: StageStatus = "pending";
      if (isDone) status = "done";
      else if (isActive) status = "active";
      else if (bounds.seen) status = "done";

      // Duration label
      let durationLabel = "";
      if (bounds.startMs !== null && bounds.endMs !== null && bounds.endMs > bounds.startMs) {
        durationLabel = formatDurationCompact(bounds.endMs - bounds.startMs);
      } else if (stage.id === "swarm" && swarmDurationMs !== null) {
        durationLabel = formatDurationCompact(swarmDurationMs);
      }

      // Status line / key fact
      let statusLine = "Pending";

      switch (stage.id) {
        case "pitch": {
          if (runState.pitch) {
            const parts: string[] = [];
            if (runState.pitch.price_usd !== null) {
              parts.push(formatPrice(runState.pitch.price_usd));
            }
            if (runState.pitch.features.length > 0) {
              parts.push(`${runState.pitch.features.length} features`);
            }
            statusLine =
              parts.length > 0
                ? parts.join(" · ")
                : runState.pitch.target_user || "Pitch parsed";
          } else if (status === "active") {
            statusLine = "Extracting structured pitch…";
          }
          break;
        }

        case "boardroom": {
          if (status === "done") {
            const turns = runState.boardroomTurns.length;
            const strategistModel = runState.boardroomTurns.find(
              (t) => t.speaker === "strategist"
            )?.model;
            const skepticModel = runState.boardroomTurns.find(
              (t) => t.speaker === "skeptic"
            )?.model;
            const pair =
              strategistModel && skepticModel
                ? `${formatShortModel(strategistModel)} vs ${formatShortModel(skepticModel)}`
                : "Neon vs Argon";
            statusLine = `${turns} turns · ${pair}`;
          } else if (status === "active") {
            const last = runState.boardroomTurns[runState.boardroomTurns.length - 1];
            if (last) {
              const who = last.speaker === "strategist" ? "Strategist" : "Skeptic";
              statusLine = `Turn ${runState.boardroomTurns.length} · ${who} speaking`;
            } else {
              statusLine = "Opening strategist vs skeptic debate…";
            }
          }
          break;
        }

        case "build": {
          if (runState.mvp) {
            const dur =
              buildDurationMs !== null ? ` · ${formatDurationCompact(buildDurationMs)}` : "";
            statusLine = `MVP built in Google sandbox${dur}`;
          } else if (status === "active") {
            const lastMsg = runState.buildMessages[runState.buildMessages.length - 1];
            statusLine = lastMsg ? lastMsg.message : "Starting managed agent sandbox…";
          }
          break;
        }

        case "lab": {
          if (status === "done" && personasList.length > 0) {
            statusLine =
              quitPersonas.length > 0
                ? `${personasList.length} testers · ${quitPersonas.length} quit`
                : `${personasList.length} testers · ${convertedPersonas.length} bought`;
          } else if (status === "active") {
            if (personasList.length > 0) {
              statusLine = `${finishedPersonas.length}/${personasList.length} testers finished`;
            } else {
              statusLine = "Launching browser personas…";
            }
          }
          break;
        }

        case "swarm": {
          if (runState.swarmResult) {
            const rubricCount = Object.keys(runState.swarmResult.rubrics).length || 5;
            const answers = runState.swarmResult.personas * rubricCount;
            const dur =
              swarmDurationMs !== null && swarmDurationMs > 0
                ? ` · ${(swarmDurationMs / 1000).toFixed(1)} s`
                : "";
            statusLine = `${answers.toLocaleString()} answers${dur}`;
          } else if (status === "active") {
            if (runState.swarmProgress && runState.swarmProgress.total > 0) {
              statusLine = `${runState.swarmProgress.done.toLocaleString()}/${runState.swarmProgress.total.toLocaleString()} calibrated answers`;
            } else {
              statusLine = "Scoring 200 synthetic buyers…";
            }
          }
          break;
        }

        case "verdict": {
          if (runState.verdict) {
            const pct = Math.round(runState.verdict.launch_probability * 100);
            statusLine = `${pct}% launch probability`;
          } else if (status === "active") {
            statusLine = "Calibrating launch probability…";
          }
          break;
        }

        case "iterate": {
          if (v2State.result) {
            const { v1_converted, v2_converted, n } = v2State.result.holdout;
            statusLine = `Held-out ${v1_converted}/${n} → ${v2_converted}/${n}`;
          } else if (status === "active") {
            if (v2State.panel.length > 0) {
              statusLine = `Held-out A/B · ${v2State.panel.length}/12 runs`;
            } else if (v2State.ready) {
              statusLine = "Testing held-out panel on V1 vs V2…";
            } else if (v2State.buildMessages.length > 0) {
              statusLine =
                v2State.buildMessages[v2State.buildMessages.length - 1].message;
            } else if (v2State.plan) {
              statusLine = `Planned ${v2State.plan.fixes.length} fixes · patching…`;
            } else {
              statusLine = "Planning V2 fixes from evidence…";
            }
          }
          break;
        }

        case "room": {
          if (runState.founderBriefs.length > 0 || runState.twinChallenges.length > 0) {
            const c = runState.twinChallenges.length;
            const b = runState.founderBriefs.length;
            statusLine = `${c} ${c === 1 ? "challenge" : "challenges"} · ${b} ${
              b === 1 ? "brief" : "briefs"
            }`;
          } else if (status === "active") {
            statusLine = runState.roomCaption
              ? "Transcribing live Q&A…"
              : "Listening for judge challenges…";
          }
          break;
        }
      }

      return {
        id: stage.id,
        label: stage.label,
        status,
        statusLine,
        durationLabel,
      };
    });
  }, [
    runState,
    v2State,
    stageBounds,
    activeLiveStage,
    buildDurationMs,
    swarmDurationMs,
    mode,
    replayComplete,
  ]);

  // Elapsed time: difference between first and last event (or live running clock if active)
  const elapsedMs = useMemo(() => {
    if (rawEvents.length === 0) return 0;
    const first = parseTs(rawEvents[0]?.ts);
    const last = parseTs(rawEvents[rawEvents.length - 1]?.ts);
    if (first === null) return 0;
    if (mode === "replay" || replayComplete) {
      return last !== null ? Math.max(0, last - first) : 0;
    }
    // In live mode, if the run appears actively streaming (last event within 30s), tick smoothly
    if (last !== null && nowMs - last < 30_000 && connectionStatus === "connected") {
      return Math.max(0, nowMs - first);
    }
    if (last !== null && last >= first) {
      return last - first;
    }
    return Math.max(0, nowMs - liveSessionStartRef.current);
  }, [rawEvents, mode, replayComplete, nowMs, connectionStatus]);

  const replayProgress = useMemo(() => {
    if (mode !== "replay" || totalReplayCount === 0) return 0;
    return Math.min(1, rawEvents.length / totalReplayCount);
  }, [mode, totalReplayCount, rawEvents.length]);

  return {
    rawEvents,
    runState,
    v2State,
    analystFraming,
    mode,
    connectionStatus,
    replaySpeed,
    replayComplete,
    replayProgress,
    setReplaySpeed,
    restartReplay,
    activeLiveStage,
    timeline,
    elapsedMs,
    swarmDurationMs,
    buildDurationMs,
    loadError,
  };
}
