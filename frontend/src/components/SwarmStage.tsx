"use client";

import React, { useMemo } from "react";
import { BarChart3, Cpu, Users } from "lucide-react";
import { SwarmProgressData, SwarmResultData } from "@/lib/contracts";

interface SwarmStageProps {
  progress: SwarmProgressData | null;
  result: SwarmResultData | null;
}

function formatRubricLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SwarmStage({ progress, result }: SwarmStageProps) {
  const total = result?.personas || progress?.total || 200;
  const done = result ? total : progress?.done || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const rubricEntries = useMemo(() => {
    if (!result?.rubrics) return [];
    return Object.entries(result.rubrics).sort((a, b) => b[1] - a[1]);
  }, [result]);

  // 200-dot deterministic buyer swarm visualization
  const dotCount = Math.min(200, Math.max(40, total));
  const intentMean = result?.intent_mean ?? null;
  const buyersCount = intentMean !== null ? Math.round(dotCount * intentMean) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: 200-Buyer Swarm Matrix */}
      <section className="lg:col-span-7 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-cyan-400">
              <Users className="h-3.5 w-3.5" />
              <span>Stage 06 — Calibrated Market Swarm</span>
            </div>
            <h2
              className="mt-0.5 text-xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {total} Buyer Personas × 5 Purchase Rubrics
            </h2>
          </div>

          <span className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 font-mono text-[11px] text-cyan-200">
            <Cpu className="h-3.5 w-3.5" />
            <span>gemini-decision-1</span>
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
            <span className="text-zinc-400">
              {result
                ? `Scored ${(total * 5).toLocaleString()} calibrated rubric checks`
                : `Evaluating buyer swarm (${done} / ${total})`}
            </span>
            <span className="font-bold text-emerald-300">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* 20 x 10 Persona Grid */}
        <div className="rounded-xl border border-white/10 bg-black/50 p-4">
          <div className="grid grid-cols-20 gap-1.5 sm:gap-2">
            {Array.from({ length: dotCount }).map((_, idx) => {
              const evaluated = idx < Math.round((done / total) * dotCount);
              let dotClass = "bg-white/10";
              if (result) {
                dotClass =
                  idx < buyersCount
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.55)]"
                    : "bg-rose-500/45";
              } else if (evaluated) {
                dotClass = "bg-cyan-400/80 shadow-[0_0_6px_rgba(34,211,238,0.45)]";
              }
              return (
                <div
                  key={idx}
                  className={`aspect-square rounded-full transition-all duration-300 ${dotClass}`}
                  title={
                    result
                      ? idx < buyersCount
                        ? "Likely Buyer"
                        : "Likely Bounce"
                      : evaluated
                      ? "Evaluated"
                      : "Queued"
                  }
                />
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] text-zinc-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span>Predicted Buy</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
                <span>Predicted Bounce</span>
              </span>
              {!result && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  <span>Scoring</span>
                </span>
              )}
            </div>
            <span>Zero output tokens • Calibrated probabilities</span>
          </div>
        </div>
      </section>

      {/* Right: Mean Purchase Intent & Rubric Breakdown */}
      <section className="lg:col-span-5 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
              Swarm Probability Breakdown
            </h3>
          </div>
        </div>

        {!result ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
            <p className="mt-4 text-sm font-medium text-zinc-200">
              Running Gemini Decisions API swarm...
            </p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500">
              Scoring MVP screenshot, hero image, and Shopify competitor anchors across 200 buyer
              profiles.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-1 flex-col justify-between space-y-6">
            {/* Hero Mean Intent Readout */}
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.08] p-5 text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                Calibrated Purchase Intent Mean
              </div>
              <div
                className="mt-2 text-5xl font-bold tracking-tight text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {Math.round(result.intent_mean * 100)}%
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                Aggregated across {result.personas} personas
              </p>
            </div>

            {/* Per-Rubric Bars */}
            <div className="space-y-3.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                Rubric Scores
              </div>
              {rubricEntries.length === 0 ? (
                <p className="text-xs text-zinc-500">No individual rubric breakdown returned.</p>
              ) : (
                rubricEntries.map(([rubricId, prob]) => {
                  const pctVal = Math.max(0, Math.min(100, Math.round(prob * 100)));
                  const barColor =
                    pctVal >= 65
                      ? "bg-emerald-400"
                      : pctVal >= 40
                      ? "bg-amber-400"
                      : "bg-rose-400";
                  return (
                    <div key={rubricId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-200">
                          {formatRubricLabel(rubricId)}
                        </span>
                        <span className="font-mono font-semibold text-zinc-100">{pctVal}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pctVal}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
