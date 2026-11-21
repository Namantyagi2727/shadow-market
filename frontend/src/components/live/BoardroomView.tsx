"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  resolveArtifactUrl,
  type BoardroomTurnData,
  type SpecReadyData,
} from "@/lib/contracts";
import { formatPrice } from "./types";

type BoardroomTurnItem = BoardroomTurnData & { seq: number; ts: string };

interface BoardroomViewProps {
  runId: string;
  turns: BoardroomTurnItem[];
  spec: SpecReadyData | null;
  isActive: boolean;
}

const BAR_COUNT = 28;
const IDLE_BARS: number[] = Array.from({ length: BAR_COUNT }, (_, idx) => {
  const wave = Math.sin((idx / (BAR_COUNT - 1)) * Math.PI);
  return 0.14 + wave * 0.18;
});

function AudioWaveform({
  audioUrl,
  turnKey,
}: {
  audioUrl: string | null;
  turnKey: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceConnectedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [bars, setBars] = useState<number[]>(IDLE_BARS);
  const [useFallbackBars, setUseFallbackBars] = useState(false);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopLoop();
    setIsPlaying(false);
    setBars(IDLE_BARS);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [turnKey, audioUrl, stopLoop]);

  useEffect(() => {
    return () => {
      stopLoop();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopLoop]);

  const startVisualizer = useCallback(() => {
    stopLoop();
    const startTime = performance.now();

    const tick = (now: number) => {
      const analyser = analyserRef.current;
      if (analyser && !useFallbackBars) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const hasSignal = data.some((val) => val > 2);
        if (hasSignal) {
          const next = Array.from({ length: BAR_COUNT }, (_, idx) => {
            const bin = Math.min(
              data.length - 1,
              Math.floor((idx / BAR_COUNT) * (data.length * 0.85))
            );
            return Math.max(0.12, Math.min(1, data[bin] / 220));
          });
          setBars(next);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      // Deterministic smooth fallback animation when Web Audio is blocked or silent
      const t = (now - startTime) / 1000;
      const next = Array.from({ length: BAR_COUNT }, (_, idx) => {
        const envelope = Math.sin((idx / (BAR_COUNT - 1)) * Math.PI);
        const ripple =
          0.5 +
          0.32 * Math.sin(t * 6.2 + idx * 0.55) +
          0.18 * Math.cos(t * 9.5 - idx * 0.35);
        return Math.max(0.14, Math.min(1, envelope * ripple * 0.95 + 0.12));
      });
      setBars(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop, useFallbackBars]);

  const ensureAudioGraph = useCallback(() => {
    const el = audioRef.current;
    if (!el || sourceConnectedRef.current) return;
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) {
        setUseFallbackBars(true);
        return;
      }
      const ctx = new AudioContextCtor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      const src = ctx.createMediaElementSource(el);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceConnectedRef.current = true;
    } catch {
      setUseFallbackBars(true);
    }
  }, []);

  const togglePlayback = async () => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (isPlaying) {
      el.pause();
      return;
    }
    ensureAudioGraph();
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      try {
        await audioCtxRef.current.resume();
      } catch {
        setUseFallbackBars(true);
      }
    }
    try {
      await el.play();
    } catch {
      setUseFallbackBars(true);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => void togglePlayback()}
        disabled={!audioUrl}
        aria-label={isPlaying ? "Pause turn audio" : "Play turn audio"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] text-[#E8EAED] transition-colors duration-200 hover:bg-[#2A2B30] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" strokeWidth={1.5} />
        ) : (
          <Play className="h-4 w-4 translate-x-[1px]" strokeWidth={1.5} />
        )}
      </button>

      <div
        className="flex h-8 flex-1 items-center gap-[3px]"
        aria-hidden="true"
      >
        {bars.map((height, idx) => (
          <span
            key={idx}
            className="w-[3px] rounded-full transition-[height,background-color] duration-100"
            style={{
              height: `${Math.round(height * 28)}px`,
              backgroundColor: isPlaying ? "#E8EAED" : "#3A3B40",
            }}
          />
        ))}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin="anonymous"
          preload="metadata"
          onPlay={() => {
            setIsPlaying(true);
            startVisualizer();
          }}
          onPause={() => {
            setIsPlaying(false);
            stopLoop();
            setBars(IDLE_BARS);
          }}
          onEnded={() => {
            setIsPlaying(false);
            stopLoop();
            setBars(IDLE_BARS);
          }}
        />
      )}
    </div>
  );
}

