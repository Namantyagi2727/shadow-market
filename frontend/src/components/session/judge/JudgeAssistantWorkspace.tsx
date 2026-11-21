"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { useSessionEvents } from "@/components/session/useSessionEvents";
import {
  RoomMicStreamer,
  type RoomMicStats,
  type RoomMicStatus,
} from "@/lib/room-mic";
import { FindingsSection } from "./FindingsSection";
import { JudgeTopBar } from "./JudgeTopBar";
import { QuestionsPanel } from "./QuestionsPanel";
import { ResearchStrip } from "./ResearchStrip";
import { TeamChannel } from "./TeamChannel";
import { TranscriptPanel } from "./TranscriptPanel";
import { TypedAskBar } from "./TypedAskBar";
import {
  extractJudgeQuestions,
  extractPitchResearch,
  extractResearchSteps,
  extractTranscript,
} from "./types";

interface JudgeAssistantWorkspaceProps {
  runId: string;
  fontClassName: string;
}

const JUDGE_STYLES = `
  .judge-root {
    font-family: var(--font-live-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-sans: var(--font-live-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-mono: var(--font-live-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  .judge-root .font-mono {
    font-family: var(--font-live-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  @keyframes judgeShimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .judge-shimmer-bar {
    background-image: linear-gradient(
      90deg,
      rgba(66, 133, 244, 0.15) 0%,
      #4285F4 25%,
      #9B72CB 50%,
      #D96570 75%,
      rgba(217, 101, 112, 0.15) 100%
    );
    background-size: 200% 100%;
    animation: judgeShimmer 1.6s linear infinite;
  }

  @keyframes judgePulseDot {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(0.85);
    }
  }

  .judge-pulse-dot {
    animation: judgePulseDot 1.8s ease-in-out infinite;
  }

  @keyframes judgeFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .judge-fade-in {
    animation: judgeFadeIn 240ms ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    .judge-shimmer-bar {
      animation: none;
      background-size: 100% 100%;
    }
    .judge-pulse-dot,
    .judge-fade-in {
      animation: none;
    }
  }
`;

const ZERO_STATS: RoomMicStats = {
  framesPerSec: 0,
  bytesPerSec: 0,
  level: 0,
};

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

export function JudgeAssistantWorkspace({
  runId,
  fontClassName,
}: JudgeAssistantWorkspaceProps) {
  const { events, status: streamStatus } = useSessionEvents(runId);

  const [micStatus, setMicStatus] = useState<RoomMicStatus>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [micStats, setMicStats] = useState<RoomMicStats>(ZERO_STATS);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<RoomMicStreamer | null>(null);
  const mountedRef = useRef(true);

  const stopMic = useCallback(() => {
    if (micRef.current) {
      try {
        micRef.current.stop();
      } catch {
        // Ignore cleanup errors
      }
      micRef.current = null;
    }
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx.state !== "closed") {
        void ctx.close().catch(() => {
          // Ignore close errors
        });
      }
    }
    setMicStats(ZERO_STATS);
    setMicStatus("stopped");
  }, []);

  const startMic = useCallback(async () => {
    setMicError(null);

    if (micRef.current || audioCtxRef.current) {
      stopMic();
    }

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      await ctx.resume();
      if (!mountedRef.current) {
        void ctx.close().catch(() => {});
        return;
      }
      audioCtxRef.current = ctx;
    } catch (err) {
      setMicStatus("error");
      setMicError(formatError(err, "Could not start AudioContext."));
      return;
    }

    try {
      const mic = new RoomMicStreamer({
        runId,
        role: "judge",
        onStatus: (nextStatus, detail) => {
          if (!mountedRef.current) return;
          setMicStatus(nextStatus);
          if (nextStatus === "error") {
            setMicError(detail || "Microphone error.");
          } else if (nextStatus === "listening") {
            setMicError(null);
          }
        },
        onStats: (nextStats) => {
          if (!mountedRef.current) return;
          setMicStats(nextStats);
        },
      });
      micRef.current = mic;
      await mic.start(ctx);
    } catch (err) {
      if (!mountedRef.current) return;
      setMicStatus("error");
      setMicError(formatError(err, "Failed to start microphone."));
    }
  }, [runId, stopMic]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (micRef.current) {
        try {
          micRef.current.stop();
        } catch {
          // Ignore cleanup errors
        }
        micRef.current = null;
      }
      if (audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        audioCtxRef.current = null;
        if (ctx.state !== "closed") {
          void ctx.close().catch(() => {});
        }
      }
    };
  }, []);

  const micActive =
    micStatus === "starting" ||
    micStatus === "listening" ||
    micStatus === "muted" ||
    micStatus === "reconnecting";

  const handleToggleMic = useCallback(() => {
    if (micActive) {
      stopMic();
    } else {
      void startMic();
    }
  }, [micActive, startMic, stopMic]);

  const { utterances, interimCaptions } = useMemo(
    () => extractTranscript(events),
    [events]
  );

  const questions = useMemo(() => extractJudgeQuestions(events), [events]);

  const researchSteps = useMemo(
    () => extractResearchSteps(events, questions.length > 0),
    [events, questions.length]
  );

  const research = useMemo(() => extractPitchResearch(events), [events]);

  return (
    <div
      className={`judge-root ${fontClassName} flex h-screen w-screen flex-col overflow-hidden bg-[#0E0F11] text-[#E8EAED] selection:bg-[#4285F4]/25 selection:text-[#E8EAED]`}
    >
      <style>{JUDGE_STYLES}</style>

      <JudgeTopBar
        runId={runId}
        streamStatus={streamStatus}
        micStatus={micStatus}
        micStats={micStats}
        micActive={micActive}
        onToggleMic={handleToggleMic}
      />

      {micError && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#F28B82]/30 bg-[#16171A] px-6 py-2 text-[13px] text-[#F28B82]">
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{micError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMicError(null)}
            aria-label="Dismiss microphone error"
            className="rounded-[6px] p-1 text-[#9AA0A6] transition-colors hover:bg-[#1C1D21] hover:text-[#E8EAED]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left column (28%): Live transcript + compact research strip */}
        <aside className="flex min-h-0 w-[28%] shrink-0 flex-col border-r border-[#2A2B30] bg-[#0E0F11]">
          <TranscriptPanel
            utterances={utterances}
            interimCaptions={interimCaptions}
          />
          <ResearchStrip steps={researchSteps} />
        </aside>

        {/* Middle column (36%): the expert team channel */}
        <section className="flex min-h-0 w-[36%] shrink-0 flex-col border-r border-[#2A2B30] bg-[#0E0F11] px-5 py-5">
          <TeamChannel events={events} />
        </section>

        {/* Right column: Questions + What we found + Typed fallback */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0E0F11] px-6 py-5">
          <QuestionsPanel
            questions={questions}
            researchSteps={researchSteps}
          />
          <FindingsSection research={research} />
          <TypedAskBar runId={runId} />
        </main>
      </div>
    </div>
  );
}
