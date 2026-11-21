"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Radio, ThumbsDown, ThumbsUp } from "lucide-react";
import { fetchRunEvents, submitVote } from "@/lib/api";
import { applyRunEvent, createInitialRunState } from "@/lib/run-store";

export default function PhoneVotePage() {
  const params = useParams<{ id: string }>();
  const runId = typeof params?.id === "string" ? params.id : "";

  const [productTitle, setProductTitle] = useState<string | null>(null);
  const [oneLiner, setOneLiner] = useState<string | null>(null);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);

  const [choice, setChoice] = useState<"buy" | "bounce" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    fetchRunEvents(runId)
      .then((events) => {
        if (!active) return;
        let st = createInitialRunState(runId);
        for (const e of events) st = applyRunEvent(st, e);
        if (st.pitch) {
          setProductTitle(st.pitch.title);
          setOneLiner(st.pitch.one_liner);
          setPriceUsd(st.pitch.price_usd);
        } else if (st.spec) {
          setProductTitle(st.spec.headline);
          setPriceUsd(st.spec.price_usd);
        }
      })
      .catch(() => {
        // Fine if backend is unreachable or run has no pitch yet
      });
    return () => {
      active = false;
    };
  }, [runId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runId || !choice) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitVote(runId, {
        choice,
        reason: reason.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit vote.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-stage-grid flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0d1018]/95 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/15 text-emerald-300">
              <Radio className="h-4 w-4" />
            </span>
            <div>
              <div
                className="text-sm font-bold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                SHADOW MARKET
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                Reality Check Vote
              </div>
            </div>
          </div>
          <span className="rounded bg-white/[0.06] px-2 py-1 font-mono text-[10px] text-zinc-400">
            {runId || "—"}
          </span>
        </div>

        <div className="mt-5">
          <h1
            className="text-2xl font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {productTitle || "Would you actually pay for this?"}
          </h1>
          {oneLiner && <p className="mt-1.5 text-sm text-zinc-400">{oneLiner}</p>}
          {priceUsd !== null && (
            <div className="mt-3 inline-block rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-200">
              Price: ${priceUsd}
            </div>
          )}
        </div>

        {submitted ? (
          <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <h2 className="mt-3 text-lg font-bold text-white">Vote Recorded!</h2>
            <p className="mt-1 text-xs text-zinc-300">
              You voted{" "}
              <span className="font-mono font-bold uppercase text-emerald-300">{choice}</span>. Watch
              the main stage to see how the room compares to the 200-persona AI swarm.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setChoice("buy")}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-5 transition ${
                  choice === "buy"
                    ? "border-emerald-400 bg-emerald-500/20 text-white shadow-[0_0_24px_rgba(16,185,129,0.28)]"
                    : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-emerald-400/40"
                }`}
              >
                <ThumbsUp className="h-7 w-7 text-emerald-400" />
                <span className="text-base font-bold">I&apos;d Buy</span>
              </button>

              <button
                type="button"
                onClick={() => setChoice("bounce")}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-5 transition ${
                  choice === "bounce"
                    ? "border-rose-400 bg-rose-500/20 text-white shadow-[0_0_24px_rgba(244,63,94,0.28)]"
                    : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-rose-400/40"
                }`}
              >
                <ThumbsDown className="h-7 w-7 text-rose-400" />
                <span className="text-base font-bold">I&apos;d Bounce</span>
              </button>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                Quick reason (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={140}
                placeholder="Too expensive, love the hook, already use X..."
                className="w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!choice || submitting}
              className="w-full rounded-xl bg-white py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Sending Vote..." : "Submit Vote"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
