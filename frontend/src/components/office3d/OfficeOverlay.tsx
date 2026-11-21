"use client";

import React, { useRef } from "react";
import {
  AlertTriangle,
  Camera,
  Film,
  Mic,
  Radio,
  UserCheck,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { resolveArtifactUrl, STAGES, type Stage } from "@/lib/contracts";
import type { PersonaState, RunState } from "@/lib/run-store";
import { ROOM_TABS, type RoomId } from "./types";

interface OfficeOverlayProps {
  runState: RunState;
  activeStage: Stage;
  focusedRoom: RoomId;
  autoFollowRoom: RoomId;
  autoFollow: boolean;
  isSampleData: boolean;
  onSelectRoom: (room: RoomId) => void;
  onToggleAutoFollow: () => void;
}

function getLatestEventSummary(runState: RunState): string {
  if (runState.roomCaption) {
    return `Live caption: "${runState.roomCaption}"`;
  }
  if (runState.founderBriefs.length > 0) {
    const brief = runState.founderBriefs[runState.founderBriefs.length - 1];
    return `Teleprompter [${brief.badge}]: ${brief.line}`;
  }
  if (runState.twinChallenges.length > 0) {
    const ch = runState.twinChallenges[runState.twinChallenges.length - 1];
    return `Judge (${ch.role || `Seat ${ch.seat}`}): ${ch.text}`;
  }
  if (runState.verdict) {
    const pct = Math.round(runState.verdict.launch_probability * 100);
    return `Verdict: ${pct}% launch probability — ${runState.verdict.summary}`;
  }
  if (runState.swarmResult) {
    const buyers = Math.round(runState.swarmResult.intent_mean * 200);
    return `Market swarm complete: ${buyers}/200 expected buyers (${Math.round(
      runState.swarmResult.intent_mean * 100
    )}% mean intent)`;
  }
  if (runState.swarmProgress) {
    return `Market swarm: ${runState.swarmProgress.done}/${runState.swarmProgress.total} evaluated`;
  }
  if (runState.personaOrder.length > 0) {
    const finished = runState.personaOrder.filter(
      (id) => runState.personas[id]?.status !== "running"
    ).length;
    const quit = runState.personaOrder.filter(
      (id) => runState.personas[id]?.status === "quit"
    ).length;
    return `Usability lab: ${runState.personaOrder.length} testers (${finished} finished, ${quit} quit)`;
  }
  if (runState.mvp) {
    return `MVP ready: ${runState.mvp.url || "live preview deployed"}`;
  }
  if (runState.buildMessages.length > 0) {
    return `Build: ${
      runState.buildMessages[runState.buildMessages.length - 1].message
    }`;
  }
  if (runState.spec) {
    return `V1 spec locked: ${runState.spec.headline}`;
  }
  if (runState.boardroomTurns.length > 0) {
    const turn = runState.boardroomTurns[runState.boardroomTurns.length - 1];
    return `${turn.speaker}: ${turn.text}`;
  }
  if (runState.pitch) {
    return `Pitch: ${runState.pitch.title}`;
  }
  return "Standing by for live run events…";
}

export function OfficeOverlay({
  runState,
  activeStage,
  focusedRoom,
  autoFollowRoom,
  autoFollow,
  isSampleData,
  onSelectRoom,
  onToggleAutoFollow,
}: OfficeOverlayProps) {
  const stageMeta = STAGES.find((s) => s.id === activeStage);
  const stageLabel = stageMeta ? stageMeta.label : activeStage;
  const lastEventLine = getLatestEventSummary(runState);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4">
      {/* Top Bar: Room Tabs (left) + Replay Badge (right) */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#0d1017]/80 p-1 shadow-lg backdrop-blur-md">
          {ROOM_TABS.map((tab) => {
            const isSelected = focusedRoom === tab.id;
            const isAutoTarget = autoFollowRoom === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectRoom(tab.id)}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  isSelected
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-zinc-300 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: tab.accent,
                    opacity: isSelected || isAutoTarget ? 1 : 0.45,
                  }}
                />
                <span>{tab.label}</span>
                {isAutoTarget && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                    title="Active stage room"
                  />
                )}
              </button>
            );
          })}

          <div className="mx-0.5 h-4 w-px bg-white/10" />

          <button
            type="button"
            onClick={onToggleAutoFollow}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
              autoFollow
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            }`}
            title="Automatically glide camera to the active pipeline stage"
          >
            <Camera className="h-3 w-3" />
            <span>Auto-follow</span>
          </button>
        </div>

        {/* Top-right: Replay badge if isSampleData */}
        {isSampleData && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-[#1a150c]/85 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-300 shadow-lg backdrop-blur-md">
            <Radio className="h-3 w-3" />
            <span>Replay</span>
          </div>
        )}
      </div>

      {/* Bottom-left: One-line live status */}
      <div className="flex items-end justify-between gap-2">
        <div className="pointer-events-auto flex max-w-2xl items-center gap-2.5 rounded-xl border border-white/10 bg-[#0d1017]/80 px-3 py-1.5 text-xs text-zinc-200 shadow-lg backdrop-blur-md">
          <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
            {stageLabel}
          </span>
          <span className="truncate text-zinc-300">{lastEventLine}</span>
        </div>
      </div>
    </div>
  );
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PersonaInspectorModal({
  runId,
  persona,
  onClose,
  onOpenHotseat,
}: {
  runId: string | null;
  persona: PersonaState;
  onClose: () => void;
  onOpenHotseat: (persona: PersonaState) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoUrl = resolveArtifactUrl(runId, persona.video_url);

  const seekTo = (t: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, t);
    void videoRef.current.play().catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0e1118] text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                persona.status === "quit"
                  ? "border-rose-400/40 bg-rose-500/15 text-rose-300"
                  : persona.status === "converted"
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-400/40 bg-amber-500/15 text-amber-300"
              }`}
            >
              {persona.status === "quit" ? (
                <UserX className="h-4 w-4" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{persona.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    persona.status === "quit"
                      ? "bg-rose-500/20 text-rose-300"
                      : persona.status === "converted"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-200"
                  }`}
                >
                  {persona.status}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {persona.role} · {persona.device}
                {persona.duration_s !== null
                  ? ` · ${persona.duration_s.toFixed(1)}s`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {persona.status === "quit" && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHotseat(persona);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition hover:bg-rose-400"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>Interview them</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 overflow-y-auto p-5">
          {persona.quit_reason && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-100">
              <span className="font-mono text-[10px] font-bold uppercase text-rose-300">
                Quit reason:{" "}
              </span>
              &ldquo;{persona.quit_reason}&rdquo;
            </div>
          )}

          {/* Session Recording */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            {videoUrl ? (
              <video
                ref={videoRef}
                key={videoUrl}
                src={videoUrl}
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <Film className="h-7 w-7 text-zinc-600" />
                <p className="mt-2 text-xs text-zinc-400">
                  No session video attached for this tester yet.
                </p>
              </div>
            )}
          </div>

          {/* Markers */}
          {persona.markers.length > 0 && (
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-400">
                Session Markers
              </div>
              <div className="space-y-1.5">
                {persona.markers.map((marker, idx) => {
                  const isQuit = marker.kind === "quit";
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => seekTo(marker.t)}
                      className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left text-xs transition ${
                        isQuit
                          ? "border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20"
                          : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20"
                      }`}
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          isQuit
                            ? "bg-rose-500/30 text-rose-100"
                            : "bg-amber-500/30 text-amber-100"
                        }`}
                      >
                        {formatSeconds(marker.t)}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1 font-mono text-[10px] uppercase">
                          {isQuit ? (
                            <XCircle className="h-3 w-3 text-rose-400" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-amber-400" />
                          )}
                          <span
                            className={
                              isQuit ? "text-rose-200" : "text-amber-200"
                            }
                          >
                            {marker.kind}
                          </span>
                        </div>
                        <p className="mt-0.5 text-zinc-200">{marker.note}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
