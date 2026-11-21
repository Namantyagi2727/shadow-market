"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Layers,
  ListChecks,
  Play,
  Sparkles,
  Square,
  XCircle,
} from "lucide-react";
import { resolveApiUrl } from "@/lib/api";
import { V2PanelFinishedData } from "@/lib/contracts";
import { RunState } from "@/lib/run-store";

export interface V2CardProps {
  runState: RunState;
  onPlayVideo?: (url: string, label: string) => void;
}

interface RubricComparisonRow {
  key: string;
  label: string;
  v1: number;
  v2: number;
  delta: number;
}

function formatRubricLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export function V2Card({ runState, onPlayVideo }: V2CardProps) {
  const { v2Plan, v2BuildMessages, v2Ready, v2Panel, v2Result } = runState;
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const latestBuildMessage =
    v2BuildMessages.length > 0
      ? v2BuildMessages[v2BuildMessages.length - 1]
      : null;

  const isBuilding = !v2Ready && !v2Result;

  const rubricRows = useMemo<RubricComparisonRow[]>(() => {
    if (!v2Result) return [];
    const keys = new Set<string>([
      ...Object.keys(v2Result.rubrics_v1),
      ...Object.keys(v2Result.rubrics_v2),
    ]);
    return Array.from(keys)
      .map((key) => {
        const v1 = v2Result.rubrics_v1[key] ?? 0;
        const v2 = v2Result.rubrics_v2[key] ?? 0;
        return {
          key,
          label: formatRubricLabel(key),
          v1,
          v2,
          delta: v2 - v1,
        };
      })
      .sort((a, b) => {
        if (b.delta !== a.delta) return b.delta - a.delta;
        if (b.v2 !== a.v2) return b.v2 - a.v2;
        return a.key.localeCompare(b.key);
      });
  }, [v2Result]);

  const { v1Chips, v2Chips } = useMemo(() => {
    const all = Object.values(v2Panel).sort((a, b) =>
      a.persona_id.localeCompare(b.persona_id)
    );
    return {
      v1Chips: all.filter((item) => item.version === "v1"),
      v2Chips: all.filter((item) => item.version === "v2"),
    };
  }, [v2Panel]);

  const handleChipClick = (entry: V2PanelFinishedData) => {
    if (!entry.video_url) return;
    const resolved = resolveApiUrl(entry.video_url);
    const label = `${entry.name} · ${entry.version}`;
    if (onPlayVideo) {
      onPlayVideo(resolved, label);
    } else if (typeof window !== "undefined") {
      window.open(resolved, "_blank", "noopener,noreferrer");
    }
  };

  const v1ScreenshotUrl = v2Ready?.v1_screenshot_url
    ? resolveApiUrl(v2Ready.v1_screenshot_url)
    : "";
  const v2ScreenshotUrl = v2Ready?.screenshot_url
    ? resolveApiUrl(v2Ready.screenshot_url)
    : "";
  const v2LiveUrl = v2Ready?.url ? resolveApiUrl(v2Ready.url) : "";

  const fixes = v2Plan ? v2Plan.fixes.slice(0, 3) : [];
  const founderTodo = v2Plan ? v2Plan.founder_todo : [];
  const hasPanelChips = v1Chips.length > 0 || v2Chips.length > 0;

  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-6 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-amber-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Iterate &amp; Prove</span>
          </div>
          <h2 className="mt-0.5 text-xl font-bold tracking-tight text-white">
            V2 — fix it, then prove the fix
          </h2>
        </div>

        {v2LiveUrl && (
          <div className="flex items-center gap-2">
            <a
              href={v2LiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/20"
            >
              <span>Open V2</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Calm Building V2… progress state */}
      {isBuilding && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3.5">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
          <div className="min-w-0 space-y-1">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-200">
              Building V2…
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">
              {latestBuildMessage
                ? latestBuildMessage.message
                : "Planning targeted page fixes from verdict, lab quits, and swarm rubrics…"}
            </p>
          </div>
        </div>
      )}

      {/* V1 vs V2 Screenshots side by side */}
      {v2Ready && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              Before / After Page Capture
            </span>
            {v2Ready.reused_sandbox && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300">
                <Layers className="h-3 w-3" />
                <span>same sandbox</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* V1 */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="font-mono text-xs font-semibold text-zinc-300">
                  V1
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Original
                </span>
              </div>
              <div className="p-2">
                {v1ScreenshotUrl && !failedImages[v1ScreenshotUrl] ? (
                  <img
                    src={v1ScreenshotUrl}
                    alt="V1 landing page screenshot"
                    onError={() =>
                      setFailedImages((prev) => ({
                        ...prev,
                        [v1ScreenshotUrl]: true,
                      }))
                    }
                    className="h-auto w-full rounded-lg border border-white/5 object-cover"
                  />
                ) : (
                  <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 text-center font-mono text-xs text-zinc-500">
                    V1 screenshot preview unavailable
                  </div>
                )}
              </div>
            </div>

            {/* V2 */}
            <div className="overflow-hidden rounded-xl border border-amber-400/30 bg-black/40">
              <div className="flex items-center justify-between border-b border-amber-400/20 bg-amber-500/[0.07] px-3 py-2">
                <span className="font-mono text-xs font-semibold text-amber-300">
                  V2
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-200/80">
                  Patched
                </span>
              </div>
              <div className="p-2">
                {v2ScreenshotUrl && !failedImages[v2ScreenshotUrl] ? (
                  <img
                    src={v2ScreenshotUrl}
                    alt="V2 landing page screenshot"
                    onError={() =>
                      setFailedImages((prev) => ({
                        ...prev,
                        [v2ScreenshotUrl]: true,
                      }))
                    }
                    className="h-auto w-full rounded-lg border border-white/5 object-cover"
                  />
                ) : (
                  <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-amber-400/20 bg-amber-500/[0.03] px-4 text-center font-mono text-xs text-amber-200/70">
                    V2 screenshot preview unavailable
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Held-out buyers headline + Rubric bars + Summary */}
      {v2Result && (
        <div className="space-y-5 rounded-2xl border border-amber-400/25 bg-black/40 p-5">
          {/* Big line */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
            <div className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              <span>Held-out buyers: </span>
              <span className="font-mono text-zinc-400">
                {v2Result.holdout.v1_converted}/{v2Result.holdout.n}
              </span>
              <span className="mx-2 text-amber-400">→</span>
              <span className="font-mono text-amber-300">
                {v2Result.holdout.v2_converted}/{v2Result.holdout.n}
              </span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
              Parallel holdout panel (n={v2Result.holdout.n})
            </span>
          </div>

          {/* Rubric bars before/after */}
          {rubricRows.length > 0 && (
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  Swarm Rubrics — Before vs. After
                </span>
                <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-zinc-500" />
                    <span>V1</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span>V2</span>
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {rubricRows.map((row) => {
                  const v1Pct = clampPercent(row.v1);
                  const v2Pct = clampPercent(row.v2);
                  const deltaClass =
                    row.delta > 0
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : row.delta < 0
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      : "border-white/10 bg-white/[0.04] text-zinc-400";

                  return (
                    <div key={row.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-zinc-200">
                          {row.label}
                        </span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-[11px] text-zinc-400">
                            {row.v1.toFixed(2)} → {row.v2.toFixed(2)}
                          </span>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${deltaClass}`}
                          >
                            {formatDelta(row.delta)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {/* V1 gray bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-zinc-500 transition-all duration-500"
                            style={{ width: `${v1Pct}%` }}
                          />
                        </div>
                        {/* V2 amber bar */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-amber-400 transition-all duration-500"
                            style={{ width: `${v2Pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary sentence */}
          {v2Result.summary && (
            <p className="border-t border-white/10 pt-4 text-sm leading-relaxed text-zinc-200">
              {v2Result.summary}
            </p>
          )}
        </div>
      )}

      {/* Persona replay chips (V1 / V2) */}
      {hasPanelChips && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              Holdout Panel Sessions (Click to Watch)
            </span>
            {!v2Result && (
              <span className="font-mono text-[10px] text-amber-300">
                {Object.keys(v2Panel).length} sessions completed
              </span>
            )}
          </div>

          {v1Chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[11px] font-semibold uppercase text-zinc-400">
                V1
              </span>
              {v1Chips.map((entry) => {
                const converted = entry.outcome === "converted";
                const tooltip = converted
                  ? `${entry.name} · v1 — Converted`
                  : entry.quit_reason || "Quit";
                return (
                  <button
                    key={`${entry.persona_id}:v1`}
                    type="button"
                    title={tooltip}
                    onClick={() => handleChipClick(entry)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      converted
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                    }`}
                  >
                    {converted ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
                    )}
                    <span>{entry.name}</span>
                    {entry.video_url && (
                      <Play className="h-2.5 w-2.5 shrink-0 opacity-75" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {v2Chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[11px] font-semibold uppercase text-amber-300">
                V2
              </span>
              {v2Chips.map((entry) => {
                const converted = entry.outcome === "converted";
                const tooltip = converted
                  ? `${entry.name} · v2 — Converted`
                  : entry.quit_reason || "Quit";
                return (
                  <button
                    key={`${entry.persona_id}:v2`}
                    type="button"
                    title={tooltip}
                    onClick={() => handleChipClick(entry)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      converted
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                    }`}
                  >
                    {converted ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
                    )}
                    <span>{entry.name}</span>
                    {entry.video_url && (
                      <Play className="h-2.5 w-2.5 shrink-0 opacity-75" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fixes (≤3): issue -> change, with evidence in small muted text */}
      {fixes.length > 0 && (
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            Targeted V2 Fixes ({fixes.length})
          </div>
          <ol className="space-y-2.5">
            {fixes.map((fix, idx) => (
              <li
                key={idx}
                className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-1.5"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-sm leading-relaxed">
                  <span className="font-mono text-xs font-bold text-amber-400">
                    0{idx + 1}
                  </span>
                  <span className="text-zinc-300">{fix.issue}</span>
                  <ArrowRight className="inline h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="font-medium text-white">{fix.change}</span>
                </div>
                {fix.evidence && (
                  <p className="pl-6 text-xs leading-relaxed text-zinc-400">
                    {fix.evidence}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Founder to-do checklist */}
      {founderTodo.length > 0 && (
        <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                Founder to-do
              </h3>
            </div>
            <span className="text-xs text-zinc-400">
              Real facts only you can provide — never faked on the page.
            </span>
          </div>
          <ul className="space-y-1.5 pt-1">
            {founderTodo.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-sm text-zinc-200"
              >
                <Square className="mt-1 h-3.5 w-3.5 shrink-0 text-cyan-400/80" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer note */}
      <div className="border-t border-white/10 pt-3">
        <p className="font-mono text-xs text-zinc-400">
          The launch probability scores the idea, not the page — V2 doesn&apos;t change it.
        </p>
      </div>
    </section>
  );
}
