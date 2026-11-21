"use client";

import React, { useEffect, useMemo, useState } from "react";
import { HotseatModal } from "@/components/HotseatModal";
import type { PersonaState } from "@/lib/run-store";
import { AgentTimeline } from "./AgentTimeline";
import { BoardroomView } from "./BoardroomView";
import { BuildView } from "./BuildView";
import { LabView } from "./LabView";
import { MarketView } from "./MarketView";
import { PitchView } from "./PitchView";
import { RoomView } from "./RoomView";
import { TopBar } from "./TopBar";
import type { LiveStageId } from "./types";
import { useLiveRun, type ReplaySpeed } from "./useLiveRun";
import { V2View } from "./V2View";
import { VerdictView } from "./VerdictView";

interface LiveRunWorkspaceProps {
  runId: string;
  initialReplay: boolean;
  initialSpeed: ReplaySpeed;
  fontClassName: string;
}

const LIVE_STYLES = `
  .live-root {
    font-family: var(--font-live-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-sans: var(--font-live-sans), Inter, system-ui, -apple-system, sans-serif;
    --font-mono: var(--font-live-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  .live-root .font-mono {
    font-family: var(--font-live-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  @keyframes liveShimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .live-shimmer-bar {
    background-image: linear-gradient(
      90deg,
      rgba(66, 133, 244, 0.15) 0%,
      #4285F4 25%,
      #9B72CB 50%,
      #D96570 75%,
      rgba(217, 101, 112, 0.15) 100%
    );
    background-size: 200% 100%;
    animation: liveShimmer 1.6s linear infinite;
  }

  @keyframes livePulseDot {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(0.85);
    }
  }

  .live-pulse-dot {
    animation: livePulseDot 1.8s ease-in-out infinite;
  }

  @keyframes liveFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .live-fade-in {
    animation: liveFadeIn 240ms ease-out both;
  }

  @keyframes liveSheetIn {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .live-sheet-in {
    animation: liveSheetIn 240ms ease-out both;
  }

  .live-challenge-word {
    padding-bottom: 3px;
    background-image: linear-gradient(90deg, #4285F4 0%, #9B72CB 50%, #D96570 100%);
    background-size: 100% 2px;
    background-position: 0 100%;
    background-repeat: no-repeat;
  }

  @media (prefers-reduced-motion: reduce) {
    .live-shimmer-bar {
      animation: none;
      background-size: 100% 100%;
    }
    .live-pulse-dot,
    .live-fade-in,
    .live-sheet-in {
      animation: none;
    }
  }
`;

