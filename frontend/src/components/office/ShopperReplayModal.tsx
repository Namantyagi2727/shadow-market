"use client";

import React, { useRef } from "react";
import {
  AlertTriangle,
  Clock,
  Film,
  Mic,
  UserCheck,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { resolveArtifactUrl } from "@/lib/contracts";
import { PersonaState } from "@/lib/run-store";

interface ShopperReplayModalProps {
  runId: string | null;
  persona: PersonaState;
  onClose: () => void;
  onInterview: (persona: PersonaState) => void;
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ShopperReplayModal({
  runId,
  persona,
  onClose,
  onInterview,
}: ShopperReplayModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resolvedVideoUrl = resolveArtifactUrl(runId, persona.video_url);

  const seekTo = (t: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, t);
    void videoRef.current.play().catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0d1018] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                persona.status === "quit"
                  ? "border-rose-400/40 bg-rose-500/15 text-rose-300"
                  : persona.status === "converted"
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                  : "border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
              }`}
            >
              {persona.status === "quit" ? (
                <UserX className="h-5 w-5" />
              ) : (
                <UserCheck className="h-5 w-5" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className="text-lg font-bold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {persona.name}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    persona.status === "quit"
                      ? "bg-rose-500/20 text-rose-300"
                      : persona.status === "converted"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-cyan-500/20 text-cyan-200"
                  }`}
                >
                  {persona.status}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {persona.role} • {persona.device}
                {persona.duration_s !== null ? ` • ${persona.duration_s.toFixed(1)}s` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {runId && (
              <button
                onClick={() => onInterview(persona)}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(244,63,94,0.35)] transition hover:bg-rose-400"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>Interview Live</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-5">
          {persona.quit_reason && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-100">
              <span className="font-mono text-[10px] font-bold uppercase text-rose-300">
                Quit Reason:{" "}
              </span>
              &ldquo;{persona.quit_reason}&rdquo;
            </div>
          )}

          {/* Session Video */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            {resolvedVideoUrl ? (
              <video
                ref={videoRef}
                key={resolvedVideoUrl}
                src={resolvedVideoUrl}
                controls
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <Film className="h-8 w-8 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-300">
                  No <code className="text-zinc-200">.webm</code> recording attached to this run
                </p>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                  In a live backend run, the headless Chromium session video plays here and seeks
                  when you click any quit marker below.
                </p>
              </div>
            )}
          </div>

          {/* Quit & Confusion Markers */}
          {persona.markers.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber-400">
                Confusion &amp; Quit Markers
              </div>
              <div className="space-y-1.5">
                {persona.markers.map((marker, idx) => {
                  const isQuit = marker.kind === "quit";
                  return (
                    <button
                      key={idx}
                      onClick={() => seekTo(marker.t)}
                      className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left text-xs transition ${
                        isQuit
                          ? "border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20"
                          : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20"
                      }`}
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                          isQuit ? "bg-rose-500/30 text-rose-100" : "bg-amber-500/30 text-amber-100"
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
                          <span className={isQuit ? "text-rose-200" : "text-amber-200"}>
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

          {/* Action Log */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              <Clock className="h-3 w-3" />
              <span>Think-Aloud &amp; Actions ({persona.actions.length})</span>
            </div>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/50 p-3">
              {persona.actions.length === 0 ? (
                <p className="text-xs text-zinc-500">No actions recorded yet.</p>
              ) : (
                persona.actions.map((act, idx) => (
                  <div
                    key={idx}
                    onClick={() => seekTo(act.t)}
                    className="cursor-pointer rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs hover:border-white/15"
                  >
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="text-zinc-500">{act.t.toFixed(1)}s</span>
                      <span className="uppercase text-cyan-300">{act.action}</span>
                      <span className="truncate text-zinc-200">{act.target}</span>
                    </div>
                    {act.thought && (
                      <p className="mt-0.5 italic text-zinc-400">&ldquo;{act.thought}&rdquo;</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
