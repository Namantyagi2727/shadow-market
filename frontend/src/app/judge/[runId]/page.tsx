import React from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { JudgeAssistantWorkspace } from "@/components/session/judge/JudgeAssistantWorkspace";

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

function decodeRunId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function JudgeAssistantPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const resolvedParams = await params;
  const runId = decodeRunId(resolvedParams.runId || "");

  return (
    <JudgeAssistantWorkspace
      runId={runId}
      fontClassName={`${inter.variable} ${jetbrainsMono.variable}`}
    />
  );
}
