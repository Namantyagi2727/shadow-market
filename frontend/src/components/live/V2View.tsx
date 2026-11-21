"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoveHorizontal, Play, Square, X } from "lucide-react";
import { resolveArtifactUrl } from "@/lib/contracts";
import {
  formatRubricLabel,
  type V2PanelEntry,
  type V2State,
} from "./types";

interface V2ViewProps {
  runId: string;
  v2: V2State;
  fallbackV1ScreenshotUrl: string | null;
  isActive: boolean;
}

const RUBRIC_ORDER = [
  "value_clarity",
  "pain_urgency",
  "price_value_fit",
  "credibility_trust",
  "beat_competitors",
];

function ScreenshotSplitSlider({
  v1Url,
  v2Url,
}: {
  v1Url: string | null;
  v2Url: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.max(4, Math.min(96, Math.round(pct * 10) / 10)));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      setDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSplit((prev) => Math.max(4, prev - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSplit((prev) => Math.min(96, prev + 5));
    }
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Compare V1 and V2 screenshots"
      aria-valuemin={4}
      aria-valuemax={96}
      aria-valuenow={Math.round(split)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className="relative aspect-[16/10] w-full cursor-ew-resize select-none overflow-hidden rounded-[16px] border border-[#2A2B30] bg-[#16171A] focus:outline-none focus-visible:border-[#E8EAED]"
    >
      {/* Base layer: V2 */}
      {v2Url ? (
        <img
          src={v2Url}
          alt="V2 landing page screenshot"
          draggable={false}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[13px] text-[#5F6368]">
          V2 screenshot pending
        </div>
      )}

      {/* Clipped left layer: V1 */}
      {v1Url && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        >
          <img
            src={v1Url}
            alt="V1 landing page screenshot"
            draggable={false}
            className="h-full w-full object-cover object-top"
          />
        </div>
      )}

      {/* Labels */}
      <span className="pointer-events-none absolute left-3 top-3 rounded-[8px] border border-[#2A2B30] bg-[#0E0F11]/85 px-2.5 py-1 font-mono text-[11px] text-[#E8EAED]">
        V1
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-[8px] border border-[#2A2B30] bg-[#0E0F11]/85 px-2.5 py-1 font-mono text-[11px] text-[#E8EAED]">
        V2
      </span>

      {/* Vertical divider + handle */}
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-[#E8EAED]/85"
        style={{ left: `${split}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#2A2B30] bg-[#0E0F11]/95 text-[#E8EAED]">
          <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

export function V2View({
  runId,
  v2,
  fallbackV1ScreenshotUrl,
  isActive,
}: V2ViewProps) {
  const [selectedVideo, setSelectedVideo] = useState<V2PanelEntry | null>(null);

  useEffect(() => {
    if (!selectedVideo) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedVideo(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedVideo]);

  const rubricDeltas = useMemo(() => {
    if (!v2.result) return [];
    const keys = Array.from(
      new Set([
        ...Object.keys(v2.result.rubrics_v1),
        ...Object.keys(v2.result.rubrics_v2),
      ])
    );
    keys.sort((a, b) => {
      const ia = RUBRIC_ORDER.indexOf(a);
      const ib = RUBRIC_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return keys.map((key) => {
      const before = v2.result?.rubrics_v1[key] ?? 0;
      const after = v2.result?.rubrics_v2[key] ?? 0;
      return {
        key,
        before,
        after,
        delta: after - before,
      };
    });
  }, [v2.result]);

  const overallAssessment = useMemo(() => {
    if (!v2.result) return null;
    const convDelta =
      v2.result.holdout.v2_converted - v2.result.holdout.v1_converted;
    const meanRubricDelta =
      rubricDeltas.length > 0
        ? rubricDeltas.reduce((acc, r) => acc + r.delta, 0) / rubricDeltas.length
        : 0;

    if (convDelta > 0 && meanRubricDelta >= -0.005) {
      return {
        label: "Improved",
        toneClass: "text-[#81C995]",
      };
    }
    if (convDelta <= 0 && meanRubricDelta <= 0) {
      return {
        label: "Did not improve",
        toneClass: "text-[#F28B82]",
      };
    }
    return {
      label: "Mixed — did not improve overall",
      toneClass: "text-[#FDD663]",
    };
  }, [v2.result, rubricDeltas]);

  if (
    !v2.started &&
    !v2.plan &&
    !v2.ready &&
    !v2.result &&
    v2.buildMessages.length === 0
  ) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-[#5F6368]">
            Waiting for V2 fix &amp; held-out proof…
          </p>
          {isActive && (
            <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  const v1ShotUrl = resolveArtifactUrl(
    runId,
    v2.ready?.v1_screenshot_url || fallbackV1ScreenshotUrl
  );
  const v2ShotUrl = resolveArtifactUrl(runId, v2.ready?.screenshot_url);

  const fixes = v2.plan?.fixes.slice(0, 3) ?? [];
  const founderTodo = v2.plan?.founderTodo ?? [];

  return (
    <div className="relative flex h-full flex-col overflow-y-auto px-8 py-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-[1160px] grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column: V1 vs V2 slider + Fixes + Founder checklist */}
        <div className="flex flex-col gap-5 lg:col-span-7">
          {v2.ready ? (
            <ScreenshotSplitSlider v1Url={v1ShotUrl} v2Url={v2ShotUrl} />
          ) : (
            <div className="flex aspect-[16/10] flex-col overflow-hidden rounded-[16px] border border-[#2A2B30] bg-[#16171A]">
              <div className="live-shimmer-bar h-[2px] w-full shrink-0" />
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-3 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Patching V2 in sandbox
                </div>
                {v2.buildMessages.length > 0 ? (
                  <div className="space-y-1.5 font-mono text-[12px] text-[#9AA0A6]">
                    {v2.buildMessages.slice(-8).map((msg, idx) => (
                      <div key={`${msg.seq}-${idx}`}>{msg.message}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[#5F6368]">
                    Preparing targeted V2 edits from usability lab &amp; swarm
                    evidence…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Applied fixes (<= 3 lines) */}
          {fixes.length > 0 && (
            <section className="rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-6">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Applied V2 fixes
              </div>
              <ol className="mt-4 space-y-3">
                {fixes.map((fix, idx) => (
                  <li key={idx} className="flex items-start gap-3.5">
                    <span className="mt-0.5 shrink-0 font-mono text-[12px] text-[#5F6368]">
                      0{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[13px] leading-[1.5] text-[#E8EAED]">
                        {fix.change || fix.issue}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Founder todo checklist */}
          {founderTodo.length > 0 && (
            <section className="rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-6">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Only the founder can fix
              </div>
              <ul className="mt-3.5 space-y-2.5">
                {founderTodo.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-[13px] leading-[1.5] text-[#9AA0A6]"
                  >
                    <Square
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#5F6368]"
                      strokeWidth={1.5}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right column: Held-out proof + Rubric deltas + Summary */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          <section className="rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Held-out proof
              </span>
              {overallAssessment && (
                <span className={`text-[12px] font-medium ${overallAssessment.toneClass}`}>
                  {overallAssessment.label}
                </span>
              )}
            </div>

            {v2.result ? (
              <>
                {/* Result row: Held-out buyers 0/6 -> 1/6 */}
                <div className="mt-5 flex items-baseline justify-between gap-4 border-b border-[#2A2B30] pb-5">
                  <span className="text-[14px] text-[#9AA0A6]">
                    Held-out buyers
                  </span>
                  <div className="font-normal text-[32px] leading-none tracking-[-0.02em] tabular-nums text-[#E8EAED]">
                    {v2.result.holdout.v1_converted}/{v2.result.holdout.n}
                    <span className="mx-2 text-[#5F6368]">→</span>
                    <span
                      className={
                        v2.result.holdout.v2_converted >
                        v2.result.holdout.v1_converted
                          ? "text-[#81C995]"
                          : v2.result.holdout.v2_converted <
                            v2.result.holdout.v1_converted
                          ? "text-[#F28B82]"
                          : "text-[#E8EAED]"
                      }
                    >
                      {v2.result.holdout.v2_converted}/{v2.result.holdout.n}
                    </span>
                  </div>
                </div>

                {/* Per-rubric before -> after deltas */}
                {rubricDeltas.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                      Rubric deltas
                    </div>
                    <ul className="space-y-2.5">
                      {rubricDeltas.map((row) => {
                        const beforePct = Math.round(row.before * 100);
                        const afterPct = Math.round(row.after * 100);
                        const deltaPts = Math.round(row.delta * 100);
                        const deltaColor =
                          deltaPts > 0
                            ? "text-[#81C995]"
                            : deltaPts < 0
                            ? "text-[#F28B82]"
                            : "text-[#5F6368]";
                        const deltaPrefix = deltaPts > 0 ? "+" : "";

                        return (
                          <li
                            key={row.key}
                            className="flex items-center justify-between gap-3 text-[13px]"
                          >
                            <span className="truncate text-[#9AA0A6]">
                              {formatRubricLabel(row.key)}
                            </span>
                            <div className="flex shrink-0 items-center gap-3 font-mono text-[12px] tabular-nums">
                              <span className="text-[#5F6368]">
                                {beforePct}% → {afterPct}%
                              </span>
                              <span
                                className={`w-[42px] text-right ${deltaColor}`}
                              >
                                {deltaPrefix}
                                {deltaPts}%
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Honest summary sentence */}
                {v2.result.summary && (
                  <p className="mt-6 border-t border-[#2A2B30] pt-5 text-[14px] leading-[1.6] text-[#E8EAED]">
                    {v2.result.summary}
                  </p>
                )}

                <p className="mt-4 text-[12px] leading-[1.5] text-[#5F6368]">
                  Analyst launch probability is unchanged — it scores the
                  product idea, not page edits.
                </p>
              </>
            ) : (
              <div className="mt-6 space-y-3">
                <p className="text-[13px] text-[#5F6368]">
                  {v2.panel.length > 0
                    ? `Running held-out A/B panel (${v2.panel.length}/12 sessions finished)…`
                    : "Waiting for held-out panel and buyer swarm re-score…"}
                </p>
                {isActive && (
                  <div className="live-shimmer-bar h-[2px] w-full rounded-full" />
                )}
              </div>
            )}
          </section>

          {/* Clickable held-out session recordings */}
          {v2.panel.length > 0 && (
            <section className="rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-6">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Held-out recordings
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {v2.panel
                  .filter((entry) => Boolean(entry.video_url))
                  .map((entry) => (
                    <button
                      key={`${entry.persona_id}-${entry.version}`}
                      type="button"
                      onClick={() => setSelectedVideo(entry)}
                      className="flex items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-2.5 py-1.5 text-[12px] text-[#9AA0A6] transition-colors hover:border-[#3F414A] hover:text-[#E8EAED]"
                    >
                      <Play className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                      <span className="truncate max-w-[115px]">
                        {entry.name}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-[#5F6368]">
                        {entry.version}
                      </span>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          entry.outcome === "converted"
                            ? "bg-[#81C995]"
                            : "bg-[#F28B82]"
                        }`}
                      />
                    </button>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Held-out video overlay */}
      {selectedVideo && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="live-fade-in flex max-h-[85vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[16px] border border-[#2A2B30] bg-[#16171A]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2A2B30] px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-[15px] font-medium text-[#E8EAED]">
                  {selectedVideo.name}
                </span>
                <span className="rounded-[8px] border border-[#2A2B30] bg-[#1C1D21] px-2 py-0.5 font-mono text-[11px] uppercase text-[#9AA0A6]">
                  {selectedVideo.version}
                </span>
                <span
                  className={`text-[12px] ${
                    selectedVideo.outcome === "converted"
                      ? "text-[#81C995]"
                      : "text-[#F28B82]"
                  }`}
                >
                  {selectedVideo.outcome === "converted" ? "Bought" : "Quit"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                aria-label="Close held-out recording"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] text-[#9AA0A6] hover:text-[#E8EAED]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <video
                src={
                  resolveArtifactUrl(runId, selectedVideo.video_url) ??
                  undefined
                }
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
            </div>
            {selectedVideo.quit_reason && (
              <div className="border-t border-[#2A2B30] px-6 py-4 text-[13px] leading-[1.5] text-[#9AA0A6]">
                {selectedVideo.quit_reason}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
