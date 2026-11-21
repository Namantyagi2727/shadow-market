"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  UserX,
  Volume2,
  X,
} from "lucide-react";
import { requestHotseatToken } from "@/lib/api";
import {
  LiveHotseatClient,
  LiveSessionStatus,
  LiveTranscriptEntry,
} from "@/lib/live-hotseat";
import { PersonaState } from "@/lib/run-store";

interface HotseatModalProps {
  runId: string;
  persona: PersonaState;
  onClose: () => void;
}

export function HotseatModal({ runId, persona, onClose }: HotseatModalProps) {
  const clientRef = useRef<LiveHotseatClient | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<LiveSessionStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState<string>("Requesting ephemeral Live token...");
  const [modelName, setModelName] = useState<string>("gemini-3.8-live");
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakerLevel, setSpeakerLevel] = useState(0);
  const [transcript, setTranscript] = useState<LiveTranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState("");

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    let cancelled = false;

    const appendTranscriptDelta = (role: "founder" | "persona", delta: string) => {
      if (!delta) return;
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, text: last.text + delta };
          return updated;
        }
        return [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role,
            text: delta,
            ts: new Date().toISOString(),
          },
        ];
      });
    };

    const boot = async () => {
      try {
        setStatus("connecting");
        setStatusDetail("Requesting ephemeral session token from backend...");
        const tokenResp = await requestHotseatToken(runId, persona.persona_id);
        if (cancelled) return;

        setModelName(tokenResp.model || "gemini-3.8-live");
        setStatusDetail(`Connecting microphone & ${tokenResp.model || "gemini-3.8-live"}...`);

        const client = new LiveHotseatClient({
          onStatusChange: (nextStatus, detail) => {
            if (cancelled) return;
            setStatus(nextStatus);
            if (detail) setStatusDetail(detail);
            else if (nextStatus === "connected") {
              setStatusDetail("Live voice channel open — ask why they quit!");
            }
          },
          onTranscriptDelta: (role, text) => {
            if (cancelled) return;
            appendTranscriptDelta(role, text);
          },
          onTurnComplete: () => {
            // Optional separator hook
          },
          onMicLevel: (lvl) => {
            if (!cancelled) setMicLevel(lvl);
          },
          onSpeakerLevel: (lvl) => {
            if (!cancelled) setSpeakerLevel(lvl);
          },
        });

        clientRef.current = client;
        await client.connect({
          ephemeralToken: tokenResp.ephemeral_token,
          model: tokenResp.model || "gemini-3.8-live",
          systemInstruction: tokenResp.system_instruction,
        });
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setStatusDetail(
          err instanceof Error
            ? err.message
            : "Could not start Live hot-seat session."
        );
      }
    };

    void boot();

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [runId, persona.persona_id]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    clientRef.current?.setMuted(next);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    clientRef.current?.sendTextMessage(textInput);
    setTextInput("");
  };

  const handleHangup = () => {
    clientRef.current?.disconnect();
    onClose();
  };

  const orbScale = 1 + Math.max(micLevel, speakerLevel) * 0.35;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c1018] shadow-[0_0_80px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-400/40 bg-rose-500/15 text-rose-300">
              <UserX className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className="text-lg font-bold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Hot-Seat: {persona.name}
                </h2>
                <span className="rounded bg-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                  {modelName}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {persona.role} • {persona.device}
                {persona.quit_reason ? ` • Quit: "${persona.quit_reason}"` : ""}
              </p>
            </div>
          </div>

          <button
            onClick={handleHangup}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-12">
          {/* Left: Voice Orb + Grounded Context */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-5 md:col-span-5">
            <div className="flex w-full items-center justify-between text-xs">
              <span
                className={`flex items-center gap-1.5 font-mono uppercase tracking-wider ${
                  status === "connected"
                    ? "text-emerald-400"
                    : status === "error"
                    ? "text-rose-400"
                    : "text-amber-300"
                }`}
              >
                {status === "connecting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Radio className="h-3.5 w-3.5" />
                )}
                <span>{status}</span>
              </span>
              <span className="font-mono text-[10px] text-zinc-500">Ephemeral Token</span>
            </div>

            {/* Voice Orb */}
            <div className="my-8 flex flex-col items-center">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <div
                  className={`absolute inset-0 rounded-full blur-2xl transition-transform duration-100 ${
                    speakerLevel > 0.05
                      ? "bg-cyan-500/35"
                      : micLevel > 0.05
                      ? "bg-emerald-500/35"
                      : "bg-white/10"
                  }`}
                  style={{ transform: `scale(${orbScale})` }}
                />
                <div
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-all duration-100 ${
                    status === "connected"
                      ? speakerLevel > 0.05
                        ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                        : "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                      : status === "error"
                      ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                      : "border-amber-400/50 bg-amber-500/10 text-amber-200"
                  }`}
                  style={{ transform: `scale(${1 + Math.max(micLevel, speakerLevel) * 0.14})` }}
                >
                  {speakerLevel > 0.05 ? (
                    <Volume2 className="h-8 w-8" />
                  ) : muted ? (
                    <MicOff className="h-8 w-8 text-zinc-400" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-zinc-300">{statusDetail}</p>
            </div>

            {/* Mic & Hangup Controls */}
            <div className="flex w-full items-center justify-center gap-3">
              <button
                onClick={toggleMute}
                disabled={status !== "connected"}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition disabled:opacity-40 ${
                  muted
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                    : "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
                }`}
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{muted ? "Unmute Mic" : "Mute Mic"}</span>
              </button>
              <button
                onClick={handleHangup}
                className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-400"
              >
                <PhoneOff className="h-4 w-4" />
                <span>End Call</span>
              </button>
            </div>

            {/* Recent persona actions for interviewer context */}
            {persona.actions.length > 0 && (
              <div className="mt-5 w-full border-t border-white/10 pt-3">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Last Actions Before {persona.status === "quit" ? "Quit" : "Finish"}
                </div>
                <div className="max-h-24 space-y-1 overflow-y-auto text-[11px] text-zinc-400">
                  {persona.actions.slice(-4).map((act, idx) => (
                    <div key={idx} className="truncate">
                      <span className="font-mono text-zinc-500">{act.t.toFixed(1)}s</span>{" "}
                      <span className="text-zinc-200">{act.action}</span> {act.target}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Transcript + Text Fallback */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-black/40 p-4 md:col-span-7">
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                Live Interview Transcript
              </span>
              <span className="text-[11px] text-zinc-500">Speak naturally — barge-in supported</span>
            </div>

            {status === "error" && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 p-3 text-xs text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Unable to connect Live Hot-Seat</p>
                  <p className="mt-0.5 opacity-90">{statusDetail}</p>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto py-2 min-h-[240px] max-h-[340px]">
              {transcript.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-xs text-zinc-500">
                  <p>Ask {persona.name}:</p>
                  <p className="mt-1 italic text-zinc-400">
                    &ldquo;Walk me through the exact moment you decided to leave the page.&rdquo;
                  </p>
                </div>
              ) : (
                transcript.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      entry.role === "founder"
                        ? "ml-8 border border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                        : "mr-8 border border-cyan-500/25 bg-cyan-500/10 text-cyan-50"
                    }`}
                  >
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-wider opacity-70">
                      {entry.role === "founder" ? "You (Founder)" : persona.name}
                    </div>
                    <p>{entry.text}</p>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            <form onSubmit={handleSendText} className="mt-3 flex gap-2 border-t border-white/10 pt-3">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={status !== "connected"}
                placeholder="Or type a follow-up question..."
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-400/50 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={status !== "connected" || !textInput.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
