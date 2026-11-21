"use client";

import { use } from "react";
import { StageWorkspace } from "@/components/StageWorkspace";

interface DemoPageProps {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function decodeRunId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseSpeed(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "1") return 1;
  if (value === "2") return 2;
  if (value === "4") return 4;
  return 2;
}

export default function DemoRunPage({ params, searchParams }: DemoPageProps) {
  const { runId: rawRunId } = use(params);
  const resolvedSearchParams = use(searchParams);

  const runId = decodeRunId(rawRunId || "");
  const speed = parseSpeed(resolvedSearchParams?.speed);

  return (
    <StageWorkspace
      autoplayRunId={runId}
      initialSpeed={speed}
      presentationMode
    />
  );
}
