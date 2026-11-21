"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pause, Play, RotateCcw } from "lucide-react";
import { fetchRunEvents } from "@/lib/api";
import { STAGES, type RunEvent, type Stage } from "@/lib/contracts";
import {
  applyRunEvent,
  createInitialRunState,
  type RunState,
} from "@/lib/run-store";
import { Office3D } from "@/components/office3d";

const DEFAULT_RUN_ID = "r_9828b9cf";
const REPLAY_SPEED = 4;

function getEventDelayMs(prev: RunEvent | null, next: RunEvent): number {
  if (!prev || !prev.ts || !next.ts) return 350;
  const prevMs = Date.parse(prev.ts);
  const nextMs = Date.parse(next.ts);
  if (Number.isNaN(prevMs) || Number.isNaN(nextMs)) return 350;
  const scaled = Math.max(0, nextMs - prevMs) / REPLAY_SPEED;
  return Math.min(Math.max(scaled, 120), 3200);
}

function Office3DPreviewInner() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("run")?.trim() || DEFAULT_RUN_ID;

  const [events, setEvents] = useState<RunEvent[]>([]);
  const [cursor, setCursor] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [stageOverride, setStageOverride] = useState<Stage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlaying(false);
    setStageOverride(null);

    fetchRunEvents(runId)
      .then((loaded) => {
        if (cancelled) return;
        setEvents(loaded);
        // Load complete run immediately so the diorama is populated on first view
        setCursor(loaded.length);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEvents([]);
        setCursor(0);
        setError(
          err instanceof Error
            ? err.message
            : "Could not fetch events for this run."
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const runState: RunState = useMemo(() => {
    let state = createInitialRunState(runId);
    const slice = events.slice(0, cursor);
    for (const evt of slice) {
      state = applyRunEvent(state, evt);
    }
    return state;
  }, [runId, events, cursor]);

  // Step through events using their original timing ×4
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!playing || events.length === 0) return;
    if (cursor >= events.length) {
      setPlaying(false);
      return;
    }

    const prev = cursor > 0 ? events[cursor - 1] : null;
    const next = events[cursor];
    const delay = getEventDelayMs(prev, next);

    timerRef.current = setTimeout(() => {
      setStageOverride(null);
      setCursor((c) => Math.min(c + 1, events.length));
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, cursor, events]);

  const handleTogglePlay = useCallback(() => {
    if (events.length === 0) return;
    setStageOverride(null);
    if (playing) {
      setPlaying(false);
      return;
    }
    if (cursor >= events.length) {
      setCursor(0);
    }
    setPlaying(true);
  }, [events.length, playing, cursor]);

  const handleRestart = useCallback(() => {
    if (events.length === 0) return;
    setStageOverride(null);
    setCursor(0);
    setPlaying(true);
  }, [events.length]);

  const handleStageSelect = (stage: Stage) => {
    setPlaying(false);
    setStageOverride(stage);
    // If events exist for this stage, jump cursor to the last event of that stage
    const lastIdx = events.reduce(
      (acc, evt, idx) => (evt.stage === stage ? idx : acc),
      -1
    );
    if (lastIdx >= 0) {
      setCursor(lastIdx + 1);
    }
  };

  const activeStage: Stage = stageOverride ?? runState.currentStage;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#10131b]">
      {/* Full-screen 3D Office */}
      <div className="h-full w-full">
        <Office3D
          runState={runState}
          activeStage={activeStage}
          isSampleData
          onOpenHotseat={() => alert("hot-seat")}
        />
      </div>

      {/* Compact Replay Controls (bottom-right) */}
      <div className="pointer-events-auto fixed bottom-4 right-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-[#0d1017]/90 px-3 py-2 text-xs text-zinc-200 shadow-2xl backdrop-blur-md">
        <span className="font-mono text-[10px] text-zinc-400">
          run: <strong className="text-zinc-200">{runId}</strong>
        </span>

        <button
          type="button"
          onClick={handleTogglePlay}
          disabled={loading || events.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1 font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {playing ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              <span>Play ×4</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleRestart}
          disabled={loading || events.length === 0}
          title="Restart replay from event 0"
          className="rounded-lg border border-white/15 bg-white/[0.06] p-1.5 text-zinc-300 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <label className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase text-zinc-400">
            Stage
          </span>
          <select
            value={activeStage}
            onChange={(e) => handleStageSelect(e.target.value as Stage)}
            className="rounded-lg border border-white/15 bg-[#151923] px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-400"
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.step}. {s.label}
              </option>
            ))}
          </select>
        </label>

        <span className="font-mono text-[10px] text-zinc-400">
          {loading
            ? "Loading…"
            : error
            ? "Offline (empty building)"
            : `${cursor}/${events.length} evts`}
        </span>
      </div>
    </div>
  );
}

export default function Office3DPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#10131b] font-mono text-xs text-zinc-400">
          Loading 3D Office preview…
        </div>
      }
    >
      <Office3DPreviewInner />
    </Suspense>
  );
}
