"use client";

import React, { useEffect, useState } from "react";
import { resolveArtifactUrl, type PitchParsedData } from "@/lib/contracts";
import { formatPrice } from "./types";

interface PitchViewProps {
  runId: string;
  pitch: PitchParsedData | null;
  isActive: boolean;
}

const PITCH_VIDEO_CANDIDATES = ["pitch.webm", "pitch.mp4", "pitch.mov"] as const;

export function PitchView({ runId, pitch, isActive }: PitchViewProps) {
  const [pitchVideoUrl, setPitchVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPitchVideoUrl(null);

    if (!runId) return undefined;

    const probe = async () => {
      for (const filename of PITCH_VIDEO_CANDIDATES) {
        const candidate = resolveArtifactUrl(runId, filename);
        if (!candidate) continue;
        try {
          const res = await fetch(candidate, { method: "HEAD" });
          if (cancelled) return;
          if (res.ok) {
            setPitchVideoUrl(candidate);
            return;
          }
        } catch {
          // Artifact absent or network unavailable — keep silent
        }
      }
    };

    void probe();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!pitch) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-[#5F6368]">
            Waiting for pitch extraction…
          </p>
          {isActive && (
            <div className="live-shimmer-bar h-[2px] w-32 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center overflow-y-auto px-8 py-8 lg:px-12">
      <div
        className={`mx-auto grid w-full max-w-[1040px] gap-6 ${
          pitchVideoUrl ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1 max-w-[820px]"
        }`}
      >
        <section
          className={`rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-8 ${
            pitchVideoUrl ? "lg:col-span-7" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
              Structured pitch
            </span>
            <span className="font-mono text-[12px] text-[#5F6368]">
              gemini-4-hydrogen
            </span>
          </div>

          <h1 className="mt-4 text-[32px] font-medium leading-[1.15] tracking-[-0.02em] text-[#E8EAED]">
            {pitch.title}
          </h1>

          <p className="mt-3 text-[15px] leading-[1.6] text-[#9AA0A6]">
            {pitch.one_liner}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 border-t border-[#2A2B30] pt-6 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Target user
              </div>
              <p className="mt-2 text-[14px] leading-[1.5] text-[#E8EAED]">
                {pitch.target_user || "Not specified"}
              </p>
            </div>

            <div>
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Target price
              </div>
              <p className="mt-1 text-[32px] font-normal leading-none tracking-[-0.02em] tabular-nums text-[#E8EAED]">
                {formatPrice(pitch.price_usd)}
              </p>
            </div>
          </div>

          {pitch.features.length > 0 && (
            <div className="mt-8 border-t border-[#2A2B30] pt-6">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Core claims &amp; features
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {pitch.features.map((feature, idx) => (
                  <li
                    key={`${idx}-${feature}`}
                    className="rounded-[10px] border border-[#2A2B30] bg-[#1C1D21] px-3 py-1.5 text-[13px] text-[#E8EAED]"
                  >
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pitch.sketch_notes.trim().length > 0 && (
            <div className="mt-6 rounded-[12px] border border-[#2A2B30] bg-[#1C1D21] p-4">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                Sketch &amp; prototype notes
              </div>
              <p className="mt-1.5 text-[13px] leading-[1.55] text-[#9AA0A6]">
                {pitch.sketch_notes}
              </p>
            </div>
          )}
        </section>

        {pitchVideoUrl && (
          <section className="flex flex-col justify-center lg:col-span-5">
            <div className="overflow-hidden rounded-[16px] border border-[#2A2B30] bg-[#16171A] p-3">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5F6368]">
                  Founder pitch
                </span>
                <span className="font-mono text-[11px] text-[#5F6368]">
                  16:9
                </span>
              </div>
              <div className="aspect-video w-full overflow-hidden rounded-[10px] bg-black">
                <video
                  src={pitchVideoUrl}
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
