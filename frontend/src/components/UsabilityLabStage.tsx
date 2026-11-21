"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Film,
  Laptop,
  Mic,
  MousePointerClick,
  Smartphone,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { resolveArtifactUrl } from "@/lib/contracts";
import { PersonaState } from "@/lib/run-store";

interface UsabilityLabStageProps {
  runId: string | null;
  personas: Record<string, PersonaState>;
  personaOrder: string[];
  onOpenHotseat: (persona: PersonaState) => void;
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function UsabilityLabStage({
  runId,
  personas,
  personaOrder,
  onOpenHotseat,
}: UsabilityLabStageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const orderedPersonas = useMemo(
    () => personaOrder.map((id) => personas[id]).filter(Boolean),
    [personaOrder, personas]
  );

  // Auto-select first finished quitter, or first persona if user hasn't picked one
  const activePersona = useMemo(() => {
    if (selectedId && personas[selectedId]) return personas[selectedId];
    const firstQuitter = orderedPersonas.find((p) => p.status === "quit");
    return firstQuitter || orderedPersonas[0] || null;
  }, [selectedId, personas, orderedPersonas]);

  const counts = useMemo(() => {
    let running = 0;
    let converted = 0;
    let quit = 0;
    for (const p of orderedPersonas) {
      if (p.status === "converted") converted += 1;
      else if (p.status === "quit") quit += 1;
      else running += 1;
    }
    return { total: orderedPersonas.length, running, converted, quit };
  }, [orderedPersonas]);

  const seekVideoTo = (t: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, t);
    void videoRef.current.play().catch(() => {});
  };

  const resolvedVideoUrl = resolveArtifactUrl(runId, activePersona?.video_url);

