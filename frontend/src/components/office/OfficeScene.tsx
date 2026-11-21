"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Maximize2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { resolveArtifactUrl, Stage } from "@/lib/contracts";
import { PersonaState, RunState } from "@/lib/run-store";
import { Sprite, SpriteState } from "./Sprite";
import { ShopperReplayModal } from "./ShopperReplayModal";

interface OfficeSceneProps {
  runState: RunState;
  activeStage: Stage;
  isSampleData?: boolean;
  onOpenHotseat: (persona: PersonaState) => void;
}

const LAB_DESK_SPOTS: { x: number; y: number }[] = [
  { x: 74, y: 35 },
  { x: 90, y: 35 },
  { x: 74, y: 49 },
  { x: 90, y: 49 },
  { x: 74, y: 63 },
  { x: 90, y: 63 },
];

const SHOPPER_COLORS = [
  { bg: "#fb923c", accent: "#7c2d12" },
  { bg: "#38bdf8", accent: "#0c4a6e" },
  { bg: "#a78bfa", accent: "#4c1d95" },
  { bg: "#f472b6", accent: "#831843" },
  { bg: "#facc15", accent: "#713f12" },
  { bg: "#34d399", accent: "#064e3b" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "??";
}

function getCameraTransform(stage: Stage, enabled: boolean): string {
  if (!enabled) return "scale(1) translate3d(0%, 0%, 0)";
  switch (stage) {
    case "pitch":
      return "scale(1.07) translate3d(2%, 3.5%, 0)";
    case "boardroom":
      return "scale(1.08) translate3d(0%, 0.5%, 0)";
    case "build":
      return "scale(1.09) translate3d(4.5%, 0%, 0)";
    case "lab":
      return "scale(1.08) translate3d(-4.5%, -0.5%, 0)";
    case "swarm":
    case "reality":
      return "scale(1.07) translate3d(0%, -4%, 0)";
    case "verdict":
      return "scale(1.06) translate3d(0%, 2.5%, 0)";
    default:
      return "scale(1) translate3d(0%, 0%, 0)";
  }
}

function DeskErrorSign({ message }: { message: string }) {
  return (
    <div
      title={message}
      className="z-30 inline-flex items-center gap-1 rounded-sm border-2 border-rose-950 bg-rose-600 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-white shadow-md"
    >
      <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
      <span className="max-w-[110px] truncate">{message}</span>
    </div>
  );
}

export function OfficeScene({
  runState,
  activeStage,
  isSampleData = false,
  onOpenHotseat,
}: OfficeSceneProps) {
  const [autoCamera, setAutoCamera] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [replayPersonaId, setReplayPersonaId] = useState<string | null>(null);

  const playedAudioSeqsRef = useRef<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const latestTurn =
    runState.boardroomTurns.length > 0
      ? runState.boardroomTurns[runState.boardroomTurns.length - 1]
      : null;

  // Play latest boardroom turn audio_url if present
  useEffect(() => {
    if (!audioEnabled || !latestTurn?.audio_url) return;
    if (playedAudioSeqsRef.current.has(latestTurn.seq)) return;
    playedAudioSeqsRef.current.add(latestTurn.seq);

    const url = resolveArtifactUrl(runState.runId, latestTurn.audio_url);
    if (!url) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play().catch(() => {});
  }, [latestTurn, audioEnabled, runState.runId]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Errors grouped by affected stage / desk
  const errorByZone = useMemo(() => {
    const map: Partial<Record<"whiteboard" | "dev" | "boardroom" | "lab" | "street", string>> = {};
    for (const err of runState.errors) {
      if (err.stage === "build") map.dev = err.message;
      else if (err.stage === "lab") map.lab = err.message;
      else if (err.stage === "boardroom") map.boardroom = err.message;
      else if (err.stage === "swarm" || err.stage === "reality") map.street = err.message;
      else map.whiteboard = err.message;
    }
    return map;
  }, [runState.errors]);

  const isVerdictGathering =
    runState.verdict !== null &&
    (activeStage === "verdict" || activeStage === "reality");

  const isBoardroomSpeaking = activeStage === "boardroom" && latestTurn !== null;

  // Core staff positions & states
  const founderPos = isVerdictGathering ? { x: 47, y: 37 } : { x: 35, y: 36 };
  const founderState: SpriteState = isVerdictGathering
    ? "celebrating"
    : activeStage === "pitch"
    ? "talking"
    : "idle";

  const strategistTalking = isBoardroomSpeaking && latestTurn?.speaker === "strategist";
  const skepticTalking = isBoardroomSpeaking && latestTurn?.speaker === "skeptic";

  const strategistPos = isVerdictGathering
    ? { x: 39, y: 46 }
    : strategistTalking
    ? { x: 43, y: 46 }
    : { x: 37, y: 53 };

  const skepticPos = isVerdictGathering
    ? { x: 55, y: 46 }
    : skepticTalking
    ? { x: 52, y: 46 }
    : { x: 57, y: 53 };

  const devWorking =
    activeStage === "build" || (runState.buildMessages.length > 0 && !runState.mvp);
  const devPos = isVerdictGathering ? { x: 39, y: 58 } : { x: 14, y: 40 };
  const devState: SpriteState = isVerdictGathering
    ? "celebrating"
    : devWorking
    ? "working"
    : "idle";

  const designerPos = isVerdictGathering ? { x: 47, y: 60 } : { x: 10, y: 60 };
  const researcherPos = isVerdictGathering ? { x: 55, y: 58 } : { x: 20, y: 60 };
  const supportDeskState: SpriteState = isVerdictGathering
    ? "celebrating"
    : activeStage === "build" || activeStage === "boardroom" || activeStage === "lab"
    ? "working"
    : "idle";

  // Shoppers (up to 6 personas in usability lab)
  const shoppers = useMemo(() => {
    const list = runState.personaOrder
      .slice(0, 6)
      .map((id) => runState.personas[id])
      .filter(Boolean);

    let quitIdx = 0;
    let convIdx = 0;

    return list.map((persona, deskIdx) => {
      const deskSpot = LAB_DESK_SPOTS[deskIdx] || LAB_DESK_SPOTS[0];
      const hasConfusion = persona.markers.some((m) => m.kind === "confusion");
      const latestAction = persona.actions[persona.actions.length - 1];
      const quitMarker = persona.markers.find((m) => m.kind === "quit");
      const quitTime =
        persona.duration_s ?? quitMarker?.t ?? latestAction?.t ?? 0;

      let x = deskSpot.x;
      let y = deskSpot.y;
      let state: SpriteState = "working";
      let bubble: string | null = latestAction?.thought || null;
      let badge: string | null = null;

      if (persona.status === "quit") {
        // Walk out the storefront door into the street exit lane
        x = 41 + (quitIdx % 3) * 8.5;
        y = 77 + Math.floor(quitIdx / 3) * 7;
        quitIdx += 1;
        state = "quit";
        bubble = null;
        badge = `Quit at ${quitTime.toFixed(1)}s`;
      } else if (persona.status === "converted") {
        // Walk to checkout counter
        x = 71 + (convIdx % 3) * 9.5;
        y = 76;
        convIdx += 1;
        state = "celebrating";
        bubble = null;
        badge = "Checkout ✓";
      } else if (hasConfusion) {
        state = "confused";
      }

      const palette = SHOPPER_COLORS[deskIdx % SHOPPER_COLORS.length];
      return {
        persona,
        x,
        y,
        state,
        bubble,
        badge,
        hasConfusion,
        palette,
      };
    });
  }, [runState.personaOrder, runState.personas]);

  // Swarm street queue calculation (200 tiny dots)
  const swarmTotal = runState.swarmProgress?.total || 200;
  const swarmDone = runState.swarmResult
    ? swarmTotal
    : runState.swarmProgress?.done || 0;
  const swarmFillCount = Math.round(
    Math.min(1, swarmTotal > 0 ? swarmDone / swarmTotal : 0) * 160
  );

  // Split buy/bounce piles using rubric means + intent_mean
  const swarmPiles = useMemo(() => {
    if (!runState.swarmResult) return null;
    const rubricVals = Object.values(runState.swarmResult.rubrics || {});
    const rubricAvg =
      rubricVals.length > 0
        ? rubricVals.reduce((a, b) => a + b, 0) / rubricVals.length
        : runState.swarmResult.intent_mean;
    const buyRatio = Math.max(
      0,
      Math.min(1, runState.swarmResult.intent_mean || rubricAvg)
    );
    const totalDots = 120;
    const buyDots = Math.round(totalDots * buyRatio);
    const bounceDots = totalDots - buyDots;
    return {
      buyDots,
      bounceDots,
      buyPct: Math.round(buyRatio * 100),
      rubricAvgPct: Math.round(rubricAvg * 100),
    };
  }, [runState.swarmResult]);

  // Street sign vote tally math
  const voteSign = useMemo(() => {
    if (!runState.voteTally) return null;
    const total = runState.voteTally.buy + runState.voteTally.bounce;
    const roomPct = total > 0 ? Math.round((runState.voteTally.buy / total) * 100) : 0;
    const aiPct = Math.round(
      (runState.voteTally.ai_probability ?? runState.verdict?.launch_probability ?? 0) * 100
    );
    return { roomPct, aiPct, total };
  }, [runState.voteTally, runState.verdict]);

  const latestBuildMsg =
    runState.buildMessages.length > 0
      ? runState.buildMessages[runState.buildMessages.length - 1].message
      : null;

  const resolvedScreenshot = resolveArtifactUrl(runState.runId, runState.mvp?.screenshot_url);
  const resolvedHero = resolveArtifactUrl(runState.runId, runState.mvp?.hero_image_url);

  const selectedReplayPersona =
    replayPersonaId && runState.personas[replayPersonaId]
      ? runState.personas[replayPersonaId]
      : null;

  const zoneRing = (stages: Stage[]) =>
    stages.includes(activeStage)
      ? "ring-2 ring-emerald-400/80 shadow-[inset_0_0_24px_rgba(16,185,129,0.22)]"
      : "ring-1 ring-white/10";

  return (
    <div className="space-y-3">
      {/* Compact Office HUD Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-300">
            Pixel Office View
          </span>
          {isSampleData && (
            <span className="rounded-md border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-200">
              Sample data
            </span>
          )}
          <span className="hidden text-xs text-zinc-400 sm:inline">
            Click any shopper in the lab or doorway to inspect replay &amp; open Hot-Seat.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoCamera((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
              autoCamera
                ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                : "border-white/15 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
            }`}
            title="Toggle automatic camera pan toward active zone"
          >
            {autoCamera ? <Camera className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span>{autoCamera ? "Auto-Cam" : "Full View"}</span>
          </button>

          <button
            onClick={() => {
              const next = !audioEnabled;
              setAudioEnabled(next);
              if (!next && audioRef.current) audioRef.current.pause();
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
              audioEnabled
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/15 bg-white/[0.04] text-zinc-400"
            }`}
          >
            {audioEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>{audioEnabled ? "TTS On" : "Muted"}</span>
          </button>
        </div>
      </div>

      {/* Fixed 16:9 Pixel Office Viewport */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-white/15 bg-[#0e121d] shadow-[0_20px_60px_rgba(0,0,0,0.65)] pixelated">
        {/* Camera Panning Layer */}
        <div
          className="relative h-full w-full transition-transform duration-500 ease-out will-change-transform"
          style={{ transform: getCameraTransform(activeStage, autoCamera) }}
        >
          {/* CSS Grid Floorplan: Whiteboard (top) | Dev+Creative, Boardroom, Lab (middle) | Storefront+Street (bottom) */}
          <div className="grid h-full w-full grid-rows-[22%_49%_29%] bg-office-floor">
            {/* ==================== TOP ZONE: WHITEBOARD ==================== */}
            <div
              className={`relative flex items-stretch gap-2 border-b-4 border-[#2b3347] bg-[#161c2c] px-3 py-2 transition ${zoneRing(
                ["pitch", "verdict"]
              )}`}
            >
              <div className="relative grid flex-1 grid-cols-12 gap-2 rounded-md border-4 border-[#475569] bg-[#ecf1f7] p-2 text-zinc-900 shadow-inner">
                {/* Whiteboard corner label */}
                <span className="absolute -top-2.5 left-2 rounded-sm bg-[#334155] px-1.5 py-[1px] font-mono text-[8px] font-bold uppercase tracking-widest text-zinc-100">
                  WHITEBOARD
                </span>

                {/* Left: Pinned Pitch Card */}
                <div className="col-span-4 flex flex-col justify-between rounded-sm border-2 border-amber-500/60 bg-amber-100/90 p-1.5 shadow-sm">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[8px] font-black uppercase text-amber-900">
                      PITCH CARD
                    </span>
                    {runState.pitch?.price_usd !== null &&
                      runState.pitch?.price_usd !== undefined && (
                        <span className="rounded-sm bg-amber-900 px-1 font-mono text-[8px] font-bold text-amber-100">
                          ${runState.pitch.price_usd}
                        </span>
                      )}
                  </div>
                  {runState.pitch ? (
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[10px] font-black text-zinc-950">
                        {runState.pitch.title}
                      </p>
                      <p className="line-clamp-2 text-[9px] leading-tight text-zinc-700">
                        {runState.pitch.one_liner}
                      </p>
                    </div>
                  ) : (
                    <p className="font-mono text-[9px] italic text-zinc-500">
                      Waiting for founder pitch...
                    </p>
                  )}
                </div>

                {/* Middle: Pinned Spec Sheet */}
                <div className="col-span-4 flex flex-col justify-between rounded-sm border-2 border-cyan-600/50 bg-cyan-50 p-1.5 shadow-sm">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[8px] font-black uppercase text-cyan-900">
                      V1 SPEC SHEET
                    </span>
                    {runState.spec?.price_usd !== null &&
                      runState.spec?.price_usd !== undefined && (
                        <span className="rounded-sm bg-cyan-900 px-1 font-mono text-[8px] font-bold text-cyan-50">
                          ${runState.spec.price_usd}
                        </span>
                      )}
                  </div>
                  {runState.spec ? (
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-mono text-[9px] font-bold leading-tight text-zinc-900">
                        {runState.spec.headline}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[8px] text-cyan-800">
                        {runState.spec.pages.slice(0, 3).join(" • ")}
                      </p>
                    </div>
                  ) : (
                    <p className="font-mono text-[9px] italic text-zinc-500">
                      Boardroom locks V1 spec here
                    </p>
                  )}
                </div>

                {/* Right: Verdict Probability + Red Failure Tags */}
                <div className="col-span-4 flex flex-col justify-between rounded-sm border-2 border-slate-400 bg-white p-1.5 shadow-sm">
                  {runState.verdict ? (
                    <div className="flex h-full items-center gap-2">
                      <div className="shrink-0 rounded-sm border-2 border-zinc-900 bg-zinc-950 px-2 py-1 text-center">
                        <div className="font-mono text-[7px] uppercase text-zinc-400">
                          SURVIVAL
                        </div>
                        <div
                          className={`font-mono text-base font-black leading-none ${
                            runState.verdict.launch_probability >= 0.65
                              ? "text-emerald-400"
                              : runState.verdict.launch_probability >= 0.4
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {Math.round(runState.verdict.launch_probability * 100)}%
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden">
                        {runState.verdict.failure_modes.slice(0, 2).map((fm, idx) => (
                          <div
                            key={idx}
                            title={fm}
                            className="truncate rounded-sm bg-rose-600 px-1 py-[1px] font-mono text-[8px] font-bold text-white"
                          >
                            ! {fm}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-center text-center">
                      <span className="font-mono text-[8px] font-bold uppercase text-slate-400">
                        LAUNCH VERDICT
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">--%</span>
                    </div>
                  )}
                </div>
              </div>

              {errorByZone.whiteboard && (
                <div className="absolute right-4 top-3">
                  <DeskErrorSign message={errorByZone.whiteboard} />
                </div>
              )}
            </div>

            {/* ==================== MIDDLE ZONE: 3 ROOMS ==================== */}
            <div className="grid grid-cols-[28%_38%_34%]">
              {/* LEFT: Dev Desk + Creative Desk */}
              <div
                className={`relative flex flex-col justify-between border-r-2 border-white/10 bg-[#151a28]/80 p-2.5 transition ${zoneRing(
                  ["build"]
                )}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-emerald-400/90">
                    DEV &amp; CREATIVE
                  </span>
                  {errorByZone.dev && <DeskErrorSign message={errorByZone.dev} />}
                </div>

                {/* Dev Desk with Tiny Monitor */}
                <div className="relative rounded-md border-2 border-[#3b4761] bg-[#252d40] p-2 shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8px] font-bold uppercase text-zinc-400">
                      DEV DESK
                    </span>
                    <span className="font-mono text-[7px] text-emerald-300">
                      {runState.mvp ? "MVP READY" : devWorking ? "BUILDING" : "STANDBY"}
                    </span>
                  </div>
                  {/* Tiny Monitor */}
                  <div className="mt-1.5 flex h-12 w-full items-center justify-center overflow-hidden rounded-sm border-2 border-zinc-950 bg-[#080d14] p-1">
                    {resolvedScreenshot ? (
                      <img
                        src={resolvedScreenshot}
                        alt="MVP Monitor Preview"
                        className="h-full w-full object-cover pixelated"
                      />
                    ) : runState.mvp ? (
                      <div className="text-center font-mono text-[8px] font-bold text-emerald-300">
                        <div>● LIVE MVP</div>
                        <div className="text-[7px] text-zinc-400">Landing + Checkout</div>
                      </div>
                    ) : latestBuildMsg ? (
                      <p className="line-clamp-2 font-mono text-[8px] leading-tight text-emerald-300">
                        &gt; {latestBuildMsg}
                      </p>
                    ) : (
                      <span className="font-mono text-[8px] text-zinc-600">_ idle terminal</span>
                    )}
                  </div>
                </div>

                {/* Creative & Research Desk */}
                <div className="relative rounded-md border-2 border-[#3b4761] bg-[#252d40] p-2 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[8px] font-bold uppercase text-zinc-400">
                      CREATIVE + RESEARCH
                    </span>
                    <span className="font-mono text-[7px] text-purple-300">
                      {runState.competitors.length > 0
                        ? `${runState.competitors.length} rivals`
                        : "assets"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-9 items-center justify-center overflow-hidden rounded-sm border-2 border-zinc-950 bg-[#0b101a] px-1.5">
                    {resolvedHero ? (
                      <img
                        src={resolvedHero}
                        alt="Hero Asset"
                        className="h-full w-full object-cover pixelated"
                      />
                    ) : (
                      <span className="truncate font-mono text-[8px] text-purple-200/80">
                        {runState.competitors.length > 0
                          ? `Benchmarked ${runState.competitors[0].title}`
                          : "Hero art & competitor scan"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* CENTER: Founder Podium + Boardroom Table */}
              <div
                className={`relative flex flex-col items-center justify-between border-r-2 border-white/10 bg-[#191f30]/75 p-2.5 transition ${zoneRing(
                  ["boardroom", "verdict"]
                )}`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-cyan-400/90">
                    BOARDROOM
                  </span>
                  {errorByZone.boardroom && <DeskErrorSign message={errorByZone.boardroom} />}
                </div>

                {/* Podium (upper-left of center room) */}
                <div className="absolute left-3 top-7 rounded-sm border-2 border-amber-700/80 bg-amber-900/50 px-2 py-1 text-center">
                  <span className="font-mono text-[7px] font-bold uppercase text-amber-200">
                    PODIUM
                  </span>
                </div>

                {/* Conference Table */}
                <div className="my-auto flex h-24 w-[76%] flex-col items-center justify-center rounded-xl border-4 border-[#5c4028] bg-[#7a5436] shadow-[0_8px_0_rgba(0,0,0,0.35)]">
                  <div className="rounded-sm bg-black/25 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-amber-100/90">
                    {isVerdictGathering
                      ? "ALL-HANDS VERDICT"
                      : isBoardroomSpeaking
                      ? `${latestTurn?.speaker} speaking`
                      : "STRATEGY TABLE"}
                  </div>
                </div>

                <div className="h-2" />
              </div>

              {/* RIGHT: Usability Lab (6 Mini Desks) */}
              <div
                className={`relative flex flex-col justify-between bg-[#151a28]/80 p-2.5 transition ${zoneRing(
                  ["lab"]
                )}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-amber-400/90">
                    USABILITY LAB (6 DESKS)
                  </span>
                  {errorByZone.lab && <DeskErrorSign message={errorByZone.lab} />}
                </div>

                <div className="mt-1.5 grid flex-1 grid-cols-2 grid-rows-3 gap-2">
                  {Array.from({ length: 6 }).map((_, idx) => {
                    const occupantId = runState.personaOrder[idx];
                    const occupant = occupantId ? runState.personas[occupantId] : null;
                    return (
                      <div
                        key={idx}
                        className="relative flex flex-col justify-between rounded-sm border-2 border-[#334155] bg-[#1e2638] p-1.5"
                      >
                        <div className="flex items-center justify-between font-mono text-[7px] text-zinc-500">
                          <span>DESK 0{idx + 1}</span>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              occupant?.status === "running"
                                ? "bg-cyan-400 animate-pulse"
                                : occupant?.status === "converted"
                                ? "bg-emerald-400"
                                : occupant?.status === "quit"
                                ? "bg-rose-500"
                                : "bg-zinc-700"
                            }`}
                          />
                        </div>
                        {/* Mini desk monitor */}
                        <div className="mt-auto h-2.5 w-full rounded-[1px] border border-black/80 bg-[#0a1019]" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ==================== BOTTOM ZONE: STOREFRONT + STREET ==================== */}
            <div
              className={`relative grid grid-rows-[42%_58%] border-t-4 border-[#334155] transition ${zoneRing(
                ["swarm", "reality"]
              )}`}
            >
              {/* Storefront Glass Window | Door | Checkout Counter */}
              <div className="grid grid-cols-[36%_26%_38%] bg-[#1a2234] px-2 py-1">
                {/* Storefront Window: Competitor Product Cards */}
                <div className="flex flex-col justify-between overflow-hidden rounded-sm border-2 border-cyan-500/35 bg-[#102033]/85 px-1.5 py-1">
                  <span className="font-mono text-[7px] font-bold uppercase tracking-wider text-cyan-300">
                    STOREFRONT WINDOW • COMPETITORS
                  </span>
                  <div className="flex items-center gap-1 overflow-hidden">
                    {runState.competitors.length === 0 ? (
                      <span className="font-mono text-[8px] text-zinc-500">
                        No competitor cards yet
                      </span>
                    ) : (
                      runState.competitors.slice(0, 4).map((comp, idx) => (
                        <div
                          key={idx}
                          title={`${comp.title}${
                            comp.price_usd !== null ? ` ($${comp.price_usd})` : ""
                          }`}
                          className="flex min-w-0 flex-1 flex-col rounded-[2px] border border-amber-400/50 bg-amber-50/95 px-1 py-0.5 text-zinc-950 shadow-sm"
                        >
                          <span className="truncate font-mono text-[7px] font-bold leading-tight">
                            {comp.title}
                          </span>
                          <span className="font-mono text-[7px] font-black text-amber-800">
                            {comp.price_usd !== null ? `$${comp.price_usd}` : "—"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Storefront Door */}
                <div className="mx-2 flex flex-col items-center justify-between rounded-sm border-x-4 border-t-2 border-amber-400/50 bg-[#0d111a] py-0.5">
                  <span className="rounded-sm bg-rose-500/20 px-1.5 font-mono text-[7px] font-bold uppercase text-rose-300">
                    EXIT / STOREFRONT DOOR
                  </span>
                  <div className="flex h-3 w-12 items-center justify-center gap-1 border-t border-white/15">
                    <span className="h-1 w-4 bg-zinc-600" />
                    <span className="h-1 w-4 bg-zinc-600" />
                  </div>
                </div>

                {/* Checkout Counter */}
                <div className="flex flex-col justify-between rounded-sm border-2 border-emerald-500/40 bg-emerald-950/50 px-2 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[7px] font-bold uppercase tracking-wider text-emerald-300">
                      CHECKOUT COUNTER
                    </span>
                    <span className="font-mono text-[7px] text-emerald-200">
                      {
                        runState.personaOrder.filter(
                          (id) => runState.personas[id]?.status === "converted"
                        ).length
                      }{" "}
                      converted
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-sm bg-emerald-500/20 border border-emerald-400/30" />
                </div>
              </div>

              {/* Street Outside: Swarm Queue + Buy/Bounce Piles + Vote Street Sign */}
              <div className="relative flex items-center justify-between gap-3 bg-street-asphalt px-3 py-1.5 border-t-2 border-zinc-600/60">
                {/* Street Queue / Buy vs Bounce Piles */}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  {swarmPiles ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Buy Pile */}
                      <div className="rounded-sm border border-emerald-500/40 bg-emerald-950/60 px-2 py-1">
                        <div className="mb-1 flex items-center justify-between font-mono text-[8px] font-bold text-emerald-300">
                          <span>BUY PILE ({swarmPiles.buyPct}%)</span>
                          <span>avg rubric {swarmPiles.rubricAvgPct}%</span>
                        </div>
                        <div className="flex flex-wrap gap-[2px]">
                          {Array.from({ length: swarmPiles.buyDots }).map((_, i) => (
                            <span
                              key={i}
                              className="h-1.5 w-1.5 rounded-[1px] bg-emerald-400"
                            />
                          ))}
                        </div>
                      </div>

                      {/* Bounce Pile */}
                      <div className="rounded-sm border border-rose-500/40 bg-rose-950/60 px-2 py-1">
                        <div className="mb-1 flex items-center justify-between font-mono text-[8px] font-bold text-rose-300">
                          <span>BOUNCE PILE ({100 - swarmPiles.buyPct}%)</span>
                          <span>{runState.swarmResult?.personas ?? 200} buyers</span>
                        </div>
                        <div className="flex flex-wrap gap-[2px]">
                          {Array.from({ length: swarmPiles.bounceDots }).map((_, i) => (
                            <span
                              key={i}
                              className="h-1.5 w-1.5 rounded-[1px] bg-rose-400/80"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-sm border border-white/10 bg-black/45 px-2.5 py-1.5">
                      <div className="mb-1 flex items-center justify-between font-mono text-[8px] text-zinc-300">
                        <span className="uppercase tracking-wider text-cyan-300">
                          STREET QUEUE • MARKET SWARM
                        </span>
                        <span>
                          {runState.swarmProgress
                            ? `${runState.swarmProgress.done} / ${runState.swarmProgress.total}`
                            : "Waiting for 200 buyers"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-[2px]">
                        {Array.from({ length: 160 }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-1.5 w-1.5 rounded-[1px] transition-colors duration-200 ${
                              i < swarmFillCount ? "bg-cyan-400" : "bg-white/10"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Street Sign (Vote Tally) & Street Error */}
                <div className="flex shrink-0 items-center gap-2">
                  {errorByZone.street && <DeskErrorSign message={errorByZone.street} />}
                  {voteSign ? (
                    <div className="flex flex-col items-center rounded-md border-2 border-amber-300 bg-[#1e293b] px-2.5 py-1 text-center shadow-lg">
                      <span className="font-mono text-[7px] font-bold uppercase tracking-widest text-amber-300">
                        STREET SIGN ({voteSign.total} VOTES)
                      </span>
                      <span className="font-mono text-[10px] font-black text-white whitespace-nowrap">
                        Room says {voteSign.roomPct}% vs AI {voteSign.aiPct}%
                      </span>
                    </div>
                  ) : (
                    <div className="hidden rounded-md border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[8px] text-zinc-500 sm:block">
                      ROOM SIGN: WAITING FOR VOTES
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ==================== SPRITES OVERLAY LAYER ==================== */}
          {/* Founder */}
          <Sprite
            id="founder"
            name="Founder"
            initials="FN"
            spriteFile="founder"
            color="#f59e0b"
            accentColor="#78350f"
            x={founderPos.x}
            y={founderPos.y}
            state={founderState}
            bubble={
              activeStage === "pitch" && runState.pitch
                ? `${runState.pitch.title}: ${runState.pitch.one_liner}`
                : null
            }
            zIndex={24}
          />

          {/* Boardroom Strategist (Neon) */}
          <Sprite
            id="strategist"
            name="Strategist"
            initials="ST"
            spriteFile="strategist"
            color="#22d3ee"
            accentColor="#164e63"
            x={strategistPos.x}
            y={strategistPos.y}
            state={
              isVerdictGathering
                ? "celebrating"
                : strategistTalking
                ? "talking"
                : "idle"
            }
            bubble={strategistTalking ? latestTurn?.text : null}
            zIndex={strategistTalking ? 35 : 22}
          />

          {/* Boardroom Skeptic (Argon) */}
          <Sprite
            id="skeptic"
            name="Skeptic"
            initials="SK"
            spriteFile="skeptic"
            color="#fb7185"
            accentColor="#881337"
            x={skepticPos.x}
            y={skepticPos.y}
            state={
              isVerdictGathering
                ? "celebrating"
                : skepticTalking
                ? "talking"
                : "idle"
            }
            bubble={skepticTalking ? latestTurn?.text : null}
            zIndex={skepticTalking ? 35 : 22}
          />

          {/* Developer (works at dev desk; gathers on verdict; never talks in boardroom) */}
          <Sprite
            id="developer"
            name="Developer"
            initials="DV"
            spriteFile="developer"
            color="#34d399"
            accentColor="#065f46"
            x={devPos.x}
            y={devPos.y}
            state={devState}
            zIndex={21}
          />

          {/* Designer (creative desk; never talks in boardroom) */}
          <Sprite
            id="designer"
            name="Designer"
            initials="DS"
            spriteFile="designer"
            color="#c084fc"
            accentColor="#581c87"
            x={designerPos.x}
            y={designerPos.y}
            state={supportDeskState}
            size="sm"
            zIndex={20}
          />

          {/* Researcher (creative/research desk; never talks in boardroom) */}
          <Sprite
            id="researcher"
            name="Researcher"
            initials="RS"
            spriteFile="researcher"
            color="#60a5fa"
            accentColor="#1e3a8a"
            x={researcherPos.x}
            y={researcherPos.y}
            state={supportDeskState}
            size="sm"
            zIndex={20}
          />

          {/* Up to 6 Usability Lab Shoppers */}
          {shoppers.map(({ persona, x, y, state, bubble, badge, hasConfusion, palette }, idx) => (
            <Sprite
              key={persona.persona_id}
              id={persona.persona_id}
              name={persona.name.split(" ")[0]}
              initials={getInitials(persona.name)}
              spriteFile={`shopper_${idx + 1}`}
              color={palette.bg}
              accentColor={palette.accent}
              x={x}
              y={y}
              state={state}
              bubble={activeStage === "lab" ? bubble : null}
              badge={badge}
              showConfusedMark={hasConfusion}
              size="sm"
              zIndex={state === "quit" ? 32 : 25}
              onClick={() => setReplayPersonaId(persona.persona_id)}
              title={`${persona.name} (${persona.role}) — Click to inspect replay & interview`}
            />
          ))}
        </div>
      </div>

      {/* Clicking any shopper (especially quitters) opens Replay + Interview Hot-Seat */}
      {selectedReplayPersona && (
        <ShopperReplayModal
          runId={runState.runId}
          persona={selectedReplayPersona}
          onClose={() => setReplayPersonaId(null)}
          onInterview={(persona) => {
            setReplayPersonaId(null);
            onOpenHotseat(persona);
          }}
        />
      )}
    </div>
  );
}
