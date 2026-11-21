import React from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { LiveRunWorkspace } from "@/components/live/LiveRunWorkspace";
import type { ReplaySpeed } from "@/components/live/useLiveRun";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-live-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-live-mono",
  display: "swap",
});

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseReplaySpeed(raw: string | undefined): ReplaySpeed {
  const num = Number(raw);
  if (num === 1 || num === 2 || num === 4 || num === 8) {
    return num;
  }
  return 4;
}

function decodeRunId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function LiveRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{
    replay?: string | string[];
    speed?: string | string[];
  }>;
}) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;

  const runId = decodeRunId(resolvedParams.runId || "");
  const replayParam = pickFirst(resolvedSearch.replay);
  const speedParam = pickFirst(resolvedSearch.speed);

  const initialReplay =
    replayParam === "1" || replayParam === "true" || replayParam === "yes";
  const initialSpeed = parseReplaySpeed(speedParam);

  return (
    <LiveRunWorkspace
      runId={runId}
      initialReplay={initialReplay}
      initialSpeed={initialSpeed}
      fontClassName={`${inter.variable} ${jetbrainsMono.variable}`}
    />
  );
}
