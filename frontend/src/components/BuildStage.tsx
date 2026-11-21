"use client";

import React, { useState } from "react";
import {
  Box,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Monitor,
  ShoppingBag,
  Terminal,
} from "lucide-react";
import { CompetitorItem, MvpReadyData, resolveArtifactUrl } from "@/lib/contracts";
import { BuildLogEntry } from "@/lib/run-store";

interface BuildStageProps {
  runId: string | null;
  buildMessages: BuildLogEntry[];
  mvp: MvpReadyData | null;
  competitors: CompetitorItem[];
}

export function BuildStage({ runId, buildMessages, mvp, competitors }: BuildStageProps) {
  const [previewTab, setPreviewTab] = useState<"live" | "screenshot" | "hero">("live");

  const resolvedMvpUrl = resolveArtifactUrl(runId, mvp?.url);
  const resolvedScreenshotUrl = resolveArtifactUrl(runId, mvp?.screenshot_url);
  const resolvedHeroUrl = resolveArtifactUrl(runId, mvp?.hero_image_url);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Antigravity Managed Agent Build Stream */}
        <section className="lg:col-span-5 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-emerald-400">
                <Terminal className="h-3.5 w-3.5" />
                <span>Stage 03 — Managed Agent</span>
              </div>
              <h2
                className="mt-0.5 text-lg font-bold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Autonomous MVP Build
              </h2>
            </div>
            <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              antigravity-preview
            </span>
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/70 p-3.5 font-mono text-xs max-h-[420px]">
            {buildMessages.length === 0 ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span>Provisioning sandbox &amp; waiting for build logs...</span>
              </div>
            ) : (
              <ul className="space-y-2">
                {buildMessages.map((entry, idx) => (
                  <li key={entry.seq ?? idx} className="flex gap-2.5 leading-relaxed">
                    <span className="shrink-0 text-zinc-600">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-emerald-200/90 break-words">{entry.message}</span>
                  </li>
                ))}
                {!mvp && (
                  <li className="flex items-center gap-2 pt-1 text-zinc-400">
                    <span className="inline-block h-3 w-1.5 animate-pulse bg-emerald-400" />
                    <span>Building...</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>

        {/* Right: Live Built MVP Preview + Hero Asset */}
        <section className="lg:col-span-7 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
                Generated MVP Artifact
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-xs">
                <button
                  onClick={() => setPreviewTab("live")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                    previewTab === "live"
                      ? "bg-white/15 font-medium text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Live Page</span>
                </button>
                <button
                  onClick={() => setPreviewTab("screenshot")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                    previewTab === "screenshot"
                      ? "bg-white/15 font-medium text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Box className="h-3.5 w-3.5" />
                  <span>Screenshot</span>
                </button>
                {resolvedHeroUrl && (
                  <button
                    onClick={() => setPreviewTab("hero")}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                      previewTab === "hero"
                        ? "bg-white/15 font-medium text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>Hero Image</span>
                  </button>
                )}
              </div>

              {resolvedMvpUrl && (
                <a
                  href={resolvedMvpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                >
                  <span>Open</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <div className="relative min-h-[380px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
            {!mvp ? (
              <div className="flex h-full min-h-[380px] flex-col items-center justify-center p-8 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
                <p className="mt-4 text-sm font-medium text-zinc-200">
                  Compiling landing page + signup + checkout...
                </p>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                  The managed agent writes static HTML/JS and serves it locally so Playwright
                  personas and phones can test it live.
                </p>
              </div>
            ) : previewTab === "live" && resolvedMvpUrl ? (
              <iframe
                src={resolvedMvpUrl}
                title="Generated MVP Preview"
                className="h-[420px] w-full bg-white"
                sandbox="allow-scripts allow-forms allow-same-origin"
              />
            ) : previewTab === "hero" && resolvedHeroUrl ? (
              <div className="flex h-[420px] items-center justify-center bg-black p-4">
                <img
                  src={resolvedHeroUrl}
                  alt="Generated Hero Asset"
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              </div>
            ) : resolvedScreenshotUrl ? (
              <div className="flex h-[420px] items-center justify-center overflow-auto bg-zinc-950 p-3">
                <img
                  src={resolvedScreenshotUrl}
                  alt="MVP Screenshot"
                  className="max-h-full max-w-full rounded-lg border border-white/10 object-contain"
                />
              </div>
            ) : (
              <div className="flex h-[420px] items-center justify-center text-xs text-zinc-500">
                MVP ready — select a preview mode above.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom: Real Shopify Competitors Comparison */}
      <section className="rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
              Live Market Competitors
            </h3>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-300">
              Shopify Catalog
            </span>
          </div>
          <span className="font-mono text-xs text-zinc-500">
            {competitors.length} benchmark{competitors.length === 1 ? "" : "s"}
          </span>
        </div>

        {competitors.length === 0 ? (
          <p className="py-4 text-xs text-zinc-500">
            Waiting for live competitor products and price anchors...
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {competitors.map((item, idx) => (
              <div
                key={idx}
                className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-white/20"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-900">
                  {item.image_url ? (
                    <img
                      src={resolveArtifactUrl(runId, item.image_url) || item.image_url}
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                      <ShoppingBag className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between p-3">
                  <p className="line-clamp-2 text-xs font-medium text-zinc-100">{item.title}</p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {item.price_usd !== null ? `$${item.price_usd.toFixed(2)}` : "N/A"}
                    </span>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
