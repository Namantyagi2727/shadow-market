"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FastForward,
  FlaskConical,
  History,
  LayoutGrid,
  Radio,
  RotateCcw,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { DemoRunSummary, Stage, STAGES } from "@/lib/contracts";
import { RunErrorEntry } from "@/lib/run-store";

export type ViewMode = "office" | "classic";

interface TopStageBarProps {
  runId: string | null;
  mode: "idle" | "live" | "replay";
  isSampleData: boolean;
  showDevSample: boolean;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  connectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting" | "error";
  currentStage: Stage;
  selectedStage: Stage;
  visitedStages: Stage[];
  highestStageIndex: number;
  autoFollow: boolean;
  onSelectStage: (stage: Stage) => void;
  onEnableAutoFollow: () => void;
  demoRuns: DemoRunSummary[];
  demoRunsLoading: boolean;
  onRefreshDemoRuns: () => void;
  onStartReplay: (runId: string) => void;
  onStartDevSampleReplay: () => void;
  onExitReplay: () => void;
  replaySpeed: number;
  onChangeReplaySpeed: (speed: number) => void;
  onFlushReplay: () => void;
  onNewRun: () => void;
  presentationMode?: boolean;
  errors: RunErrorEntry[];
  onDismissError: (seq: number) => void;
}

