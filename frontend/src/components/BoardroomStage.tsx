"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertOctagon,
  Compass,
  DollarSign,
  FileCode2,
  Flame,
  Play,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { BoardroomTurnData, resolveArtifactUrl, SpecReadyData } from "@/lib/contracts";

interface BoardroomStageProps {
  runId: string | null;
  turns: (BoardroomTurnData & { seq: number; ts: string })[];
  spec: SpecReadyData | null;
}

export function BoardroomStage({ runId, turns, spec }: BoardroomStageProps) {
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);
  const [playingSeq, setPlayingSeq] = useState<number | null>(null);
  const playedSeqsRef = useRef<Set<number>>(new Set());
  const queueRef = useRef<{ seq: number; url: string }[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);

  const playNextInQueue = () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    if (!next) return;

    isPlayingRef.current = true;
    setPlayingSeq(next.seq);

    const audio = new Audio(next.url);
    audioRef.current = audio;

    const finish = () => {
      isPlayingRef.current = false;
      setPlayingSeq(null);
      playNextInQueue();
    };

    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  };

  useEffect(() => {
    if (!autoPlayAudio) return;
    for (const turn of turns) {
      if (turn.audio_url && !playedSeqsRef.current.has(turn.seq)) {
        playedSeqsRef.current.add(turn.seq);
        const resolved = resolveArtifactUrl(runId, turn.audio_url);
        if (resolved) {
          queueRef.current.push({ seq: turn.seq, url: resolved });
        }
      }
    }
    playNextInQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, autoPlayAudio, runId]);

  useEffect(() => {
    return () => {
      queueRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const replayTurnAudio = (seq: number, audioUrl: string | null) => {
    const resolved = resolveArtifactUrl(runId, audioUrl);
    if (!resolved) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    queueRef.current = [];
    isPlayingRef.current = true;
    setPlayingSeq(seq);
    const audio = new Audio(resolved);
    audioRef.current = audio;
    const done = () => {
      isPlayingRef.current = false;
      setPlayingSeq(null);
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  };

  const toggleMute = () => {
    const next = !autoPlayAudio;
    setAutoPlayAudio(next);
    if (!next && audioRef.current) {
      audioRef.current.pause();
      queueRef.current = [];
      isPlayingRef.current = false;
      setPlayingSeq(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: Strategist vs Skeptic Live Debate */}
      <section className="lg:col-span-8 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-cyan-400">
              Stage 02 — Executive Boardroom
            </div>
            <h2
              className="mt-0.5 text-xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Strategist vs. Hostile Skeptic
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 font-mono text-[11px] text-cyan-200">
              Neon • Strategist
            </span>
            <span className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 font-mono text-[11px] text-rose-200">
              Argon • Skeptic
            </span>
            <button
              onClick={toggleMute}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                autoPlayAudio
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/15 bg-white/[0.04] text-zinc-400"
              }`}
              title="Toggle automatic TTS playback"
            >
              {autoPlayAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span>{autoPlayAudio ? "TTS On" : "Muted"}</span>
            </button>
          </div>
        </div>

        {turns.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
            <p className="mt-4 text-sm font-medium text-zinc-200">
              Convening boardroom review...
            </p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              Gemini 4 Neon and Gemini 4 Argon will pressure-test your pitch before locking the V1
              build spec.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, i) => {
              const isSkeptic = turn.speaker === "skeptic";
              const isSpeaking = playingSeq === turn.seq;
              return (
                <article
                  key={turn.seq ?? i}
                  className={`rounded-2xl border p-4 transition ${
                    isSkeptic
                      ? "border-rose-500/25 bg-rose-500/[0.05] ml-0 sm:ml-8"
                      : "border-cyan-500/25 bg-cyan-500/[0.05] mr-0 sm:mr-8"
                  } ${isSpeaking ? "ring-1 ring-emerald-400/70 shadow-[0_0_24px_rgba(16,185,129,0.18)]" : ""}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          isSkeptic
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-cyan-500/20 text-cyan-300"
                        }`}
                      >
                        {isSkeptic ? <Flame className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
                      </span>
                      <div>
                        <span
                          className={`text-xs font-bold uppercase tracking-wider ${
                            isSkeptic ? "text-rose-200" : "text-cyan-200"
                          }`}
                        >
                          {isSkeptic ? "Hostile Skeptic" : "Product Strategist"}
                        </span>
                        {turn.model && (
                          <span className="ml-2 font-mono text-[10px] text-zinc-500">
                            {turn.model}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSpeaking && (
                        <div className="flex h-4 items-end gap-0.5 px-1">
                          {[0, 1, 2, 3].map((b) => (
                            <span
                              key={b}
                              className="animate-voice-bar w-0.5 rounded-full bg-emerald-400"
                              style={{
                                height: `${8 + (b % 3) * 4}px`,
                                animationDelay: `${b * 140}ms`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {turn.audio_url && (
                        <button
                          onClick={() => replayTurnAudio(turn.seq, turn.audio_url)}
                          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/[0.12]"
                        >
                          <Play className="h-3 w-3" />
                          <span>Play</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                    {turn.text}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Right: Locked V1 Build Specification */}
      <aside className="lg:col-span-4 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
              V1 Build Spec
            </h3>
          </div>
          {spec && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-300">
              Locked
            </span>
          )}
        </div>

        {!spec ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <ShieldAlert className="h-7 w-7 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">Waiting for boardroom consensus...</p>
            <p className="mt-1 text-xs text-zinc-600">
              Once debate concludes, the V1 headline, pricing, pages, and top risks appear here.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                Hero Headline
              </div>
              <p
                className="mt-1 text-lg font-bold leading-snug text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {spec.headline}
              </p>
              {spec.price_usd !== null && (
                <div className="mt-3 inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-200">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>{spec.price_usd} USD</span>
                </div>
              )}
            </div>

            {spec.pages.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  MVP Sections / Flows
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {spec.pages.map((page, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-200"
                    >
                      {page}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {spec.risks.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-rose-400">
                  Key Risks Flagged
                </div>
                <ul className="space-y-2">
                  {spec.risks.map((risk, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2 text-xs text-rose-100"
                    >
                      <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