export function BoardroomView({
  runId,
  turns,
  spec,
  isActive,
}: BoardroomViewProps) {
  const [pinnedSeq, setPinnedSeq] = useState<number | null>(null);

  // Follow the latest turn automatically unless the user pinned an earlier turn
  const activeTurn = useMemo(() => {
    if (turns.length === 0) return null;
    if (pinnedSeq !== null) {
      const found = turns.find((t) => t.seq === pinnedSeq);
      if (found) return found;
    }
    return turns[turns.length - 1];
  }, [turns, pinnedSeq]);

  // Clear pin when new turns stream in so live view tracks the conversation
  const prevTurnCountRef = useRef(turns.length);
  useEffect(() => {
    if (turns.length > prevTurnCountRef.current) {
      setPinnedSeq(null);
    }
    prevTurnCountRef.current = turns.length;
  }, [turns.length]);

  const strategistModel =
    turns.find((t) => t.speaker === "strategist")?.model || "gemini-4-neon";
  const skepticModel =
    turns.find((t) => t.speaker === "skeptic")?.model || "gemini-4-argon";

  const strategistTurns = useMemo(
    () => turns.filter((t) => t.speaker === "strategist"),
    [turns]
  );
  const skepticTurns = useMemo(
    () => turns.filter((t) => t.speaker === "skeptic"),
    [turns]
  );

  if (turns.length === 0 && !spec) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-[#5F6368]">
            Waiting for boardroom debate…
          </p>
          {isActive && (
            <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  const activeAudioUrl = activeTurn
    ? resolveArtifactUrl(runId, activeTurn.audio_url)
    : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-7 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
        {/* Two speaker columns */}
        <div className="grid grid-cols-2 gap-6">
          {(
            [
              {
                role: "strategist" as const,
                initial: "S",
                label: "Strategist",
                model: strategistModel,
                items: strategistTurns,
              },
              {
                role: "skeptic" as const,
                initial: "K",
                label: "Skeptic",
                model: skepticModel,
                items: skepticTurns,
              },
            ] as const
          ).map((col) => {
            const isSpeaking = activeTurn?.speaker === col.role;
            const previousItems = col.items.filter(
              (item) => item.seq !== activeTurn?.seq
            );

            return (
              <section
                key={col.role}
                className={`flex flex-col rounded-[16px] border p-6 transition-colors duration-200 ${
                  isSpeaking
                    ? "border-[#3A3C44] bg-[#16171A]"
                    : "border-[#2A2B30] bg-[#16171A]/70"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[13px] font-medium ${
                      isSpeaking
                        ? "border-[#E8EAED]/40 bg-[#1C1D21] text-[#E8EAED]"
                        : "border-[#2A2B30] bg-[#1C1D21] text-[#9AA0A6]"
                    }`}
                  >
                    {col.initial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-[#E8EAED]">
                      {col.label}
                    </div>
                    <div className="truncate font-mono text-[12px] text-[#5F6368]">
                      {col.model}
                    </div>
                  </div>
                </div>

                {isSpeaking && activeTurn ? (
                  <div className="mt-6 flex flex-1 flex-col justify-between gap-6">
                    <p className="text-[20px] font-normal leading-[1.5] text-[#E8EAED]">
                      {activeTurn.text}
                    </p>
                    <div className="border-t border-[#2A2B30] pt-4">
                      <AudioWaveform
                        audioUrl={activeAudioUrl}
                        turnKey={activeTurn.seq}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex-1">
                    {col.items.length === 0 ? (
                      <p className="text-[13px] text-[#5F6368]">
                        Waiting to respond…
                      </p>
                    ) : null}
                  </div>
                )}

                {previousItems.length > 0 && (
                  <div className="mt-5 space-y-2 border-t border-[#2A2B30] pt-4">
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                      Earlier turns
                    </div>
                    {previousItems.map((turn) => (
                      <button
                        key={turn.seq}
                        type="button"
                        onClick={() => setPinnedSeq(turn.seq)}
                        className="block w-full rounded-[10px] px-2.5 py-2 text-left text-[13px] leading-[1.45] text-[#9AA0A6] transition-colors duration-200 hover:bg-[#1C1D21] hover:text-[#E8EAED]"
                      >
                        <span className="line-clamp-2">{turn.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Locked Spec card */}
        {spec && (
          <section className="rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Locked MVP spec
                </div>
                <h2 className="mt-2 text-[20px] font-medium leading-[1.35] text-[#E8EAED]">
                  {spec.headline}
                </h2>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Price
                </div>
                <div className="mt-1 text-[32px] font-normal leading-none tabular-nums text-[#E8EAED]">
                  {formatPrice(spec.price_usd)}
                </div>
              </div>
            </div>

            {spec.risks.length > 0 && (
              <div className="mt-5 border-t border-[#2A2B30] pt-4">
                <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Flagged risks
                </div>
                <ul className="mt-2.5 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {spec.risks.slice(0, 4).map((risk, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-[13px] leading-[1.45] text-[#9AA0A6]"
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[#5F6368]">
                        0{idx + 1}
                      </span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
