"use client";

import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  ExternalLink,
  Gauge,
  QrCode,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import { VerdictData, VoteTallyData } from "@/lib/contracts";
import { ProofCard } from "./ProofCard";

interface VerdictStageProps {
  runId: string | null;
  verdict: VerdictData | null;
  voteTally: VoteTallyData | null;
  focusReality?: boolean;
}

export function VerdictStage({
  runId,
  verdict,
  voteTally,
  focusReality = false,
}: VerdictStageProps) {
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const votePath = runId ? `/vote/${encodeURIComponent(runId)}` : null;
  const fullVoteUrl = votePath && origin ? `${origin}${votePath}` : votePath;

  const probPct = verdict ? Math.round(verdict.launch_probability * 100) : null;
  const confPct = verdict ? Math.round(verdict.confidence * 100) : null;

  const totalVotes = (voteTally?.buy ?? 0) + (voteTally?.bounce ?? 0);
  const audienceBuyPct =
    totalVotes > 0 && voteTally ? Math.round((voteTally.buy / totalVotes) * 100) : null;
  const aiComparePct =
    voteTally?.ai_probability !== undefined
      ? Math.round(voteTally.ai_probability * 100)
      : probPct;

  const verdictTier =
    probPct === null
      ? { label: "PENDING", color: "text-zinc-400", stroke: "#52525b" }
      : probPct >= 65
      ? { label: "STRONG LAUNCH", color: "text-emerald-400", stroke: "#10b981" }
      : probPct >= 40
      ? { label: "RISKY — ITERATE", color: "text-amber-400", stroke: "#f59e0b" }
      : { label: "LIKELY TO FAIL", color: "text-rose-400", stroke: "#f43f5e" };

  // SVG Radial Gauge math
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    probPct !== null ? circumference * (1 - Math.max(0, Math.min(100, probPct)) / 100) : circumference;

  // Secondary Market pull gauge math
  const marketRadius = 24;
  const marketCircumference = 2 * Math.PI * marketRadius;
  const marketDashOffset =
    typeof verdict?.market_intent === "number"
      ? marketCircumference *
        (1 - Math.max(0, Math.min(1, verdict.market_intent)))
      : marketCircumference;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Verdict Card */}
        <section
          className={`flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-6 shadow-2xl ${
            focusReality ? "lg:col-span-6 order-2 lg:order-1" : "lg:col-span-7"
          }`}
        >
          <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-emerald-400">
                <Gauge className="h-3.5 w-3.5" />
                <span>Stage 07 — Calibrated Verdict</span>
              </div>
              <h2
                className="mt-0.5 text-xl font-bold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Launch Survival Forecast
              </h2>
            </div>
            <span className="rounded bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-zinc-400">
              gemini-4-carbon
            </span>
          </div>

          {!verdict ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
              <p className="mt-4 text-sm font-medium text-zinc-200">
                Synthesizing usability quits + 200-buyer swarm...
              </p>
              <p className="mt-1 max-w-xs text-xs text-zinc-500">
                Gemini 4 Carbon computes launch-survival probability and top failure modes.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-black/40 p-5 sm:flex-row sm:items-center">
                {/* Radial Gauge */}
                <div className="relative flex h-40 w-40 shrink-0 items-center justify-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      stroke={verdictTier.stroke}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      fill="none"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span
                      className="text-4xl font-bold text-white"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {probPct}%
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      Analyst
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-3 text-center sm:text-left">
                  <div>
                    <div className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Launch probability (backtested analyst)
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <span
                        className={`rounded-full border border-current/30 bg-white/[0.04] px-3 py-1 font-mono text-xs font-bold tracking-wider ${verdictTier.color}`}
                      >
                        {verdictTier.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-zinc-300">
                        <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Confidence {confPct}%</span>
                      </span>
                    </div>
                    {verdict.analyst_reason && (
                      <p className="mt-2.5 text-xs sm:text-sm text-zinc-300 leading-relaxed border-l-2 border-emerald-400/50 pl-3 text-left">
                        {verdict.analyst_reason}
                      </p>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed text-zinc-200">{verdict.summary}</p>
                </div>

                {/* Secondary Market pull gauge for market_intent */}
                {typeof verdict.market_intent === "number" && (
                  <div className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 shrink-0">
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
                        <circle
                          cx="32"
                          cy="32"
                          r={marketRadius}
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="5"
                          fill="none"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r={marketRadius}
                          stroke="#22d3ee"
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={marketCircumference}
                          strokeDashoffset={marketDashOffset}
                          fill="none"
                          className="transition-all duration-700"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="font-mono text-xs font-bold text-cyan-300">
                          {Math.round(verdict.market_intent * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-white">Market pull</div>
                      <div className="text-[10px] text-zinc-400">from 200-buyer swarm</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Top Failure Modes as red tags */}
              <div>
                <div className="mb-2.5 font-mono text-[10px] uppercase tracking-widest text-rose-400">
                  Top Predicted Failure Modes
                </div>
                {verdict.failure_modes.length === 0 ? (
                  <p className="text-xs text-zinc-500">No critical failure modes reported.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {verdict.failure_modes.map((mode, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs leading-relaxed text-rose-200"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                        <span>{mode}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

      {/* Reality Check: Audience QR Vote vs AI Prediction */}
      <section
        className={`flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-6 shadow-2xl ${
          focusReality ? "lg:col-span-6 order-1 lg:order-2 ring-1 ring-cyan-400/40" : "lg:col-span-5"
        }`}
      >
        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-cyan-400">
              <QrCode className="h-3.5 w-3.5" />
              <span>Reality Check — Room Vote</span>
            </div>
            <h2
              className="mt-0.5 text-xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Audience vs. Shadow Market AI
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-zinc-300">
            <Users className="h-3.5 w-3.5 text-cyan-400" />
            <span>{totalVotes} votes</span>
          </span>
        </div>

        {/* QR Code Card */}
        <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-black/40 p-5 text-center">
          {fullVoteUrl ? (
            <>
              <div className="rounded-2xl bg-white p-3.5 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
                <QRCodeSVG value={fullVoteUrl} size={152} level="M" />
              </div>
              <p className="mt-3 text-xs font-medium text-zinc-200">
                Scan to vote: Would you buy this product?
              </p>
              <a
                href={votePath || "#"}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 font-mono text-[11px] text-cyan-200 hover:bg-cyan-500/20"
              >
                <span className="max-w-[220px] truncate">{fullVoteUrl}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </>
          ) : (
            <p className="py-8 text-xs text-zinc-500">
              Start or replay a run to generate the live room QR vote link.
            </p>
          )}
        </div>

        {/* Live Tally Comparison */}
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3.5">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                <ThumbsUp className="h-3.5 w-3.5" />
                <span>Room: Buy</span>
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-white">
                {voteTally?.buy ?? 0}
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] p-3.5">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-rose-300">
                <ThumbsDown className="h-3.5 w-3.5" />
                <span>Room: Bounce</span>
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-white">
                {voteTally?.bounce ?? 0}
              </div>
            </div>
          </div>

          {/* Head-to-head AI vs Human bar */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Shadow Market AI Prediction</span>
                <span className="font-mono font-bold text-cyan-300">
                  {aiComparePct !== null ? `${aiComparePct}%` : "—"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                  style={{ width: `${aiComparePct ?? 0}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Live Human Audience Buy Rate</span>
                <span className="font-mono font-bold text-emerald-300">
                  {audienceBuyPct !== null ? `${audienceBuyPct}%` : "Waiting for votes"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                  style={{ width: `${audienceBuyPct ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* Proof Card */}
      <ProofCard />
    </div>
  );
}
