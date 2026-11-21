"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  resolveArtifactUrl,
  type FounderBriefBadge,
  type FounderBriefData,
  type RoomUtteranceData,
  type TwinChallengeData,
} from "@/lib/contracts";

interface RoomViewProps {
  runId: string;
  twinChallenges: TwinChallengeData[];
  founderBriefs: FounderBriefData[];
  roomCaption: string | null;
  roomUtterances: RoomUtteranceData[];
  isActive: boolean;
}

function badgeConfig(badge: FounderBriefBadge): {
  label: string;
  className: string;
} {
  switch (badge) {
    case "VERIFIED":
      return {
        label: "VERIFIED",
        className: "border-[#81C995]/30 bg-[#81C995]/10 text-[#81C995]",
      };
    case "PARTIAL":
      return {
        label: "PARTIAL",
        className: "border-[#FDD663]/30 bg-[#FDD663]/10 text-[#FDD663]",
      };
    case "PUSH_BACK":
      return {
        label: "PUSH BACK",
        className: "border-[#F28B82]/30 bg-[#F28B82]/10 text-[#F28B82]",
      };
  }
}

export function RoomView({
  runId,
  twinChallenges,
  founderBriefs,
  roomCaption,
  roomUtterances,
  isActive,
}: RoomViewProps) {
  const latestChallenge =
    twinChallenges.length > 0
      ? twinChallenges[twinChallenges.length - 1]
      : null;

  const latestBrief = useMemo(() => {
    if (founderBriefs.length === 0) return null;
    if (latestChallenge) {
      const matched = founderBriefs.find(
        (b) => b.challenge_id === latestChallenge.challenge_id
      );
      if (matched) return matched;
    }
    return founderBriefs[founderBriefs.length - 1];
  }, [founderBriefs, latestChallenge]);

  const words = useMemo(() => {
    if (!latestChallenge?.text) return [];
    return latestChallenge.text.trim().split(/\s+/);
  }, [latestChallenge?.text]);

  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (!latestChallenge) {
      setRevealedCount(0);
      return undefined;
    }

    const total = words.length;
    if (total === 0) {
      setRevealedCount(0);
      return undefined;
    }

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setRevealedCount(total);
      return undefined;
    }

    setRevealedCount(0);
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setRevealedCount(count);
      if (count >= total) {
        window.clearInterval(timer);
      }
    }, 65);

    return () => window.clearInterval(timer);
  }, [latestChallenge?.challenge_id, words.length]);

  // Optional audio play button if server fallback audio_url exists
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const challengeAudioUrl = latestChallenge
    ? resolveArtifactUrl(runId, latestChallenge.audio_url)
    : null;

  useEffect(() => {
    setAudioPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [latestChallenge?.challenge_id]);

  const toggleChallengeAudio = async () => {
    const el = audioRef.current;
    if (!el || !challengeAudioUrl) return;
    if (audioPlaying) {
      el.pause();
    } else {
      try {
        await el.play();
      } catch {
        // Ignore autoplay restrictions
      }
    }
  };

  const captionText =
    roomCaption ||
    (roomUtterances.length > 0
      ? roomUtterances[roomUtterances.length - 1].text
      : null);

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden px-8 py-8 lg:px-14">
      {/* Main challenge + founder brief */}
      <div className="mx-auto flex min-h-0 w-full max-w-[840px] flex-1 flex-col justify-center gap-10 overflow-y-auto">
        {!latestChallenge && !latestBrief ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-[14px] text-[#5F6368]">
              Waiting for live Q&amp;A challenges…
            </p>
            {isActive && (
              <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
            )}
          </div>
        ) : (
          <>
            {/* Latest Judge Twin Challenge */}
            {latestChallenge && (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
                      Seat {latestChallenge.seat}
                      {latestChallenge.role ? ` · ${latestChallenge.role}` : ""}
                    </span>
                    <span className="font-mono text-[11px] text-[#5F6368]">
                      {latestChallenge.source === "live"
                        ? "gemini-3.8-live"
                        : "gemini-4-hydrogen"}
                    </span>
                  </div>

                  {challengeAudioUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => void toggleChallengeAudio()}
                        aria-label={
                          audioPlaying
                            ? "Pause challenge voice"
                            : "Play challenge voice"
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#2A2B30] bg-[#16171A] text-[#9AA0A6] transition-colors hover:text-[#E8EAED]"
                      >
                        {audioPlaying ? (
                          <Pause className="h-3.5 w-3.5" strokeWidth={1.5} />
                        ) : (
                          <Play
                            className="h-3.5 w-3.5 translate-x-[1px]"
                            strokeWidth={1.5}
                          />
                        )}
                      </button>
                      <audio
                        ref={audioRef}
                        src={challengeAudioUrl}
                        onPlay={() => setAudioPlaying(true)}
                        onPause={() => setAudioPlaying(false)}
                        onEnded={() => setAudioPlaying(false)}
                      />
                    </>
                  )}
                </div>

                <h1 className="text-[28px] font-normal leading-[1.4] tracking-[-0.015em] text-[#E8EAED] lg:text-[32px]">
                  {words.map((word, idx) => {
                    const underlined = idx < revealedCount;
                    return (
                      <React.Fragment key={`${latestChallenge.challenge_id}-${idx}`}>
                        <span
                          className={`inline-block transition-all duration-200 ${
                            underlined ? "live-challenge-word" : "pb-[3px]"
                          }`}
                        >
                          {word}
                        </span>
                        {idx < words.length - 1 ? " " : ""}
                      </React.Fragment>
                    );
                  })}
                </h1>
              </section>
            )}

            {/* Latest Founder Brief Card */}
            {latestBrief && (
              <section className="live-fade-in rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-7">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-[10px] border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] ${
                        badgeConfig(latestBrief.badge).className
                      }`}
                    >
                      {badgeConfig(latestBrief.badge).label}
                    </span>
                    <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                      Founder brief
                    </span>
                  </div>

                  {latestBrief.latency_ms > 0 && (
                    <span className="font-mono text-[12px] tabular-nums text-[#5F6368]">
                      {latestBrief.latency_ms} ms
                    </span>
                  )}
                </div>

                <p className="mt-5 text-[24px] font-medium leading-[1.35] tracking-[-0.01em] text-[#E8EAED]">
                  {latestBrief.line}
                </p>

                {latestBrief.proof.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    {latestBrief.proof.map((pill, idx) => (
                      <div
                        key={`${idx}-${pill.label}`}
                        className="flex items-center gap-2 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-1.5 text-[12px]"
                      >
                        <span className="text-[#9AA0A6]">{pill.label}</span>
                        <span className="font-medium text-[#E8EAED]">
                          {pill.value}
                        </span>
                        <span className="font-mono text-[11px] text-[#5F6368]">
                          {pill.source}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Bottom live caption ticker */}
      <footer className="mx-auto mt-6 flex w-full max-w-[840px] shrink-0 items-center gap-3 border-t border-[#2A2B30] pt-4">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            roomCaption ? "live-pulse-dot bg-[#9AA0A6]" : "bg-[#5F6368]"
          }`}
          aria-hidden="true"
        />
        <p className="truncate text-[13px] text-[#5F6368]">
          {captionText || "Listening to live room captions…"}
        </p>
      </footer>
    </div>
  );
}
