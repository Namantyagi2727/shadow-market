"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DemoRunSummary, Stage } from "@/lib/contracts";
import { connectRunStream, fetchDemoRuns, fetchRunEvents } from "@/lib/api";
import { ReplayController, startEventReplay } from "@/lib/replay-engine";
import {
  applyRunEvent,
  createInitialRunState,
  PersonaState,
  RunState,
} from "@/lib/run-store";
import { TopStageBar } from "./TopStageBar";
import { PitchStage } from "./PitchStage";
import { BoardroomStage } from "./BoardroomStage";
import { BuildStage } from "./BuildStage";
import { UsabilityLabStage } from "./UsabilityLabStage";
import { SwarmStage } from "./SwarmStage";
import { VerdictStage } from "./VerdictStage";
import { HotseatModal } from "./HotseatModal";

export function StageWorkspace() {
  const [runState, setRunState] = useState<RunState>(() => createInitialRunState(null));
  const [mode, setMode] = useState<"idle" | "live" | "replay">("idle");
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "reconnecting" | "error"
  >("disconnected");
  const [selectedStage, setSelectedStage] = useState<Stage>("pitch");
  const [autoFollow, setAutoFollow] = useState(true);
  const [dismissedErrors, setDismissedErrors] = useState<number[]>([]);

  const [demoRuns, setDemoRuns] = useState<DemoRunSummary[]>([]);
  const [demoRunsLoading, setDemoRunsLoading] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);

  const [hotseatPersonaId, setHotseatPersonaId] = useState<string | null>(null);

  const disconnectWsRef = useRef<(() => void) | null>(null);
  const replayCtrlRef = useRef<ReplayController | null>(null);

  const stopActiveStreams = useCallback(() => {
    if (disconnectWsRef.current) {
      disconnectWsRef.current();
      disconnectWsRef.current = null;
    }
    if (replayCtrlRef.current) {
      replayCtrlRef.current.stop();
      replayCtrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopActiveStreams();
    };
  }, [stopActiveStreams]);

  // Auto-follow live stage transitions unless user manually clicked another tab
  useEffect(() => {
    if (autoFollow) {
      setSelectedStage(runState.currentStage);
    }
  }, [runState.currentStage, autoFollow]);

  const loadDemoRuns = useCallback(async () => {
    setDemoRunsLoading(true);
    try {
      const runs = await fetchDemoRuns();
      setDemoRuns(runs);
    } catch {
      setDemoRuns([]);
    } finally {
      setDemoRunsLoading(false);
    }
  }, []);

  const connectLiveRun = useCallback(
    (runId: string) => {
      stopActiveStreams();
      setMode("live");
      setAutoFollow(true);
      setDismissedErrors([]);
      setHotseatPersonaId(null);
      setRunState(createInitialRunState(runId));
      setSelectedStage("pitch");

      disconnectWsRef.current = connectRunStream(runId, {
        onEvent: (event) => {
          setRunState((prev) => applyRunEvent(prev, event));
        },
        onStatusChange: (status) => {
          setConnectionStatus(status);
        },
      });
    },
    [stopActiveStreams]
  );

  const startReplayRun = useCallback(
    async (runId: string) => {
      stopActiveStreams();
      setMode("replay");
      setConnectionStatus("disconnected");
      setAutoFollow(true);
      setDismissedErrors([]);
      setHotseatPersonaId(null);
      setReplaySpeed(1);
      setRunState(createInitialRunState(runId));
      setSelectedStage("pitch");

      try {
        const events = await fetchRunEvents(runId);
        replayCtrlRef.current = startEventReplay(
          events,
          (evt) => {
            setRunState((prev) => applyRunEvent(prev, evt));
          },
          () => {
            // Replay complete — keep Replay banner visible so audience always knows it's a replay
          },
          1
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load events for replay";
        setRunState((prev) =>
          applyRunEvent(prev, {
            type: "error",
            seq: Date.now(),
            ts: new Date().toISOString(),
            stage: prev.currentStage,
            data: { message: msg, recoverable: true },
          })
        );
      }
    },
    [stopActiveStreams]
  );

  // Support deep-linking ?run=<id> or ?replay=<id>
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const replayId = params.get("replay");
    const liveId = params.get("run");
    if (replayId) {
      void startReplayRun(replayId);
    } else if (liveId) {
      connectLiveRun(liveId);
    }
  }, [connectLiveRun, startReplayRun]);

  const handleNewRun = () => {
    stopActiveStreams();
    setMode("idle");
    setConnectionStatus("disconnected");
    setAutoFollow(true);
    setDismissedErrors([]);
    setHotseatPersonaId(null);
    setRunState(createInitialRunState(null));
    setSelectedStage("pitch");
  };

  const handleSelectStage = (stage: Stage) => {
    setSelectedStage(stage);
    setAutoFollow(stage === runState.currentStage);
  };

  const handleChangeReplaySpeed = (speed: number) => {
    setReplaySpeed(speed);
    replayCtrlRef.current?.setSpeed(speed);
  };

  const handleFlushReplay = () => {
    replayCtrlRef.current?.flushAll();
  };

  const visibleErrors = runState.errors.filter((e) => !dismissedErrors.includes(e.seq));

  const activeHotseatPersona: PersonaState | null =
    hotseatPersonaId && runState.personas[hotseatPersonaId]
      ? runState.personas[hotseatPersonaId]
      : null;

  return (
    <div className="min-h-screen bg-stage-grid flex flex-col">
      <TopStageBar
        runId={runState.runId}
        mode={mode}
        connectionStatus={connectionStatus}
        currentStage={runState.currentStage}
        selectedStage={selectedStage}
        visitedStages={runState.visitedStages}
        highestStageIndex={runState.highestStageIndex}
        autoFollow={autoFollow}
        onSelectStage={handleSelectStage}
        onEnableAutoFollow={() => {
          setAutoFollow(true);
          setSelectedStage(runState.currentStage);
        }}
        demoRuns={demoRuns}
        demoRunsLoading={demoRunsLoading}
        onRefreshDemoRuns={loadDemoRuns}
        onStartReplay={(id) => void startReplayRun(id)}
        onExitReplay={handleNewRun}
        replaySpeed={replaySpeed}
        onChangeReplaySpeed={handleChangeReplaySpeed}
        onFlushReplay={handleFlushReplay}
        onNewRun={handleNewRun}
        errors={visibleErrors}
        onDismissError={(seq) => setDismissedErrors((prev) => [...prev, seq])}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
        {selectedStage === "pitch" && (
          <PitchStage
            runId={runState.runId}
            pitch={runState.pitch}
            isReplay={mode === "replay"}
            onRunCreated={connectLiveRun}
          />
        )}

        {selectedStage === "boardroom" && (
          <BoardroomStage
            runId={runState.runId}
            turns={runState.boardroomTurns}
            spec={runState.spec}
          />
        )}

        {selectedStage === "build" && (
          <BuildStage
            runId={runState.runId}
            buildMessages={runState.buildMessages}
            mvp={runState.mvp}
            competitors={runState.competitors}
          />
        )}

        {selectedStage === "lab" && (
          <UsabilityLabStage
            runId={runState.runId}
            personas={runState.personas}
            personaOrder={runState.personaOrder}
            onOpenHotseat={(persona) => setHotseatPersonaId(persona.persona_id)}
          />
        )}

        {selectedStage === "swarm" && (
          <SwarmStage
            progress={runState.swarmProgress}
            result={runState.swarmResult}
          />
        )}

        {(selectedStage === "verdict" || selectedStage === "reality") && (
          <VerdictStage
            runId={runState.runId}
            verdict={runState.verdict}
            voteTally={runState.voteTally}
            focusReality={selectedStage === "reality"}
          />
        )}
      </main>

      {/* Footer telemetry bar */}
      <footer className="border-t border-white/[0.07] bg-[#07080d]/80 py-3">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 font-mono text-[11px] text-zinc-500 sm:px-6">
          <div className="flex items-center gap-3">
            <span>SHADOW MARKET • GEMINI 4 NYC</span>
            {runState.eventCount > 0 && (
              <span className="text-zinc-400">{runState.eventCount} events received</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <a href="/spikes" className="hover:text-zinc-300">
              Spikes Harness
            </a>
            {runState.runId && (
              <a
                href={`/vote/${encodeURIComponent(runState.runId)}`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300"
              >
                Open Phone Vote Page
              </a>
            )}
          </div>
        </div>
      </footer>

      {/* Live Gemini 3.8 Voice Hot-Seat Modal */}
      {runState.runId && activeHotseatPersona && (
        <HotseatModal
          runId={runState.runId}
          persona={activeHotseatPersona}
          onClose={() => setHotseatPersonaId(null)}
        />
      )}
    </div>
  );
}
