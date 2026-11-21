"use client";

import { use } from "react";
import { TallyScreen } from "@/components/tally/TallyScreen";

function decodeRunId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function TallyPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId: rawRunId } = use(params);
  const runId = decodeRunId(rawRunId || "");

  return <TallyScreen runId={runId} />;
}
