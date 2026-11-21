import React from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { FounderWorkspace } from "@/components/session/founder/FounderWorkspace";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-founder-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-founder-mono",
  display: "swap",
});

function decodeRunId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function FounderSessionPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId: rawRunId } = await params;
  const runId = decodeRunId(rawRunId || "");

  return (
    <FounderWorkspace
      runId={runId}
      fontClassName={`${inter.variable} ${jetbrainsMono.variable}`}
    />
  );
}
