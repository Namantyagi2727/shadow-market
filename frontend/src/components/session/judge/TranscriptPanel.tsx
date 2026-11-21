"use client";

import React, { useEffect, useRef } from "react";
import {
  formatSpeakerTag,
  type InterimCaption,
  type TranscriptUtterance,
} from "./types";

interface TranscriptPanelProps {
  utterances: TranscriptUtterance[];
  interimCaptions: InterimCaption[];
}

export function TranscriptPanel({
  utterances,
  interimCaptions,
}: TranscriptPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const lastUtteranceId =
    utterances.length > 0 ? utterances[utterances.length - 1].id : "";
  const interimKey = interimCaptions.map((c) => `${c.role}:${c.text}`).join("|");

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [utterances.length, lastUtteranceId, interimKey]);

  const isEmpty = utterances.length === 0 && interimCaptions.length === 0;

  return (
    <section
      aria-label="Live transcript"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-5">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
          Live transcript
        </h2>
        {utterances.length > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-[#5F6368]">
            {utterances.length} {utterances.length === 1 ? "line" : "lines"}
          </span>
        )}
      </div>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 pb-5"
      >
        {isEmpty ? (
          <div className="flex h-full items-center">
            <p className="text-[15px] leading-[1.5] text-[#5F6368]">
              Waiting for speech from the founder or judge…
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {utterances.map((item) => {
              const tag = formatSpeakerTag(item.speaker, item.speakerLabel);
              const isJudge = item.speaker.trim().toLowerCase() === "judge";
              return (
                <div key={item.id} className="judge-fade-in space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-medium tracking-[0.02em] ${
                        isJudge
                          ? "border-[#2A2B30] bg-[#1C1D21] text-[#E8EAED]"
                          : "border-[#2A2B30] bg-[#16171A] text-[#9AA0A6]"
                      }`}
                    >
                      {tag}
                    </span>
                  </div>
                  <p className="text-[15px] font-normal leading-[1.5] text-[#E8EAED]">
                    {item.text}
                  </p>
                </div>
              );
            })}

            {interimCaptions.map((caption) => {
              const tag =
                caption.role === "other"
                  ? "Live"
                  : formatSpeakerTag(caption.role);
              return (
                <div key={`interim-${caption.role}`} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-[6px] border border-[#2A2B30]/70 bg-[#16171A]/60 px-2 py-0.5 text-[11px] font-medium text-[#5F6368]">
                      {tag}
                    </span>
                  </div>
                  <p className="text-[15px] italic leading-[1.5] text-[#5F6368]">
                    {caption.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
