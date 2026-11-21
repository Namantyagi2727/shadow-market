"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, RefreshCw, Users } from "lucide-react";
import { connectRunStream, fetchRunEvents } from "@/lib/api";
import { getApiBase } from "@/lib/contracts";
import { applyRunEvent, createInitialRunState, type RunState } from "@/lib/run-store";

interface TallyScreenProps {
  runId: string;
}

type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export function TallyScreen({ runId }: TallyScreenProps) {
  const [runState, setRunState] = useState<RunState>(() =>
    createInitialRunState(runId || null)
  );
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [unreachableMessage, setUnreachableMessage] = useState<string | null>(
    null
  );
  const [retrying, setRetrying] = useState(false);
  const [origin, setOrigin] = useState<string>("");

  const cleanupStreamRef = useRef<(() => void) | null>(null);
  const attemptIdRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const stopStream = useCallback(() => {
    attemptIdRef.current += 1;
    if (cleanupStreamRef.current) {
      cleanupStreamRef.current();
      cleanupStreamRef.current = null;
    }
  }, []);

  const startConnection = useCallback(async () => {
    stopStream();

    if (!runId) {
      setConnectionStatus("error");
      setUnreachableMessage("Missing run ID in URL.");
      return;
    }

    const currentAttempt = attemptIdRef.current;
    setRetrying(true);
    setUnreachableMessage(null);
    setRunState(createInitialRunState(runId));

    try {
      const history = await fetchRunEvents(runId);
      if (currentAttempt !== attemptIdRef.current) return;
      setRunState(() => {
        let next = createInitialRunState(runId);
        for (const evt of history) {
          next = applyRunEvent(next, evt);
        }
        return next;
      });
    } catch (err) {
      if (currentAttempt !== attemptIdRef.current) return;
      const detail =
        err instanceof Error && err.message
          ? err.message
          : `Unable to reach ${getApiBase()}`;
      setUnreachableMessage(`Backend unreachable (${detail})`);
    } finally {
      if (currentAttempt === attemptIdRef.current) {
        setRetrying(false);
      }
    }

    if (currentAttempt !== attemptIdRef.current) return;

    cleanupStreamRef.current = connectRunStream(runId, {
      onEvent: (evt) => {
        setUnreachableMessage(null);
        setRunState((prev) => applyRunEvent(prev, evt));
      },
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === "connected") {
          setUnreachableMessage(null);
        }
      },
      onErrorMessage: (msg) => {
        setUnreachableMessage(msg);
      },
    });
  }, [runId, stopStream]);

  useEffect(() => {
    void startConnection();
    return () => {
      stopStream();
    };
  }, [startConnection, stopStream]);

  const votePath = runId ? `/vote/${encodeURIComponent(runId)}` : "";
  const voteUrl = votePath && origin ? `${origin}${votePath}` : "";

  const productTitle =
    runState.pitch?.title || runState.spec?.headline || "Shadow Market Pitch";

  const buyCount = runState.voteTally?.buy ?? 0;
  const bounceCount = runState.voteTally?.bounce ?? 0;
  const totalVotes = buyCount + bounceCount;

  const roomPct =
    totalVotes > 0 ? Math.round((buyCount / totalVotes) * 100) : null;

  const rawAiProb =
    runState.verdict?.launch_probability ??
    (runState.voteTally && runState.voteTally.ai_probability > 0
      ? runState.voteTally.ai_probability
      : null);

  const aiPct =
    rawAiProb !== null && Number.isFinite(rawAiProb)
      ? Math.max(0, Math.min(100, Math.round(rawAiProb * 100)))
      : null;

  const gap = roomPct !== null && aiPct !== null ? roomPct - aiPct : null;
  const gapLabel =
    gap === null ? null : gap > 0 ? `+${gap} pts` : `${gap} pts`;

  const isLive = connectionStatus === "connected";

  return (
    <main className="min-h-dvh lg:h-dvh lg:overflow-hidden bg-stage-grid flex flex-col justify-between px-5 py-4 sm:px-8 sm:py-6">
      {/* Minimal top bar */}
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="text-sm font-bold tracking-wider text-zinc-200 uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Shadow Market
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            Reality Check
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isLive ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs font-medium text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-zinc-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === "connecting" ||
                  connectionStatus === "reconnecting"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-zinc-500"
                }`}
              />
              <span>
                {connectionStatus === "connecting"
                  ? "Connecting"
                  : connectionStatus === "reconnecting"
                  ? "Reconnecting"
                  : "Offline"}
              </span>
            </span>
          )}
        </div>
      </header>

      {/* Inline backend unreachable message with Retry */}
      {unreachableMessage && !isLive && (
        <div
          role="alert"
          className="mx-auto mt-3 flex w-full max-w-[1280px] items-center justify-between gap-4 rounded-2xl border border-rose-500/35 bg-[#160d12]/95 px-4 py-2.5 text-sm text-rose-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span className="truncate">{unreachableMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void startConnection()}
            disabled={retrying}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/20 px-3.5 py-1.5 font-mono text-xs font-semibold text-white transition hover:bg-rose-500/30 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
            />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Main iPad Landscape Two-Column Stage */}
      <div className="mx-auto my-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-6 py-4 md:grid-cols-2 lg:gap-8 min-h-0">
        {/* Left Half: Huge QR Code + Title */}
        <section className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#0d1018]/90 p-6 text-center shadow-2xl lg:p-8">
          <div className="mb-5 max-w-full">
            <div className="font-mono text-[11px] uppercase tracking-widest text-teal-300/90">
              Audience Reality Check
            </div>
            <h1
              className="mt-1.5 text-2xl font-bold tracking-tight text-white line-clamp-2 sm:text-3xl lg:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {productTitle}
            </h1>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-[0_0_60px_rgba(45,212,191,0.18)]">
            {voteUrl ? (
              <QRCodeSVG
                value={voteUrl}
                size={300}
                level="M"
                className="h-[220px] w-[220px] sm:h-[260px] sm:w-[260px] lg:h-[300px] lg:w-[300px]"
              />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl bg-zinc-100 font-mono text-xs text-zinc-500 sm:h-[260px] sm:w-[260px] lg:h-[300px] lg:w-[300px]">
                {runId ? "Preparing QR…" : "Invalid Run"}
              </div>
            )}
          </div>

          <p
            className="mt-5 text-xl font-semibold tracking-tight text-white sm:text-2xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Scan to vote: would you buy it?
          </p>
          {voteUrl && (
            <p className="mt-1.5 max-w-full truncate font-mono text-xs text-zinc-500">
              {voteUrl}
            </p>
          )}
        </section>

        {/* Right Half: The Race */}
        <section className="flex flex-col justify-between rounded-3xl border border-white/10 bg-[#0d1018]/90 p-6 shadow-2xl lg:p-8">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-amber-400">
                Live Comparison
              </div>
              <h2
                className="mt-0.5 text-2xl font-bold text-white lg:text-3xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                AI vs. This Room
              </h2>
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 font-mono text-sm font-medium text-zinc-200">
              <Users className="h-4 w-4 text-teal-400" />
              <span>
                {totalVotes} {totalVotes === 1 ? "voter" : "voters"}
              </span>
            </div>
          </div>

          {/* Two Big Horizontal Bars */}
          <div className="my-auto space-y-8 py-6">
            {/* Bar 1: AI forecast (amber) */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <span
                  className="text-xl font-semibold text-zinc-100 lg:text-2xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  AI forecast
                </span>
                <span className="font-mono text-3xl font-bold text-amber-400 lg:text-4xl">
                  {aiPct !== null ? `${aiPct}%` : "—"}
                </span>
              </div>
              <div className="h-12 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-1 lg:h-14">
                <div
                  className="h-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-300 shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all duration-700 ease-out"
                  style={{ width: `${aiPct ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
                <span>Backtested analyst forecast</span>
                <span>{aiPct !== null ? `${aiPct}% launch odds` : "Pending verdict"}</span>
              </div>
            </div>

            {/* Bar 2: This room (teal) */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <span
                  className="text-xl font-semibold text-zinc-100 lg:text-2xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  This room
                </span>
                {roomPct !== null ? (
                  <span className="font-mono text-3xl font-bold text-teal-300 lg:text-4xl">
                    {roomPct}%
                  </span>
                ) : (
                  <span className="font-mono text-lg font-medium text-zinc-500">
                    No votes yet
                  </span>
                )}
              </div>
              <div className="h-12 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-1 lg:h-14">
                <div
                  className="h-full rounded-xl bg-gradient-to-r from-teal-500 to-teal-300 shadow-[0_0_24px_rgba(20,184,166,0.35)] transition-all duration-700 ease-out"
                  style={{ width: `${roomPct ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between font-mono text-sm text-zinc-300">
                <span>
                  <span className="font-semibold text-teal-300">{buyCount} buy</span>
                  {" · "}
                  <span className="font-semibold text-rose-300">{bounceCount} bounce</span>
                </span>
                <span className="text-zinc-400">
                  {totalVotes} {totalVotes === 1 ? "voter" : "voters"}
                </span>
              </div>
            </div>
          </div>

          {/* One-line live summary */}
          <div className="rounded-2xl border border-white/10 bg-black/45 px-5 py-4 text-center">
            {totalVotes === 0 ? (
              <p className="font-mono text-base font-medium text-zinc-300 lg:text-lg">
                {aiPct !== null
                  ? `AI said ${aiPct}% · Waiting for the first vote…`
                  : "Waiting for the first vote…"}
              </p>
            ) : aiPct !== null && roomPct !== null && gapLabel !== null ? (
              <p className="font-mono text-base font-medium text-zinc-200 lg:text-lg">
                <span>AI said </span>
                <span className="font-bold text-amber-400">{aiPct}%</span>
                <span className="text-zinc-500"> · </span>
                <span>room says </span>
                <span className="font-bold text-teal-300">{roomPct}%</span>
                <span className="text-zinc-500"> · </span>
                <span>gap </span>
                <span
                  className={`font-bold ${
                    gap !== null && gap > 0
                      ? "text-teal-300"
                      : gap !== null && gap < 0
                      ? "text-rose-400"
                      : "text-zinc-200"
                  }`}
                >
                  {gapLabel}
                </span>
              </p>
            ) : (
              <p className="font-mono text-base font-medium text-zinc-200 lg:text-lg">
                <span>Room says </span>
                <span className="font-bold text-teal-300">{roomPct}%</span>
                <span className="text-zinc-500"> · </span>
                <span className="text-zinc-400">
                  {buyCount} buy · {bounceCount} bounce
                </span>
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
