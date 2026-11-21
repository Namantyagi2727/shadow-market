"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Mic,
  MicOff,
  Play,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useSessionEvents } from "@/components/session/useSessionEvents";
import { getApiBase } from "@/lib/contracts";
import {
  RoomMicStreamer,
  type RoomMicStats,
  type RoomMicStatus,
} from "@/lib/room-mic";
import { HeroAnswerCard } from "./HeroAnswerCard";
import { PitchColumn } from "./PitchColumn";
import { PreparedAnswersColumn } from "./PreparedAnswersColumn";
import { ResearchColumn } from "./ResearchColumn";
import {
  findMatchingJudgeQuestion,
  getLatestResearchStatuses,
  mergePitchResearch,
  type FounderPrepPayload,
  type PitchUpdatePayload,
  type RoomCaptionPayload,
  type SessionFounderBriefPayload,
} from "./types";

interface FounderWorkspaceProps {
  runId: string;
  fontClassName: string;
}

const FOUNDER_STYLES = `
  .founder-root {
    font-family: var(--font-founder-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-sans: var(--font-founder-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-mono: var(--font-founder-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  .founder-root .font-mono {
    font-family: var(--font-founder-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  @keyframes founderShimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .founder-shimmer-bar {
    background-image: linear-gradient(
      90deg,
      rgba(66, 133, 244, 0.15) 0%,
      #4285F4 25%,
      #9B72CB 50%,
      #D96570 75%,
      rgba(217, 101, 112, 0.15) 100%
    );
    background-size: 200% 100%;
    animation: founderShimmer 1.6s linear infinite;
  }

  @keyframes founderPulseDot {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(0.85);
    }
  }

  .founder-pulse-dot {
    animation: founderPulseDot 1.8s ease-in-out infinite;
  }

  @keyframes founderFadeIn {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .founder-fade-in {
    animation: founderFadeIn 220ms ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    .founder-shimmer-bar {
      animation: none;
      background-size: 100% 100%;
    }
    .founder-pulse-dot,
    .founder-fade-in {
      animation: none;
    }
  }
`;

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

async function postSessionAction(
  runId: string,
  endpoint: "pitch-done" | "ask" | "full-run",
  body: Record<string, unknown> = {}
): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/session/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { detail?: string; message?: string };
          detail = parsed.detail || parsed.message || text;
        } catch {
          detail = text;
        }
      }
    } catch {
      // ignore body read error
    }
    throw new Error(detail);
  }
}

function micStatusLabel(status: RoomMicStatus): string {
  switch (status) {
    case "listening":
      return "Listening";
    case "starting":
      return "Starting…";
    case "reconnecting":
      return "Reconnecting";
    case "muted":
      return "Muted";
    case "error":
      return "Mic error";
    case "idle":
    case "stopped":
    default:
      return "Mic off";
  }
}

function micDotClass(status: RoomMicStatus): string {
  switch (status) {
    case "listening":
      return "founder-pulse-dot bg-[#81C995]";
    case "starting":
    case "reconnecting":
    case "muted":
      return "founder-pulse-dot bg-[#FDD663]";
    case "error":
      return "bg-[#F28B82]";
    case "idle":
    case "stopped":
    default:
      return "bg-[#5F6368]";
  }
}

