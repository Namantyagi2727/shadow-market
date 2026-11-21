"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mic, MicOff, PhoneOff, Radio, Video } from "lucide-react";
import { PitchStage } from "@/components/PitchStage";
import { LiveHotseatClient, LiveSessionStatus } from "@/lib/live-hotseat";
import { getApiBase } from "@/lib/contracts";

export default function SpikesHarnessPage() {
  const [spikeARunId, setSpikeARunId] = useState<string | null>(null);

  // Spike B: direct ephemeral token tester for gemini-3.8-live
  const [ephemeralToken, setEphemeralToken] = useState("");
  const [model, setModel] = useState("gemini-3.8-live");
  const [systemInstruction, setSystemInstruction] = useState(
    "You are a busy startup buyer who just bounced off a SaaS checkout page because pricing felt unclear. Answer briefly and candidly."
  );
  const [liveStatus, setLiveStatus] = useState<LiveSessionStatus>("idle");
  const [liveDetail, setLiveDetail] = useState("");
  const [muted, setMuted] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const clientRef = useRef<LiveHotseatClient | null>(null);

  const connectLiveSpike = async () => {
    if (!ephemeralToken.trim()) return;
    clientRef.current?.disconnect();
    setTranscriptLines([]);
    const client = new LiveHotseatClient({
      onStatusChange: (status, detail) => {
        setLiveStatus(status);
        setLiveDetail(detail || "");
      },
      onTranscriptDelta: (role, text) => {
        setTranscriptLines((prev) => [...prev, `${role}: ${text}`]);
      },
      onTurnComplete: () => {},
      onMicLevel: () => {},
      onSpeakerLevel: () => {},
    });
    clientRef.current = client;
    try {
      await client.connect({
        ephemeralToken: ephemeralToken.trim(),
        model: model.trim() || "gemini-3.8-live",
        systemInstruction,
      });
    } catch {
      // handled in onStatusChange
    }
  };

  const disconnectLiveSpike = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setLiveStatus("closed");
  };

  return (
    <div className="min-h-screen bg-stage-grid px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Stage UI</span>
            </Link>
            <h1
              className="mt-1 text-2xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Frontend Spikes Testbench
            </h1>
            <p className="font-mono text-xs text-zinc-400">
              API Base: {getApiBase()}
            </p>
          </div>
        </div>

        {/* Spike A */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-emerald-400">
            <Video className="h-4 w-4" />
            <span>Spike A — 20–30s Webcam + Mic Upload (POST /api/runs)</span>
          </div>
          {spikeARunId && (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 font-mono text-xs text-emerald-200">
              Created run_id: <strong>{spikeARunId}</strong> —{" "}
              <Link href={`/?run=${encodeURIComponent(spikeARunId)}`} className="underline">
                Open in Stage UI
              </Link>
            </div>
          )}
          <PitchStage
            runId={spikeARunId}
            pitch={null}
            isReplay={false}
            onRunCreated={(id) => setSpikeARunId(id)}
          />
        </div>

        {/* Spike B */}
        <section className="rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cyan-400">
              <Radio className="h-4 w-4" />
              <span>Spike B — Browser Voice with gemini-3.8-live (Ephemeral Token)</span>
            </div>
            <span className="font-mono text-xs text-zinc-300">Status: {liveStatus}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-400">
                  Ephemeral Token (from backend hotseat route — never paste a real API key)
                </label>
                <input
                  type="password"
                  value={ephemeralToken}
                  onChange={(e) => setEphemeralToken(e.target.value)}
                  placeholder="auth_tokens/..."
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-white focus:border-cyan-400/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-400">
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-400">
                  System Instruction
                </label>
                <textarea
                  rows={3}
                  value={systemInstruction}
                  onChange={(e) => setSystemInstruction(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={connectLiveSpike}
                  disabled={!ephemeralToken.trim() || liveStatus === "connected"}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-40"
                >
                  Connect Voice
                </button>
                <button
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    clientRef.current?.setMuted(next);
                  }}
                  disabled={liveStatus !== "connected"}
                  className="flex items-center gap-1 rounded-xl border border-white/15 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40"
                >
                  {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  <span>{muted ? "Unmute" : "Mute"}</span>
                </button>
                <button
                  onClick={disconnectLiveSpike}
                  disabled={liveStatus !== "connected" && liveStatus !== "connecting"}
                  className="flex items-center gap-1 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
              {liveDetail && <p className="font-mono text-xs text-zinc-400">{liveDetail}</p>}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-xs text-zinc-300 min-h-[200px] max-h-[260px] overflow-y-auto">
              {transcriptLines.length === 0 ? (
                <p className="text-zinc-500">Live audio transcripts will stream here...</p>
              ) : (
                transcriptLines.map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
