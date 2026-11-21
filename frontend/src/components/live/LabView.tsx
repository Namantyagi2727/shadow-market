"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import { resolveArtifactUrl } from "@/lib/contracts";
import type { PersonaState } from "@/lib/run-store";

interface LabViewProps {
  runId: string;
  personas: PersonaState[];
  mvpScreenshotUrl: string | null;
  isActive: boolean;
  onInterview: (persona: PersonaState) => void;
}

const GRID_SLOTS = 6;

function statusLabel(status: PersonaState["status"]): string {
  if (status === "converted") return "Bought";
  if (status === "quit") return "Quit";
  return "Working";
}

function statusPillClass(status: PersonaState["status"]): string {
  if (status === "converted") {
    return "border-[#81C995]/30 bg-[#0E0F11]/85 text-[#81C995]";
  }
  if (status === "quit") {
    return "border-[#F28B82]/30 bg-[#0E0F11]/85 text-[#F28B82]";
  }
  return "border-[#FDD663]/30 bg-[#0E0F11]/85 text-[#FDD663]";
}

export function LabView({
  runId,
  personas,
  mvpScreenshotUrl,
  isActive,
  onInterview,
}: LabViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedVideoRef = useRef<HTMLVideoElement | null>(null);

  const posterUrl = resolveArtifactUrl(runId, mvpScreenshotUrl);
  const expandedPersona = expandedId
    ? personas.find((p) => p.persona_id === expandedId) ?? null
    : null;

  useEffect(() => {
    if (!expandedId) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedId]);

  const seekExpandedVideo = (seconds: number) => {
    const vid = expandedVideoRef.current;
    if (!vid) return;
    vid.currentTime = Math.max(0, seconds);
    void vid.play().catch(() => {});
  };

  if (personas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-[#5F6368]">
            Waiting for usability lab sessions…
          </p>
          {isActive && (
            <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  const visibleSlots: (PersonaState | null)[] = Array.from(
    { length: Math.max(GRID_SLOTS, personas.length) },
    (_, idx) => personas[idx] ?? null
  ).slice(0, GRID_SLOTS);

  return (
    <div className="relative flex h-full flex-col overflow-hidden px-6 py-5 lg:px-8">
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-4">
        {visibleSlots.map((persona, slotIndex) => {
          if (!persona) {
            return (
              <div
                key={`empty-${slotIndex}`}
                className="flex items-center justify-center rounded-[16px] border border-[#2A2B30] bg-[#16171A]/50"
              >
                <span className="text-[12px] text-[#5F6368]">
                  Waiting for tester…
                </span>
              </div>
            );
          }

          const videoUrl = resolveArtifactUrl(runId, persona.video_url);
          const isQuit = persona.status === "quit";
          const isRunning = persona.status === "running";
          const lastAction = persona.actions[persona.actions.length - 1];

          return (
            <div
              key={persona.persona_id}
              role="button"
              tabIndex={0}
              onClick={() => setExpandedId(persona.persona_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedId(persona.persona_id);
                }
              }}
              className="group relative flex min-h-0 cursor-pointer flex-col overflow-hidden rounded-[16px] border border-[#2A2B30] bg-[#16171A] text-left transition-colors duration-200 hover:border-[#3F414A] focus:outline-none focus-visible:border-[#E8EAED]"
            >
              {/* Video / Poster layer */}
              <div className="relative flex-1 overflow-hidden bg-[#0E0F11]">
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    poster={posterUrl ?? undefined}
                    muted
                    autoPlay
                    loop
                    playsInline
                    className={`h-full w-full object-cover transition-[filter] duration-300 ${
                      isQuit ? "grayscale brightness-[0.7]" : ""
                    }`}
                  />
                ) : posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={`${persona.name} browsing MVP`}
                    className={`h-full w-full object-cover object-top transition-[filter] duration-300 ${
                      isQuit
                        ? "grayscale brightness-[0.7]"
                        : "opacity-65"
                    }`}
                  />
                ) : (
                  <div className="h-full w-full bg-[#16171A]" />
                )}

                {isRunning && (
                  <div className="live-shimmer-bar absolute inset-x-0 top-0 h-[2px]" />
                )}

                {/* Status pill */}
                <div className="absolute right-3 top-3">
                  <span
                    className={`inline-flex items-center rounded-[10px] border px-2.5 py-0.5 text-[11px] font-medium ${statusPillClass(
                      persona.status
                    )}`}
                  >
                    {statusLabel(persona.status)}
                  </span>
                </div>

                {/* Live action whisper while running */}
                {isRunning && lastAction && (
                  <div className="absolute inset-x-3 top-11">
                    <div className="truncate rounded-[8px] border border-[#2A2B30] bg-[#0E0F11]/85 px-2.5 py-1 font-mono text-[11px] text-[#9AA0A6]">
                      {lastAction.t.toFixed(1)}s · {lastAction.action}
                      {lastAction.target ? ` ${lastAction.target}` : ""}
                    </div>
                  </div>
                )}

                {/* Bottom gradient overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0E0F11] via-[#0E0F11]/88 to-transparent px-3.5 pb-3 pt-10">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[#E8EAED]">
                        {persona.name}
                      </div>
                      <div className="truncate text-[11px] text-[#9AA0A6]">
                        {persona.role} · {persona.device}
                      </div>
                    </div>

                    {isQuit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInterview(persona);
                        }}
                        className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-2.5 py-1 text-[12px] font-medium text-[#E8EAED] transition-colors duration-200 hover:border-[#3F414A] hover:bg-[#2A2B30]"
                      >
                        <Mic className="h-3.5 w-3.5 text-[#9AA0A6]" strokeWidth={1.5} />
                        <span>Interview</span>
                      </button>
                    )}
                  </div>

                  {isQuit && persona.quit_reason && (
                    <p className="mt-2 line-clamp-2 text-[12px] leading-[1.4] text-[#E8EAED]/85">
                      {persona.quit_reason}
                    </p>
                  )}

                  {isQuit && persona.markers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {persona.markers.slice(0, 4).map((marker, idx) => (
                        <span
                          key={`${marker.t}-${idx}`}
                          title={marker.note}
                          className={`rounded-[6px] border px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                            marker.kind === "quit"
                              ? "border-[#F28B82]/30 bg-[#1C1D21]/90 text-[#F28B82]"
                              : "border-[#2A2B30] bg-[#1C1D21]/90 text-[#9AA0A6]"
                          }`}
                        >
                          {marker.t.toFixed(1)}s
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Enlarged tile overlay (unmuted) */}
      {expandedPersona && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setExpandedId(null)}
        >
          <div
            className="live-fade-in flex max-h-[86vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[16px] border border-[#2A2B30] bg-[#16171A]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2A2B30] px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="truncate text-[16px] font-medium text-[#E8EAED]">
                    {expandedPersona.name}
                  </h2>
                  <span
                    className={`rounded-[10px] border px-2.5 py-0.5 text-[11px] font-medium ${statusPillClass(
                      expandedPersona.status
                    )}`}
                  >
                    {statusLabel(expandedPersona.status)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[#9AA0A6]">
                  {expandedPersona.role} · {expandedPersona.device}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {expandedPersona.status === "quit" && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = expandedPersona;
                      setExpandedId(null);
                      onInterview(target);
                    }}
                    className="flex items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-1.5 text-[12px] font-medium text-[#E8EAED] transition-colors hover:bg-[#2A2B30]"
                  >
                    <Mic className="h-3.5 w-3.5 text-[#9AA0A6]" strokeWidth={1.5} />
                    <span>Interview</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedId(null)}
                  aria-label="Close enlarged session"
                  className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] text-[#9AA0A6] transition-colors hover:text-[#E8EAED]"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="relative aspect-video w-full bg-black">
              {resolveArtifactUrl(runId, expandedPersona.video_url) ? (
                <video
                  ref={expandedVideoRef}
                  src={
                    resolveArtifactUrl(runId, expandedPersona.video_url) ??
                    undefined
                  }
                  poster={posterUrl ?? undefined}
                  controls
                  autoPlay
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[13px] text-[#5F6368]">
                  Recording in progress…
                </div>
              )}
            </div>

            {(expandedPersona.quit_reason ||
              expandedPersona.markers.length > 0) && (
              <div className="space-y-3 border-t border-[#2A2B30] px-6 py-4">
                {expandedPersona.quit_reason && (
                  <p className="text-[13px] leading-[1.5] text-[#E8EAED]">
                    {expandedPersona.quit_reason}
                  </p>
                )}

                {expandedPersona.markers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {expandedPersona.markers.map((marker, idx) => (
                      <button
                        key={`${marker.t}-${idx}`}
                        type="button"
                        onClick={() => seekExpandedVideo(marker.t)}
                        className="flex items-center gap-2 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-2.5 py-1 text-left text-[12px] transition-colors hover:border-[#3F414A]"
                      >
                        <span
                          className={`font-mono text-[11px] tabular-nums ${
                            marker.kind === "quit"
                              ? "text-[#F28B82]"
                              : "text-[#FDD663]"
                          }`}
                        >
                          {marker.t.toFixed(1)}s
                        </span>
                        <span className="max-w-[300px] truncate text-[#9AA0A6]">
                          {marker.note}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