export function FounderWorkspace({
  runId,
  fontClassName,
}: FounderWorkspaceProps) {
  const { events, status: streamStatus, latest, all } = useSessionEvents(runId);

  // Mic state (role: "founder")
  const [micActive, setMicActive] = useState(false);
  const [micStatus, setMicStatus] = useState<RoomMicStatus>("idle");
  const [micDetail, setMicDetail] = useState<string | undefined>(undefined);
  const [micStats, setMicStats] = useState<RoomMicStats>({
    framesPerSec: 0,
    bytesPerSec: 0,
    level: 0,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<RoomMicStreamer | null>(null);
  const mountedRef = useRef(true);

  // Action states
  const [pitchDoneBusy, setPitchDoneBusy] = useState(false);
  const [pitchDoneSent, setPitchDoneSent] = useState(false);
  const [fullRunBusy, setFullRunBusy] = useState(false);
  const [fullRunStarted, setFullRunStarted] = useState(false);
  const [askText, setAskText] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

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
    setMicActive(false);
    setMicStatus("stopped");
    setMicDetail(undefined);
    setMicStats({ framesPerSec: 0, bytesPerSec: 0, level: 0 });
  }, []);

  const startMic = useCallback(async () => {
    if (micActive) return;
    setInlineError(null);
    setMicDetail(undefined);

    if (micRef.current) {
      try {
        micRef.current.stop();
      } catch {
        // Ignore cleanup errors
      }
      micRef.current = null;
    }
    if (audioCtxRef.current) {
      const prevCtx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (prevCtx.state !== "closed") {
        void prevCtx.close().catch(() => {});
      }
    }

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      await ctx.resume();
    } catch (err) {
      const msg = formatError(err, "Could not start browser AudioContext.");
      setMicStatus("error");
      setMicDetail(msg);
      setInlineError(msg);
      return;
    }

    if (!mountedRef.current) {
      void ctx.close().catch(() => {});
      return;
    }

    audioCtxRef.current = ctx;
    const streamer = new RoomMicStreamer({
      runId,
      role: "founder",
      onStatus: (nextStatus, detail) => {
        if (!mountedRef.current) return;
        setMicStatus(nextStatus);
        setMicDetail(detail);
        if (nextStatus === "error") {
          setMicActive(false);
          if (detail) setInlineError(detail);
        }
      },
      onStats: (stats) => {
        if (!mountedRef.current) return;
        setMicStats(stats);
      },
    });

    micRef.current = streamer;
    setMicActive(true);

    try {
      await streamer.start(ctx);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = formatError(err, "Failed to start microphone.");
      setMicActive(false);
      setMicStatus("error");
      setMicDetail(msg);
      setInlineError(msg);
    }
  }, [micActive, runId]);

  const toggleMic = useCallback(() => {
    if (micActive) {
      stopMic();
    } else {
      void startMic();
    }
  }, [micActive, startMic, stopMic]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopMic();
    };
  }, [stopMic]);

  // Derived session state from useSessionEvents
  const latestBriefEvent = latest("founder_brief");
  const latestBrief =
    (latestBriefEvent?.data as SessionFounderBriefPayload | null) ?? null;

  const utterances = all("room_utterance");
  const latestJudgeQuestion = findMatchingJudgeQuestion(
    latestBriefEvent,
    utterances
  );

  const pitchUpdate =
    (latest("pitch_update")?.data as PitchUpdatePayload | null) ?? null;

  const research = mergePitchResearch(all("pitch_research"));
  const researchStatuses = getLatestResearchStatuses(all("research_status"));

  const founderPrep =
    (latest("founder_prep")?.data as FounderPrepPayload | null) ?? null;
  const preparedAnswers = Array.isArray(founderPrep?.answers)
    ? founderPrep.answers
    : [];

  const captionEvents = all("room_caption");
  let latestFounderCaption: string | null = null;
  for (let i = captionEvents.length - 1; i >= 0; i--) {
    const data = captionEvents[i].data as RoomCaptionPayload | null | undefined;
    if (
      data?.role === "founder" &&
      typeof data.text === "string" &&
      data.text.trim()
    ) {
      latestFounderCaption = data.text.trim();
      break;
    }
  }

  const latestCaptionData = latest("room_caption")?.data as
    | RoomCaptionPayload
    | null
    | undefined;
  const latestAnyCaption =
    latestCaptionData &&
    typeof latestCaptionData.text === "string" &&
    latestCaptionData.text.trim()
      ? { text: latestCaptionData.text.trim(), role: latestCaptionData.role }
      : null;

  const hasPipelineEvents = useMemo(
    () =>
      events.some(
        (e) =>
          e.type === "pitch_parsed" ||
          e.type === "boardroom_turn" ||
          e.type === "mvp_ready" ||
          (e.type === "stage_changed" &&
            e.data &&
            typeof e.data.stage === "string" &&
            e.data.stage !== "room")
      ),
    [events]
  );

  const showFullRunLink = fullRunStarted || hasPipelineEvents;

  const handlePitchDone = async () => {
    if (pitchDoneBusy) return;
    setPitchDoneBusy(true);
    setInlineError(null);
    try {
      await postSessionAction(runId, "pitch-done", {});
      setPitchDoneSent(true);
    } catch (err) {
      setInlineError(formatError(err, "Could not trigger pitch research."));
    } finally {
      setPitchDoneBusy(false);
    }
  };

  const handleFullRun = async () => {
    if (fullRunBusy) return;
    setFullRunBusy(true);
    setInlineError(null);
    try {
      await postSessionAction(runId, "full-run", {});
      setFullRunStarted(true);
    } catch (err) {
      setInlineError(formatError(err, "Could not start full simulation."));
    } finally {
      setFullRunBusy(false);
    }
  };

  const handleSimulateJudgeAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = askText.trim();
    if (!trimmed || askBusy) return;
    setAskBusy(true);
    setInlineError(null);
    try {
      await postSessionAction(runId, "ask", { text: trimmed, role: "judge" });
      setAskText("");
    } catch (err) {
      setInlineError(formatError(err, "Could not send simulated judge question."));
    } finally {
      setAskBusy(false);
    }
  };

  const levelPct = Math.round(
    Math.min(1, Math.max(0, Number.isFinite(micStats.level) ? micStats.level : 0)) *
      100
  );

  const matchedQuestionId =
    typeof latestBrief?.matched_question_id === "string" &&
    latestBrief.matched_question_id.trim()
      ? latestBrief.matched_question_id
      : null;

  return (
    <div
      className={`founder-root ${fontClassName} flex h-screen w-screen flex-col overflow-hidden bg-[#0E0F11] text-[#E8EAED] selection:bg-[#4285F4]/25 selection:text-[#E8EAED]`}
    >
      <style>{FOUNDER_STYLES}</style>

      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#2A2B30] bg-[#0E0F11] px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-[15px] font-medium tracking-[-0.01em] text-[#E8EAED]">
            Founder&apos;s assistant
          </span>
          <span className="h-3.5 w-px shrink-0 bg-[#2A2B30]" aria-hidden="true" />
          <span className="rounded-[8px] border border-[#2A2B30] bg-[#16171A] px-2.5 py-0.5 font-mono text-[12px] text-[#9AA0A6]">
            {runId}
          </span>
          <span
            className="hidden items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368] xl:inline-flex"
            title={`Event stream: ${streamStatus}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                streamStatus === "connected"
                  ? "bg-[#81C995]"
                  : streamStatus === "connecting" || streamStatus === "reconnecting"
                  ? "founder-pulse-dot bg-[#FDD663]"
                  : "bg-[#F28B82]"
              }`}
              aria-hidden="true"
            />
            <span>{streamStatus === "connected" ? "Live" : streamStatus}</span>
          </span>
        </div>

        {/* Controls: Mic + I'm done pitching + Run full simulation */}
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Mic status + Start/Stop */}
          <div className="flex items-center gap-2.5 rounded-[10px] border border-[#2A2B30] bg-[#16171A] py-1 pl-3 pr-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${micDotClass(micStatus)}`}
                aria-hidden="true"
              />
              <span className="text-[12px] font-medium text-[#E8EAED]">
                {micStatusLabel(micStatus)}
              </span>
            </div>

            {micActive && (
              <div
                className="h-1.5 w-12 overflow-hidden rounded-full bg-[#2A2B30]"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-[#81C995] transition-[width] duration-100"
                  style={{ width: `${Math.max(8, levelPct)}%` }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={toggleMic}
              className={`flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-medium transition-colors duration-150 ${
                micActive
                  ? "border border-[#F28B82]/35 bg-[#F28B82]/12 text-[#F28B82] hover:bg-[#F28B82]/20"
                  : "bg-[#E8EAED] text-[#0E0F11] hover:bg-white"
              }`}
            >
              {micActive ? (
                <>
                  <MicOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Stop mic</span>
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Start mic</span>
                </>
              )}
            </button>
          </div>

          {/* I'm done pitching */}
          <button
            type="button"
            disabled={pitchDoneBusy}
            onClick={() => void handlePitchDone()}
            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[#E8EAED] px-3.5 text-[13px] font-medium text-[#0E0F11] transition-colors duration-150 hover:bg-white disabled:opacity-50"
          >
            {pitchDoneSent && !pitchDoneBusy ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span>
              {pitchDoneBusy ? "Running research…" : "I'm done pitching"}
            </span>
          </button>

          {/* Run full simulation / Link to /live/{runId} */}
          {showFullRunLink ? (
            <Link
              href={`/live/${encodeURIComponent(runId)}`}
              className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#81C995]/40 bg-[#81C995]/12 px-3.5 text-[13px] font-medium text-[#81C995] transition-colors duration-150 hover:bg-[#81C995]/20"
            >
              <span>Open full run</span>
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
          ) : (
            <button
              type="button"
              disabled={fullRunBusy}
              onClick={() => void handleFullRun()}
              className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#16171A] px-3.5 text-[13px] font-medium text-[#E8EAED] transition-colors duration-150 hover:border-[#5F6368] hover:bg-[#1C1D21] disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 text-[#9AA0A6]" strokeWidth={1.75} />
              <span>{fullRunBusy ? "Starting…" : "Run full simulation"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content — fixed viewport, no outer scroll */}
      <main className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
        {/* Inline non-fatal error strip */}
        {(inlineError || (micStatus === "error" && micDetail)) && (
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-[12px] border border-[#F28B82]/35 bg-[#F28B82]/10 px-4 py-2 text-[12.5px] text-[#F28B82]">
            <div className="flex min-w-0 items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{inlineError || micDetail}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setInlineError(null);
                setMicDetail(undefined);
              }}
              aria-label="Dismiss error"
              className="rounded-md p-1 text-[#F28B82] hover:bg-[#F28B82]/15"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Full-width Hero: Live Answer Card */}
        <HeroAnswerCard
          brief={latestBrief}
          judgeQuestion={latestJudgeQuestion}
        />

        {/* Three-column workspace */}
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 overflow-hidden">
          <PitchColumn
            pitchUpdate={pitchUpdate}
            founderCaption={latestFounderCaption}
            extractedPitch={research?.pitch ?? null}
            pitchStatus={researchStatuses.pitch ?? null}
          />

          <ResearchColumn
            research={research}
            researchStatuses={researchStatuses}
          />

          <PreparedAnswersColumn
            answers={preparedAnswers}
            matchedQuestionId={matchedQuestionId}
            prepStatus={researchStatuses.prep ?? null}
            questionsStatus={researchStatuses.questions ?? null}
          />
        </div>

        {/* Bottom strip: subtle live caption + typed fallback */}
        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[#2A2B30] pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                latestAnyCaption
                  ? "founder-pulse-dot bg-[#9AA0A6]"
                  : "bg-[#5F6368]"
              }`}
              aria-hidden="true"
            />
            <p className="truncate text-[12px] text-[#5F6368]">
              {latestAnyCaption
                ? `${latestAnyCaption.role ? `${latestAnyCaption.role}: ` : ""}${latestAnyCaption.text}`
                : "Live room transcript idle — start mic or simulate a judge question."}
            </p>
          </div>

          <form
            onSubmit={(e) => void handleSimulateJudgeAsk(e)}
            className="flex shrink-0 items-center gap-2"
          >
            <input
              type="text"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Simulate a judge question"
              disabled={askBusy}
              className="h-8 w-[300px] rounded-[10px] border border-[#2A2B30] bg-[#16171A] px-3 text-[12.5px] text-[#E8EAED] placeholder:text-[#5F6368] focus:border-[#9AA0A6] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={askBusy || !askText.trim()}
              className="flex h-8 items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 text-[12px] font-medium text-[#E8EAED] transition-colors duration-150 hover:border-[#5F6368] hover:bg-[#232429] disabled:opacity-40"
            >
              <Send className="h-3 w-3 text-[#9AA0A6]" strokeWidth={1.75} />
              <span>{askBusy ? "Sending…" : "Ask"}</span>
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
}