  return (
    <div className="space-y-6">
      {/* Summary Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0d1018]/90 px-5 py-4 shadow-xl">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-emerald-400">
            Stage 04 &amp; 05 — Autonomous Usability Lab &amp; Quit Analysis
          </div>
          <h2
            className="mt-0.5 text-xl font-bold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Headless Browser Persona Panel
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-zinc-200">
            <span className="text-zinc-500">PANEL </span>
            <span className="font-bold">{counts.total}</span>
          </div>
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-cyan-200">
            <span className="opacity-70">LIVE </span>
            <span className="font-bold">{counts.running}</span>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">
            <span className="opacity-70">CONVERTED </span>
            <span className="font-bold">{counts.converted}</span>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200">
            <span className="opacity-70">QUIT </span>
            <span className="font-bold">{counts.quit}</span>
          </div>
        </div>
      </div>

      {orderedPersonas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0d1018]/90 py-20 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
          <p className="mt-4 text-sm font-medium text-zinc-200">
            Launching headless Chromium personas...
          </p>
          <p className="mt-1 max-w-md text-xs text-zinc-500">
            Gemini 4 Hydrogen drives each persona across the live MVP using allow-listed browser
            actions and records every session to <code className="text-zinc-300">.webm</code>.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Persona Roster Cards */}
          <div className="lg:col-span-5 space-y-3">
            {orderedPersonas.map((persona) => {
              const isSelected = activePersona?.persona_id === persona.persona_id;
              const latestAction = persona.actions[persona.actions.length - 1];
              const isMobile = /mobile|phone|ios|android/i.test(persona.device);

              return (
                <div
                  key={persona.persona_id}
                  onClick={() => setSelectedId(persona.persona_id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-emerald-400/60 bg-emerald-500/[0.08] shadow-[0_0_24px_rgba(16,185,129,0.14)]"
                      : "border-white/10 bg-[#0d1018]/90 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-white">{persona.name}</h3>
                        <span className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {isMobile ? (
                            <Smartphone className="h-2.5 w-2.5" />
                          ) : (
                            <Laptop className="h-2.5 w-2.5" />
                          )}
                          <span>{persona.device}</span>
                        </span>
                      </div>
                      <p className="truncate text-xs text-zinc-400">{persona.role}</p>
                    </div>

                    <span
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                        persona.status === "converted"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : persona.status === "quit"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-cyan-500/20 text-cyan-200"
                      }`}
                    >
                      {persona.status === "converted" ? (
                        <UserCheck className="h-3 w-3" />
                      ) : persona.status === "quit" ? (
                        <UserX className="h-3 w-3" />
                      ) : (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                      )}
                      <span>{persona.status}</span>
                    </span>
                  </div>

                  {/* Latest Action / Quit Reason */}
                  <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/40 p-2.5 text-xs">
                    {persona.status === "quit" && persona.quit_reason ? (
                      <p className="text-rose-200">
                        <span className="font-mono text-[10px] uppercase text-rose-400">
                          Quit:{" "}
                        </span>
                        &ldquo;{persona.quit_reason}&rdquo;
                      </p>
                    ) : latestAction ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                          <MousePointerClick className="h-3 w-3 text-cyan-400" />
                          <span className="uppercase text-cyan-300">{latestAction.action}</span>
                          <span className="truncate text-zinc-300">{latestAction.target}</span>
                          <span className="ml-auto text-zinc-500">
                            {latestAction.t.toFixed(1)}s
                          </span>
                        </div>
                        {latestAction.thought && (
                          <p className="line-clamp-2 text-[11px] italic text-zinc-300">
                            &ldquo;{latestAction.thought}&rdquo;
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500">Opening MVP landing page...</p>
                    )}
                  </div>

                  {/* Footer: Markers badge + Hot-Seat CTA */}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                      <span>{persona.actions.length} steps</span>
                      {persona.markers.length > 0 && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                          {persona.markers.length} quit markers
                        </span>
                      )}
                    </div>

                    {runId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenHotseat(persona);
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          persona.status === "quit"
                            ? "bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.3)] hover:bg-rose-400"
                            : "border border-white/15 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.12]"
                        }`}
                      >
                        <Mic className="h-3 w-3" />
                        <span>Interview Live</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Replay Theater & Quit-Marker Scrubbing */}
          <section className="lg:col-span-7 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
            {activePersona && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-amber-400">
                      <Film className="h-3.5 w-3.5" />
                      <span>Replay Theater — {activePersona.name}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {activePersona.role} • {activePersona.device}
                      {activePersona.duration_s !== null
                        ? ` • ${activePersona.duration_s.toFixed(1)}s session`
                        : ""}
                    </p>
                  </div>

                  {runId && (
                    <button
                      onClick={() => onOpenHotseat(activePersona)}
                      className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(244,63,94,0.35)] transition hover:bg-rose-400"
                    >
                      <Mic className="h-3.5 w-3.5" />
                      <span>Put {activePersona.name.split(" ")[0]} on Hot-Seat</span>
                    </button>
                  )}
                </div>

                {/* Video Player */}
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
                      <Clock className="h-8 w-8 text-zinc-600" />
                      <p className="mt-3 text-sm text-zinc-300">
                        {activePersona.status === "running"
                          ? "Recording browser session in real time..."
                          : "Video artifact unavailable for this persona"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Live actions and think-aloud stream are updating below.
                      </p>
                    </div>
                  )}
                </div>

                {/* Agentic Video Quit Markers (Gemini 4 Hydrogen) */}
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                      Agentic Video Quit &amp; Confusion Markers (Click to Seek)
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">gemini-4-hydrogen</span>
                  </div>

                  {activePersona.markers.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.07] bg-black/30 px-3.5 py-2.5 text-xs text-zinc-500">
                      {activePersona.status === "running"
                        ? "Quit analysis runs automatically once the session finishes..."
                        : "No confusion or quit timestamps flagged yet."}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activePersona.markers.map((marker, idx) => {
                        const isQuit = marker.kind === "quit";
                        return (
                          <button
                            key={idx}
                            onClick={() => seekVideoTo(marker.t)}
                            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                              isQuit
                                ? "border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20"
                                : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20"
                            }`}
                          >
                            <span
                              className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                                isQuit
                                  ? "bg-rose-500/30 text-rose-100"
                                  : "bg-amber-500/30 text-amber-100"
                              }`}
                            >
                              {formatSeconds(marker.t)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
                                {isQuit ? (
                                  <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                )}
                                <span className={isQuit ? "text-rose-200" : "text-amber-200"}>
                                  {marker.kind}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-zinc-200">{marker.note}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Action & Think-Aloud Timeline */}
                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                    Action &amp; Think-Aloud Log ({activePersona.actions.length})
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/50 p-3">
                    {activePersona.actions.length === 0 ? (
                      <p className="text-xs text-zinc-500">Waiting for first action...</p>
                    ) : (
                      activePersona.actions.map((act, idx) => (
                        <div
                          key={idx}
                          onClick={() => seekVideoTo(act.t)}
                          className="cursor-pointer rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 transition hover:border-white/15"
                        >
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-zinc-500">{act.t.toFixed(1)}s</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-semibold ${
                                act.action === "quit"
                                  ? "bg-rose-500/20 text-rose-300"
                                  : "bg-cyan-500/15 text-cyan-200"
                              }`}
                            >
                              {act.action}
                            </span>
                            <span className="truncate text-zinc-200">{act.target}</span>
                            {act.action !== "quit" && (
                              <CheckCircle2 className="ml-auto h-3 w-3 shrink-0 text-zinc-600" />
                            )}
                          </div>
                          {act.thought && (
                            <p className="mt-1 text-xs italic text-zinc-400">
                              &ldquo;{act.thought}&rdquo;
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