export function LiveRunWorkspace({
  runId,
  initialReplay,
  initialSpeed,
  fontClassName,
}: LiveRunWorkspaceProps) {
  const {
    runState,
    v2State,
    analystFraming,
    mode,
    connectionStatus,
    replaySpeed,
    replayComplete,
    replayProgress,
    setReplaySpeed,
    restartReplay,
    activeLiveStage,
    timeline,
    elapsedMs,
    swarmDurationMs,
    loadError,
  } = useLiveRun({
    runId,
    initialReplay,
    initialSpeed,
  });

  const [autoFollow, setAutoFollow] = useState(true);
  const [selectedStage, setSelectedStage] = useState<LiveStageId>("pitch");
  const [hotseatPersonaId, setHotseatPersonaId] = useState<string | null>(null);

  useEffect(() => {
    if (autoFollow) {
      setSelectedStage(activeLiveStage);
    }
  }, [activeLiveStage, autoFollow]);

  const handleSelectStage = (stage: LiveStageId) => {
    setSelectedStage(stage);
    setAutoFollow(false);
  };

  const handleToggleAuto = () => {
    setAutoFollow((prev) => {
      const next = !prev;
      if (next) {
        setSelectedStage(activeLiveStage);
      }
      return next;
    });
  };

  const handleRestart = () => {
    setAutoFollow(true);
    setSelectedStage("pitch");
    restartReplay();
  };

  const personas = useMemo(
    () =>
      runState.personaOrder
        .map((id) => runState.personas[id])
        .filter((p): p is PersonaState => Boolean(p)),
    [runState.personaOrder, runState.personas]
  );

  const hotseatPersona = hotseatPersonaId
    ? runState.personas[hotseatPersonaId] ?? null
    : null;

  const selectedStageInfo = timeline.find((item) => item.id === selectedStage);
  const isSelectedActive = selectedStageInfo?.status === "active";

  return (
    <div
      className={`live-root ${fontClassName} flex h-screen w-screen flex-col overflow-hidden bg-[#0E0F11] text-[#E8EAED] selection:bg-[#4285F4]/25 selection:text-[#E8EAED]`}
    >
      <style>{LIVE_STYLES}</style>

      <TopBar
        runId={runId}
        runTitle={runState.pitch?.title ?? null}
        mode={mode}
        connectionStatus={connectionStatus}
        replaySpeed={replaySpeed}
        replayComplete={replayComplete}
        replayProgress={replayProgress}
        elapsedMs={elapsedMs}
        onSpeedChange={setReplaySpeed}
        onRestartReplay={handleRestart}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AgentTimeline
          timeline={timeline}
          selectedStage={selectedStage}
          autoFollow={autoFollow}
          onSelectStage={handleSelectStage}
          onToggleAuto={handleToggleAuto}
        />

        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#0E0F11]">
          {loadError && runState.eventCount === 0 && (
            <div className="absolute inset-x-8 top-6 z-20 rounded-[12px] border border-[#F28B82]/30 bg-[#16171A] px-4 py-3 text-[13px] text-[#F28B82]">
              {loadError}
            </div>
          )}

          <div key={selectedStage} className="live-fade-in h-full w-full">
            {selectedStage === "pitch" && (
              <PitchView
                runId={runId}
                pitch={runState.pitch}
                isActive={isSelectedActive}
              />
            )}

            {selectedStage === "boardroom" && (
              <BoardroomView
                runId={runId}
                turns={runState.boardroomTurns}
                spec={runState.spec}
                isActive={isSelectedActive}
              />
            )}

            {selectedStage === "build" && (
              <BuildView
                runId={runId}
                mvp={runState.mvp}
                buildMessages={runState.buildMessages}
                isActive={isSelectedActive}
              />
            )}

            {selectedStage === "lab" && (
              <LabView
                runId={runId}
                personas={personas}
                mvpScreenshotUrl={runState.mvp?.screenshot_url ?? null}
                isActive={isSelectedActive}
                onInterview={(persona) =>
                  setHotseatPersonaId(persona.persona_id)
                }
              />
            )}

            {selectedStage === "swarm" && (
              <MarketView
                swarmProgress={runState.swarmProgress}
                swarmResult={runState.swarmResult}
                swarmDurationMs={swarmDurationMs}
                competitors={runState.competitors}
                isActive={isSelectedActive}
              />
            )}

            {selectedStage === "verdict" && (
              <VerdictView
                verdict={runState.verdict}
                analystFraming={analystFraming}
                isActive={isSelectedActive}
              />
            )}

            {selectedStage === "iterate" && (
              <V2View
                runId={runId}
                v2={v2State}
                fallbackV1ScreenshotUrl={runState.mvp?.screenshot_url ?? null}
                isActive={isSelectedActive}
              />
            )}

            {selectedStage === "room" && (
              <RoomView
                runId={runId}
                twinChallenges={runState.twinChallenges}
                founderBriefs={runState.founderBriefs}
                roomCaption={runState.roomCaption}
                roomUtterances={runState.roomUtterances}
                isActive={isSelectedActive}
              />
            )}
          </div>
        </main>
      </div>

      {hotseatPersona && (
        <HotseatModal
          runId={runId}
          persona={hotseatPersona}
          onClose={() => setHotseatPersonaId(null)}
        />
      )}
    </div>
  );
}
