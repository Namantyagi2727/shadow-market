"use client";

import React, { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { resolveArtifactUrl, type MvpReadyData } from "@/lib/contracts";
import type { BuildLogEntry } from "@/lib/run-store";

interface BuildViewProps {
  runId: string;
  mvp: MvpReadyData | null;
  buildMessages: BuildLogEntry[];
  isActive: boolean;
}

function formatLogTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 19);
}

export function BuildView({
  runId,
  mvp,
  buildMessages,
  isActive,
}: BuildViewProps) {
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const mvpIframeUrl = mvp ? resolveArtifactUrl(runId, mvp.url) : null;

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [buildMessages.length]);

  if (!mvpIframeUrl && buildMessages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-[#5F6368]">
            Waiting for Antigravity sandbox build…
          </p>
          {isActive && (
            <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden px-8 py-6 lg:px-10">
      <div className="mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 flex-col gap-3">
        {/* Browser mockup frame */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[#2A2B30] bg-[#16171A]">
          {/* Browser chrome */}
          <div className="flex h-11 shrink-0 items-center gap-4 border-b border-[#2A2B30] bg-[#16171A] px-4">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#2A2B30]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#2A2B30]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#2A2B30]" />
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] border border-[#2A2B30] bg-[#0E0F11] px-3 py-1">
              <span className="truncate font-mono text-[12px] text-[#9AA0A6]">
                {mvpIframeUrl ?? "sandbox://antigravity/mvp/index.html"}
              </span>
              {mvpIframeUrl && (
                <a
                  href={mvpIframeUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open MVP in new tab"
                  className="shrink-0 text-[#5F6368] transition-colors hover:text-[#E8EAED]"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                </a>
              )}
            </div>
          </div>

          {/* Viewport or Build Log Strip */}
          {mvpIframeUrl ? (
            <div className="relative min-h-0 flex-1 bg-white">
              <iframe
                src={mvpIframeUrl}
                title="Live MVP Preview"
                sandbox="allow-scripts allow-forms allow-same-origin"
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col justify-between bg-[#0E0F11]">
              <div className="live-shimmer-bar h-[2px] w-full shrink-0" />

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-3 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Sandbox build log
                </div>
                <div className="space-y-2 font-mono text-[12px] leading-[1.6]">
                  {buildMessages.map((entry, idx) => {
                    const isLatest = idx === buildMessages.length - 1;
                    return (
                      <div
                        key={`${entry.seq}-${idx}`}
                        className="flex items-baseline gap-4"
                      >
                        <span className="shrink-0 tabular-nums text-[#5F6368]">
                          {formatLogTime(entry.ts)}
                        </span>
                        <span
                          className={
                            isLatest ? "text-[#E8EAED]" : "text-[#9AA0A6]"
                          }
                        >
                          {entry.message}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={logEndRef} />
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between border-t border-[#2A2B30] bg-[#16171A] px-6 py-3">
                <span className="font-mono text-[12px] text-[#9AA0A6]">
                  {buildMessages[buildMessages.length - 1]?.message ??
                    "Provisioning sandbox…"}
                </span>
                <span className="font-mono text-[12px] text-[#5F6368]">
                  antigravity-preview-09-2026
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="flex shrink-0 items-center justify-between px-1">
          <p className="text-[12px] text-[#9AA0A6]">
            Built by the Antigravity managed agent in a Google-hosted sandbox
          </p>
          <span className="font-mono text-[12px] text-[#5F6368]">
            {mvpIframeUrl ? "Ready" : "Building"}
          </span>
        </div>
      </div>
    </div>
  );
}
