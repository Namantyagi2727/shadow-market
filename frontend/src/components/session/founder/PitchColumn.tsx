"use client";

import React from "react";
import { MapPin, Tag } from "lucide-react";
import {
  formatPrice,
  type PitchResearchPitch,
  type PitchUpdatePayload,
  type ResearchStatusPayload,
} from "./types";

interface PitchColumnProps {
  pitchUpdate: PitchUpdatePayload | null;
  founderCaption: string | null;
  extractedPitch: PitchResearchPitch | null;
  pitchStatus: ResearchStatusPayload | null;
}

export function PitchColumn({
  pitchUpdate,
  founderCaption,
  extractedPitch,
  pitchStatus,
}: PitchColumnProps) {
  const transcript = pitchUpdate?.transcript?.trim() ?? "";
  const words = pitchUpdate?.words ?? (transcript ? transcript.split(/\s+/).length : 0);

  const showInterimCaption =
    Boolean(founderCaption) &&
    founderCaption !== null &&
    !transcript.toLowerCase().endsWith(founderCaption.trim().toLowerCase());

  const claims = Array.isArray(extractedPitch?.claims)
    ? extractedPitch.claims.filter((c) => typeof c === "string" && c.trim().length > 0)
    : [];

  const hasLocation =
    typeof extractedPitch?.location === "string" &&
    extractedPitch.location.trim().length > 0;
  const hasPrice =
    typeof extractedPitch?.price_usd === "number" &&
    Number.isFinite(extractedPitch.price_usd);

  return (
    <section
      aria-label="Your pitch"
      className="flex min-h-0 flex-col rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-5"
    >
      <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#9AA0A6]">
          Your pitch
        </h2>
        {words > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-[#5F6368]">
            {words} {words === 1 ? "word" : "words"}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {/* Live transcript */}
        <div className="rounded-[12px] border border-[#2A2B30] bg-[#0E0F11]/60 p-3.5">
          {transcript || showInterimCaption ? (
            <p className="text-[14px] leading-[1.55] text-[#E8EAED]">
              {transcript}
              {showInterimCaption && (
                <span className="text-[#9AA0A6]">
                  {transcript ? " " : ""}
                  {founderCaption}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[13px] leading-[1.5] text-[#5F6368]">
              Start the mic and deliver your pitch. Your live transcript and extracted claims appear here.
            </p>
          )}
        </div>

        {/* Running shimmer for pitch extraction */}
        {pitchStatus?.state === "running" && !extractedPitch && (
          <div className="space-y-2 rounded-[12px] border border-[#2A2B30] bg-[#1C1D21]/60 px-3.5 py-2.5">
            <div className="flex items-center justify-between text-[12px] text-[#9AA0A6]">
              <span>Extracting pitch claims</span>
              <span className="text-[11px] text-[#5F6368]">
                {pitchStatus.message || "Running…"}
              </span>
            </div>
            <div className="founder-shimmer-bar h-[2px] w-full rounded-full" />
          </div>
        )}

        {/* Extracted pitch metadata + claims */}
        {extractedPitch && (
          <div className="founder-fade-in space-y-3.5">
            {(extractedPitch.title || extractedPitch.one_liner) && (
              <div className="space-y-1">
                {extractedPitch.title && (
                  <div className="text-[15px] font-medium text-[#E8EAED]">
                    {extractedPitch.title}
                  </div>
                )}
                {extractedPitch.one_liner && (
                  <p className="text-[13px] leading-[1.45] text-[#9AA0A6]">
                    {extractedPitch.one_liner}
                  </p>
                )}
              </div>
            )}

            {/* Location & Price pills */}
            {(hasLocation || hasPrice) && (
              <div className="flex flex-wrap gap-2">
                {hasPrice && (
                  <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-2.5 py-1 font-mono text-[12px] text-[#E8EAED]">
                    <Tag className="h-3 w-3 text-[#9AA0A6]" strokeWidth={1.75} />
                    <span>{formatPrice(extractedPitch.price_usd)}</span>
                  </span>
                )}
                {hasLocation && (
                  <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-2.5 py-1 text-[12px] text-[#E8EAED]">
                    <MapPin className="h-3 w-3 text-[#9AA0A6]" strokeWidth={1.75} />
                    <span>{extractedPitch.location}</span>
                  </span>
                )}
              </div>
            )}

            {/* Claims as chips */}
            {claims.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Extracted claims
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {claims.map((claim, idx) => (
                    <span
                      key={`${idx}-${claim}`}
                      className="rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-2.5 py-1 text-[12px] leading-[1.35] text-[#E8EAED]"
                    >
                      {claim}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
