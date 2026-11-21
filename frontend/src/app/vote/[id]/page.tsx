"use client";

import React, { use, useEffect, useRef, useState } from "react";
import { CheckCircle2, Radio, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import { connectRunStream, fetchRunEvents, submitVote } from "@/lib/api";
import { applyRunEvent, createInitialRunState, type RunState } from "@/lib/run-store";

function decodeRunId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function PhoneVotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = use(params);
  const runId = decodeRunId(rawId || "");

  const [runState, setRunState] = useState<RunState>(() =>
    createInitialRunState(runId || null)
  );
  const [choice, setChoice] = useState<"buy" | "bounce" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!runId) return;
    let active = true;

    fetchRunEvents(runId)
      .then((events) => {
        if (!active) return;
        setRunState(() => {
          let st = createInitialRunState(runId);
          for (const e of events) st = applyRunEvent(st, e);
          return st;
        });
      })
      .catch(() => {
        // Fine if backend is unreachable or run has no pitch yet
      });

    const disconnect = connectRunStream(runId, {
      onEvent: (evt) => {
        if (!active) return;
        setRunState((prev) => applyRunEvent(prev, evt));
      },
      onStatusChange: () => {
        // Quiet background updates for room tally
      },
    });

    return () => {
      active = false;
      disconnect();
    };
  }, [runId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runId || !choice || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitVote(runId, {
        choice,
        reason: reason.trim() || undefined,
      });
      if (!mountedRef.current) return;
      setSubmitted(true);
      // Refresh events as a fallback in case WebSocket tally hasn't arrived yet
      fetchRunEvents(runId)
        .then((events) => {
          if (!mountedRef.current) return;
          setRunState((prev) => {
            let st = prev;
            for (const evt of events) st = applyRunEvent(st, evt);
            return st;
          });
        })
        .catch(() => {
          // Non-fatal if refresh fails
        });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to submit vote.");
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const productTitle =
    runState.pitch?.title || runState.spec?.headline || null;
  const oneLiner = runState.pitch?.one_liner || null;
  const priceUsd =
    runState.pitch?.price_usd ?? runState.spec?.price_usd ?? null;

  const tally = runState.voteTally;
  const buyCount = tally?.buy ?? 0;
  const bounceCount = tally?.bounce ?? 0;
  const totalVotes = buyCount + bounceCount;
  const roomBuyPct =
    totalVotes > 0 ? Math.round((buyCount / totalVotes) * 100) : null;

  return (
    <main className="min-h-dvh w-full bg-stage-grid flex flex-col items-center justify-center px-4 py-3">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0d1018]/95 p-5 shadow-2xl">
        {/* Compact Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal-400/40 bg-teal-500/15 text-teal-300">
              <Radio className="h-4 w-4" />
            </span>
            <div>
              <div
                className="text-xs font-bold tracking-wide text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                SHADOW MARKET
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                Reality Check
              </div>
            </div>
          </div>
          {priceUsd !== null ? (
            <span className="rounded-lg border border-teal-400/30 bg-teal-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-teal-200">
              ${priceUsd}
            </span>
          ) : (
            <span className="rounded bg-white/[0.06] px-2 py-1 font-mono text-[10px] text-zinc-400">
              {runId || "—"}
            </span>
          )}
        </div>

        {/* Product Info */}
        <div className="mt-3.5">
          <h1
            className="text-xl font-bold leading-snug tracking-tight text-white line-clamp-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {productTitle || "Would you actually pay for this?"}
          </h1>
          {oneLiner && (
            <p className="mt-1 text-xs leading-relaxed text-zinc-400 line-clamp-2">
              {oneLiner}
            </p>
          )}
        </div>

        {submitted ? (
          <div className="mt-4 space-y-3.5">
            <div className="rounded-2xl border border-teal-400/30 bg-teal-500/10 p-5 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-teal-300" />
              <h2
                className="mt-2.5 text-lg font-bold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Thanks for voting!
              </h2>
              <p className="mt-1 text-xs text-zinc-300">
                You chose{" "}
                <span
                  className={`font-semibold ${
                    choice === "buy" ? "text-teal-300" : "text-rose-300"
                  }`}
                >
                  {choice === "buy" ? "I'd buy it" : "Not for me"}
                </span>
                .
              </p>
            </div>

            {tally && totalVotes > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase tracking-wider text-zinc-400">
                    Current Room Tally
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-zinc-300">
                    <Users className="h-3.5 w-3.5 text-teal-400" />
                    <span>{totalVotes}</span>
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-white">
                    {roomBuyPct}% would buy
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {buyCount} buy · {bounceCount} bounce
                  </span>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-300 transition-all duration-500"
                    style={{ width: `${roomBuyPct ?? 0}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-center font-mono text-[11px] text-zinc-500">
                Watch the Reality Check screen for live room results.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setChoice("buy")}
                className={`flex min-h-[136px] flex-col items-center justify-center gap-2.5 rounded-2xl border px-3 py-5 transition active:scale-[0.98] ${
                  choice === "buy"
                    ? "border-teal-400 bg-teal-500/20 text-white shadow-[0_0_24px_rgba(20,184,166,0.3)]"
                    : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-teal-400/40"
                }`}
              >
                <ThumbsUp className="h-8 w-8 text-teal-400" />
                <span className="text-base font-bold">I&apos;d buy it</span>
              </button>

              <button
                type="button"
                onClick={() => setChoice("bounce")}
                className={`flex min-h-[136px] flex-col items-center justify-center gap-2.5 rounded-2xl border px-3 py-5 transition active:scale-[0.98] ${
                  choice === "bounce"
                    ? "border-rose-400 bg-rose-500/20 text-white shadow-[0_0_24px_rgba(244,63,94,0.3)]"
                    : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-rose-400/40"
                }`}
              >
                <ThumbsDown className="h-8 w-8 text-rose-400" />
                <span className="text-base font-bold">Not for me</span>
              </button>
            </div>

            {choice !== null && (
              <div>
                <label
                  htmlFor="vote-reason"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-zinc-400"
                >
                  Why? (optional)
                </label>
                <input
                  id="vote-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={140}
                  placeholder="Too pricey, love the idea, already use X..."
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-base text-white placeholder-zinc-500 focus:border-teal-400/60 focus:outline-none"
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!choice || submitting || !runId}
              className="w-full rounded-xl bg-white py-3.5 text-base font-bold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Sending Vote..." : "Submit Vote"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