export function TopStageBar({
  runId,
  mode,
  isSampleData,
  showDevSample,
  viewMode,
  onChangeViewMode,
  connectionStatus,
  currentStage,
  selectedStage,
  visitedStages,
  highestStageIndex,
  autoFollow,
  onSelectStage,
  onEnableAutoFollow,
  demoRuns,
  demoRunsLoading,
  onRefreshDemoRuns,
  onStartReplay,
  onStartDevSampleReplay,
  onExitReplay,
  replaySpeed,
  onChangeReplaySpeed,
  onFlushReplay,
  onNewRun,
  presentationMode = false,
  errors,
  onDismissError,
}: TopStageBarProps) {
  const [replayMenuOpen, setReplayMenuOpen] = useState(false);

  const brandContent = (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.22)]">
        <Radio className="h-4 w-4" />
      </span>
      <div>
        <div
          className="text-sm font-semibold tracking-tight text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          SHADOW MARKET
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
          Launch Survival Lab
        </div>
      </div>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07080d]/92 backdrop-blur-xl">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        {/* Top Row: Brand, Mode Status, View Toggle, Actions */}
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {presentationMode ? (
              <div className="flex items-center gap-2.5 text-left shrink-0">
                {brandContent}
              </div>
            ) : (
              <button
                onClick={onNewRun}
                className="group flex items-center gap-2.5 text-left shrink-0"
                title="Reset to new pitch"
              >
                {brandContent}
              </button>
            )}

            {runId && (
              <span className="hidden items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-zinc-300 xl:inline-flex">
                <span className="text-zinc-500">RUN</span>
                <span>{runId}</span>
              </span>
            )}

            {/* Explicit Replay Label required by contracts/events.md */}
            {mode === "replay" && (
              <div className="flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                <History className="h-3.5 w-3.5" />
                <span>Replay</span>
              </div>
            )}

            {/* Explicit Sample Data Label required when replaying dev sample */}
            {isSampleData && (
              <div className="flex items-center gap-1 rounded-full border border-purple-400/50 bg-purple-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-purple-200">
                <FlaskConical className="h-3 w-3" />
                <span>Sample data</span>
              </div>
            )}

            {mode === "live" && (
              <div
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  connectionStatus === "connected"
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                    : connectionStatus === "reconnecting" || connectionStatus === "connecting"
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                    : "border-rose-400/40 bg-rose-500/15 text-rose-300"
                }`}
              >
                {connectionStatus === "connected" ? (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    <Wifi className="h-3 w-3" />
                    <span>LIVE</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    <span className="uppercase">{connectionStatus}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Office / Classic View Toggle */}
            <div
              role="group"
              aria-label="View mode"
              className="flex items-center rounded-lg border border-white/15 bg-white/[0.04] p-0.5 text-xs"
            >
              <button
                onClick={() => onChangeViewMode("office")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  viewMode === "office"
                    ? "bg-emerald-500 text-zinc-950 font-semibold"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Office</span>
              </button>
              <button
                onClick={() => onChangeViewMode("classic")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  viewMode === "classic"
                    ? "bg-emerald-500 text-zinc-950 font-semibold"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Classic</span>
              </button>
            </div>

            {mode === "replay" && (
              <div
                className={`${
                  presentationMode ? "flex" : "hidden lg:flex"
                } items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 p-1`}
              >
                {[1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => onChangeReplaySpeed(spd)}
                    className={`rounded px-2 py-0.5 font-mono text-xs transition ${
                      replaySpeed === spd
                        ? "bg-amber-400 text-zinc-950 font-semibold"
                        : "text-amber-200/80 hover:bg-amber-400/20"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
                <button
                  onClick={onFlushReplay}
                  className="ml-1 flex items-center gap-1 rounded px-2 py-0.5 text-xs text-amber-200 hover:bg-amber-400/20"
                  title="Jump to end of replay"
                >
                  <FastForward className="h-3 w-3" />
                  <span>End</span>
                </button>
                {!presentationMode && (
                  <button
                    onClick={onExitReplay}
                    className="ml-1 rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/10"
                  >
                    Exit
                  </button>
                )}
              </div>
            )}

            {!autoFollow && mode !== "idle" && (
              <button
                onClick={onEnableAutoFollow}
                className="hidden rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 md:inline-block"
              >
                Follow Live
              </button>
            )}

            {!presentationMode && runId && (
              <button
                onClick={onNewRun}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Pitch</span>
              </button>
            )}

            {/* Cached Demo Runs Fallback (Explicitly labeled Replay fallback) */}
            {!presentationMode && (
              <div className="relative">
                <button
                  onClick={() => {
                    const next = !replayMenuOpen;
                    setReplayMenuOpen(next);
                    if (next) onRefreshDemoRuns();
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-200"
                >
                  <History className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Replay Runs</span>
                </button>

                {replayMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-xl border border-white/15 bg-[#0f131d] p-2 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 px-2 py-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Cached Demo Runs (Fallback)
                      </span>
                      <button
                        onClick={() => setReplayMenuOpen(false)}
                        className="text-zinc-400 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Dev-only Sample Run entry (strictly gated on NODE_ENV=development or ?dev=1) */}
                    {showDevSample && (
                      <div className="mt-1.5 border-b border-white/10 pb-1.5">
                        <button
                          onClick={() => {
                            setReplayMenuOpen(false);
                            onStartDevSampleReplay();
                          }}
                          className="flex w-full items-start gap-2 rounded-lg border border-purple-400/30 bg-purple-500/10 px-2.5 py-2 text-left transition hover:bg-purple-500/20"
                        >
                          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-purple-100">
                              Sample run (dev)
                            </div>
                            <div className="font-mono text-[10px] text-purple-300/80">
                              All 7 stages • 6 personas • Sample data
                            </div>
                          </div>
                        </button>
                      </div>
                    )}

                    <div className="mt-1.5 max-h-64 space-y-1 overflow-y-auto">
                      {demoRunsLoading ? (
                        <div className="px-2 py-4 text-center text-xs text-zinc-400">
                          Loading cached runs...
                        </div>
                      ) : demoRuns.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-zinc-500">
                          No cached runs returned by backend (`GET /api/demo-runs`).
                        </div>
                      ) : (
                        demoRuns.map((run) => (
                          <button
                            key={run.run_id}
                            onClick={() => {
                              setReplayMenuOpen(false);
                              onStartReplay(run.run_id);
                            }}
                            className="flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
                          >
                            <span className="truncate text-xs font-medium text-zinc-100">
                              {run.title || run.run_id}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              {run.run_id}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: 7-Stage Pipeline Rail */}
        <nav
          aria-label="Pipeline stages"
          className="flex items-center gap-1 overflow-x-auto pb-2.5 pt-1"
        >
          {STAGES.map((stage, idx) => {
            const isSelected = selectedStage === stage.id;
            const isLiveCurrent = currentStage === stage.id && mode !== "idle";
            const isCompleted =
              idx < highestStageIndex ||
              (visitedStages.includes(stage.id) && currentStage !== stage.id);

            return (
              <button
                key={stage.id}
                onClick={() => onSelectStage(stage.id)}
                className={`group relative flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isSelected
                    ? "border-emerald-400/50 bg-emerald-500/15 text-white shadow-[0_0_16px_rgba(16,185,129,0.16)]"
                    : isLiveCurrent
                    ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200"
                    : isCompleted
                    ? "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/[0.07]"
                    : "border-transparent bg-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-300"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px] ${
                    isLiveCurrent
                      ? "bg-emerald-400 text-zinc-950 font-bold"
                      : isCompleted
                      ? "text-emerald-400"
                      : isSelected
                      ? "bg-white/20 text-white"
                      : "bg-white/[0.06] text-zinc-500"
                  }`}
                >
                  {isCompleted && !isLiveCurrent ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    stage.step
                  )}
                </span>
                <span>{stage.label}</span>
                {isLiveCurrent && (
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Recoverable / Fatal Error Banners */}
      {errors.length > 0 && (
        <div className="border-t border-rose-500/20 bg-rose-950/40">
          <div className="mx-auto max-w-[1440px] space-y-1 px-4 py-2 sm:px-6">
            {errors.slice(-3).map((err) => (
              <div
                key={err.seq}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-xs ${
                  err.recoverable
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    : "border-rose-500/40 bg-rose-500/15 text-rose-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono uppercase text-[10px] opacity-80">
                    {err.recoverable ? "Warning" : "Error"}
                  </span>
                  <span>{err.message}</span>
                </div>
                <button
                  onClick={() => onDismissError(err.seq)}
                  className="opacity-70 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
