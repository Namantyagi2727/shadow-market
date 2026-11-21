"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { DemoRunSummary, RunEvent, Stage } from "@/lib/contracts";
import { connectRunStream, fetchDemoRuns, fetchRunEvents } from "@/lib/api";
import { ReplayController, startEventReplay } from "@/lib/replay-engine";
import {
  applyRunEvent,
  createInitialRunState,
  PersonaState,
  RunState,
} from "@/lib/run-store";
import devSampleRun from "@/dev/sample-run.json";
import devV2Sample from "@/dev/v2-sample.json";
import { TopStageBar, ViewMode } from "./TopStageBar";
import { PitchStage } from "./PitchStage";
import { BoardroomStage } from "./BoardroomStage";
import { BuildStage } from "./BuildStage";
import { UsabilityLabStage } from "./UsabilityLabStage";
import { SwarmStage } from "./SwarmStage";
import { VerdictStage } from "./VerdictStage";
import { V2Card } from "./V2Card";
import { HotseatModal } from "./HotseatModal";
import { OfficeScene } from "./office/OfficeScene";
import { TeleprompterCard } from "./TeleprompterCard";

export function StageWorkspace() {
  const [runState, setRunState] = useState<RunState>(() => createInitialRunState(null));
  const [mode, setMode] = useState<"idle" | "live" | "replay">("idle");
  const [isSampleData, setIsSampleData] = useState(false);
  const [showDevSample, setShowDevSample] = useState(
    process.env.NODE_ENV === "development"
  );
  const [viewMode, setViewMode] = useState<ViewMode>("classic");
  const [showDetailPanel, setShowDetailPanel] = useState(true);

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
  const [dismissedBriefChallengeId, setDismissedBriefChallengeId] = useState<string | null>(null);

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
      setIsSampleData(false);
      setAutoFollow(true);
      setDismissedErrors([]);
      setHotseatPersonaId(null);
      setDismissedBriefChallengeId(null);
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
      setIsSampleData(false);
      setConnectionStatus("disconnected");
      setAutoFollow(true);
      setDismissedErrors([]);
      setHotseatPersonaId(null);
      setDismissedBriefChallengeId(null);
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
            // Replay complete — keep Replay badge visible
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

  const startDevSampleReplay = useCallback(() => {
    stopActiveStreams();
    setMode("replay");
    setIsSampleData(true);
    setConnectionStatus("disconnected");
    setAutoFollow(true);
    setDismissedErrors([]);
    setHotseatPersonaId(null);
    setDismissedBriefChallengeId(null);
    setReplaySpeed(1);
    setRunState(createInitialRunState(devSampleRun.run_id));
    setSelectedStage("pitch");

    replayCtrlRef.current = startEventReplay(
      devSampleRun.events as RunEvent[],
      (evt) => {
        setRunState((prev) => applyRunEvent(prev, evt));
      },
      () => {
        // Keep Replay + Sample data labels visible
      },
      1
    );
  }, [stopActiveStreams]);

  const startDevV2SampleReplay = useCallback(() => {
    stopActiveStreams();
    setMode("replay");
    setIsSampleData(true);
    setConnectionStatus("disconnected");
    setAutoFollow(true);
    setDismissedErrors([]);
    setHotseatPersonaId(null);
    setDismissedBriefChallengeId(null);
    setReplaySpeed(1);
    setRunState(createInitialRunState(devV2Sample.run_id));
    setSelectedStage("iterate");

    replayCtrlRef.current = startEventReplay(
      devV2Sample.events as RunEvent[],
      (evt) => {
        setRunState((prev) => applyRunEvent(prev, evt));
      },
      () => {
        // Keep Replay + Sample data labels visible
      },
      1
    );
  }, [stopActiveStreams]);

  // Support deep-linking ?run=<id>, ?replay=<id>, ?dev=1, ?view=classic|office
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("dev") === "1") {
      setShowDevSample(true);
    }
    const viewParam = params.get("view");
    if (viewParam === "classic" || viewParam === "office") {
      setViewMode(viewParam);
    }
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
    setIsSampleData(false);
    setConnectionStatus("disconnected");
    setAutoFollow(true);
    setDismissedErrors([]);
    setHotseatPersonaId(null);
    setDismissedBriefChallengeId(null);
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

  const latestFounderBrief =
    runState.founderBriefs.length > 0
      ? runState.founderBriefs[runState.founderBriefs.length - 1]
      : null;
  const activeFounderBrief =
    latestFounderBrief &&
    latestFounderBrief.challenge_id !== dismissedBriefChallengeId
      ? latestFounderBrief
      : null;

  const renderStageDetail = () => {
    switch (selectedStage) {
      case "pitch":
        return (
          <PitchStage
            runId={runState.runId}
            pitch={runState.pitch}
            isReplay={mode === "replay"}
            onRunCreated={connectLiveRun}
          />
        );
      case "boardroom":
        return (
          <BoardroomStage
            runId={runState.runId}
            turns={runState.boardroomTurns}
            spec={runState.spec}
            defaultAutoPlay={viewMode === "classic"}
          />
        );
      case "build":
        return (
          <BuildStage
            runId={runState.runId}
            buildMessages={runState.buildMessages}
            mvp={runState.mvp}
            competitors={runState.competitors}
          />
        );
      case "lab":
        return (
          <UsabilityLabStage
            runId={runState.runId}
            personas={runState.personas}
            personaOrder={runState.personaOrder}
            onOpenHotseat={(persona) => setHotseatPersonaId(persona.persona_id)}
          />
        );
      case "swarm":
        return (
          <SwarmStage
            progress={runState.swarmProgress}
            result={runState.swarmResult}
          />
        );
      case "room": {
        const lastUtterances = runState.roomUtterances.slice(-3);
        const latestChallenge =
          runState.twinChallenges.length > 0
            ? runState.twinChallenges[runState.twinChallenges.length - 1]
            : null;

        return (
          <section className="rounded-2xl border border-white/10 bg-[#0d1018]/90 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Stage 07 — Live Q&amp;A Room</span>
                </div>
                <h2
                  className="mt-0.5 text-xl font-bold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Q&amp;A room live on the judges&apos; laptop
                </h2>
              </div>
              <span className="rounded bg-white/[0.06] px-2.5 py-1 font-mono text-xs text-zinc-300">
                {runState.roomUtterances.length} utterances
              </span>
            </div>

            {/* Latest Twin Challenge */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
                Latest Twin Challenge
              </div>
              {latestChallenge ? (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-amber-400">
                      {latestChallenge.role || `Seat ${latestChallenge.seat}`}
                    </span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
                      {latestChallenge.source}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white leading-relaxed">
                    {latestChallenge.text}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-zinc-400">
                  No AI twin challenges triggered yet.
                </p>
              )}
            </div>

            {/* Last 3 Room Utterances */}
            <div>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                Recent Room Utterances (Last 3)
              </div>
              {lastUtterances.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Waiting for room audio / utterances...
                </p>
              ) : (
                <div className="space-y-2">
                  {lastUtterances.map((utt) => (
                    <div
                      key={utt.utterance_id}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-3"
                    >
                      <span className="rounded bg-white/[0.08] px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 shrink-0">
                        {utt.speaker_label || utt.speaker}
                      </span>
                      <p className="text-xs text-zinc-200 leading-relaxed">
                        {utt.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      }
      case "iterate":
        return <V2Card runState={runState} />;
      case "verdict":
      case "reality":
        return (
          <div className="space-y-6">
            <VerdictStage
              runId={runState.runId}
              verdict={runState.verdict}
              voteTally={runState.voteTally}
              focusReality={selectedStage === "reality"}
            />
            {runState.v2Plan && <V2Card runState={runState} />}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-stage-grid flex flex-col">
      <TopStageBar
        runId={runState.runId}
        mode={mode}
        isSampleData={isSampleData}
        showDevSample={showDevSample}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
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
        onStartDevSampleReplay={startDevSampleReplay}
        onExitReplay={handleNewRun}
        replaySpeed={replaySpeed}
        onChangeReplaySpeed={handleChangeReplaySpeed}
        onFlushReplay={handleFlushReplay}
        onNewRun={handleNewRun}
        errors={visibleErrors}
        onDismissError={(seq) => setDismissedErrors((prev) => [...prev, seq])}
      />

      {showDevSample && (
        <div className="border-b border-purple-500/20 bg-purple-950/20">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-purple-300">
              <FlaskConical className="h-3.5 w-3.5" />
              <span>Dev samples</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startDevSampleReplay}
                className="inline-flex items-center gap-1.5 rounded-md border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-purple-100 transition hover:bg-purple-500/20"
              >
                <FlaskConical className="h-3 w-3 text-purple-300" />
                <span>Sample run (dev)</span>
              </button>
              <button
                type="button"
                onClick={startDevV2SampleReplay}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-100 transition hover:bg-amber-500/20"
              >
                <FlaskConical className="h-3 w-3 text-amber-300" />
                <span>V2 sample (dev)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 px-4 py-6 sm:px-6">
        {viewMode === "office" ? (
          <>
            <OfficeScene
              runState={runState}
              activeStage={selectedStage}
              isSampleData={isSampleData}
              onOpenHotseat={(persona) => setHotseatPersonaId(persona.persona_id)}
            />

            {/* Existing stage components preserved below Office view as the live Detail Panel */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-t border-white/10 pt-4">
                <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">
                  Stage Detail Panel — {selectedStage}
                </span>
                <button
                  onClick={() => setShowDetailPanel((v) => !v)}
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:bg-white/[0.08]"
                >
                  {showDetailPanel ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      <span>Collapse Details</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      <span>Expand Details</span>
                    </>
                  )}
                </button>
              </div>
              {showDetailPanel && renderStageDetail()}
            </div>
          </>
        ) : (
          renderStageDetail()
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

      {/* Founder Co-Pilot Teleprompter Overlay */}
      {activeFounderBrief && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-4xl">
            <TeleprompterCard
              brief={activeFounderBrief}
              onDismiss={() =>
                setDismissedBriefChallengeId(activeFounderBrief.challenge_id)
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
