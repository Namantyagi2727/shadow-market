"use client";

import React from "react";
import type { RoomUtteranceData } from "@/lib/contracts";

export interface CaptionTickerProps {
  roomCaption: string | null;
  utterances: RoomUtteranceData[];
}

export function CaptionTicker({ roomCaption, utterances }: CaptionTickerProps) {
  const recentUtterances = utterances.slice(-3);

  return (
    <section
      aria-label="Live room captions"
      className="rounded-2xl border border-white/10 bg-[#0d1018]/90 px-6 py-4"
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
          Room Transcript
        </span>
        {roomCaption && (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            Live
          </span>
        )}
      </div>

      <div className="space-y-2">
        {recentUtterances.length === 0 && !roomCaption && (
          <p className="text-base text-zinc-500">
            Listening for conversation at the table…
          </p>
        )}

        {recentUtterances.map((utt, index) => {
          const isLatest = index === recentUtterances.length - 1 && !roomCaption;
          return (
            <p
              key={utt.utterance_id}
              className={`leading-snug transition-colors ${
                isLatest
                  ? "text-lg font-medium text-zinc-100 sm:text-xl"
                  : "text-base text-zinc-400"
              }`}
            >
              {utt.speaker_label ? (
                <span className="mr-2 font-mono text-xs uppercase text-zinc-500">
                  {utt.speaker_label}:
                </span>
              ) : null}
              {utt.text}
            </p>
          );
        })}

        {roomCaption && (
          <p className="text-lg italic leading-snug text-cyan-200/95 sm:text-xl">
            {roomCaption}
          </p>
        )}
      </div>
    </section>
  );
}
