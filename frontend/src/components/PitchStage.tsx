"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  DollarSign,
  FileVideo,
  Mic,
  RefreshCw,
  Rocket,
  Sparkles,
  Square,
  Target,
  Upload,
  Video,
} from "lucide-react";
import { PitchParsedData } from "@/lib/contracts";
import { createRun } from "@/lib/api";

const MAX_RECORD_SECONDS = 30;
const RECOMMENDED_SECONDS = 20;

interface PitchStageProps {
  runId: string | null;
  pitch: PitchParsedData | null;
  isReplay: boolean;
  onRunCreated: (runId: string) => void;
}

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function PitchStage({ runId, pitch, isReplay, onRunCreated }: PitchStageProps) {
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraState, setCameraState] = useState<"idle" | "ready" | "recording" | "recorded" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedFilename, setRecordedFilename] = useState("pitch.webm");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const stopMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const stopStream = useCallback(() => {
    stopMeter();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopMeter]);

  useEffect(() => {
    if (
      (cameraState === "ready" || cameraState === "recording") &&
      videoPreviewRef.current &&
      streamRef.current &&
      videoPreviewRef.current.srcObject !== streamRef.current
    ) {
      videoPreviewRef.current.srcObject = streamRef.current;
      void videoPreviewRef.current.play().catch(() => {});
    }
  }, [cameraState]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopStream();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl, stopStream]);

  const startAudioMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setAudioLevel(Math.min(1, avg / 90));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Non-fatal if AudioContext cannot start
    }
  }, []);

  const enableCamera = useCallback(async () => {
    setCameraError(null);
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        await videoPreviewRef.current.play().catch(() => {});
      }
      startAudioMeter(stream);
      setCameraState("ready");
    } catch (err) {
      setCameraState("error");
      setCameraError(
        err instanceof Error
          ? err.message
          : "Camera/microphone permission denied. You can also upload a recorded .webm/.mp4 clip."
      );
    }
  }, [startAudioMeter]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    setUploadError(null);
    if (!streamRef.current) {
      await enableCamera();
    }
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = pickSupportedMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

    try {
      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        const finalType = mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: finalType });
        setRecordedBlob(blob);
        setRecordedFilename(finalType.includes("mp4") ? "pitch.mp4" : "pitch.webm");
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setCameraState("recorded");
        stopStream();
      };

      recorder.start(250);
      setElapsedSec(0);
      setCameraState("recording");

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const secs = (Date.now() - startedAt) / 1000;
        setElapsedSec(secs);
        if (secs >= MAX_RECORD_SECONDS) {
          stopRecording();
        }
      }, 100);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Failed to start recording");
      setCameraState("error");
    }
  }, [enableCamera, recordedUrl, stopRecording, stopStream]);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    stopStream();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(file);
    setRecordedFilename(file.name);
    setRecordedUrl(URL.createObjectURL(file));
    setCameraState("recorded");
  };

  const resetCapture = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setElapsedSec(0);
    setUploadError(null);
    setCameraState("idle");
    void enableCamera();
  };

  const handleLaunch = async () => {
    if (!recordedBlob) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { run_id } = await createRun(recordedBlob, recordedFilename);
      onRunCreated(run_id);
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "Failed to upload pitch clip to backend (`POST /api/runs`)."
      );
    } finally {
      setUploading(false);
    }
  };

  const progressPct = Math.min(100, (elapsedSec / MAX_RECORD_SECONDS) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: Webcam Pitch Recorder */}
      <section className="lg:col-span-7 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-emerald-400">
              <Video className="h-3.5 w-3.5" />
              <span>Stage 01 — Founder Pitch</span>
            </div>
            <h1
              className="mt-1 text-2xl font-bold tracking-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Pitch your product in 20 seconds
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Talk out loud and hold up a sketch if you have one. Gemini 4 Hydrogen extracts your
              product spec straight from video + audio.
            </p>
          </div>
          {cameraState === "recording" && (
            <div className="flex items-center gap-2 rounded-full border border-rose-500/50 bg-rose-500/20 px-3 py-1 font-mono text-xs font-semibold text-rose-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              <span>
                {elapsedSec.toFixed(1)}s / {MAX_RECORD_SECONDS}s
              </span>
            </div>
          )}
        </div>

        {/* Video Viewport */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
          {cameraState === "recorded" && recordedUrl ? (
            <video
              src={recordedUrl}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <video
              ref={videoPreviewRef}
              muted
              playsInline
              className={`h-full w-full object-cover ${
                cameraState === "idle" || cameraState === "error" ? "opacity-20" : "opacity-100"
              }`}
            />
          )}

          {/* Idle overlay */}
          {cameraState === "idle" && !isReplay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 p-6 text-center backdrop-blur-[2px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                <Camera className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Camera &amp; Microphone Ready</p>
                <p className="mt-1 max-w-sm text-xs text-zinc-400">
                  Enable your webcam to record up to 30 seconds, or upload an existing pitch clip.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={enableCamera}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  <Camera className="h-4 w-4" />
                  <span>Enable Webcam</span>
                </button>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.12]">
                  <Upload className="h-4 w-4" />
                  <span>Upload Clip</span>
                  <input
                    type="file"
                    accept="video/webm,video/mp4,video/*"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {isReplay && !recordedUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/90 p-6 text-center">
              <FileVideo className="h-8 w-8 text-amber-400" />
              <p className="text-sm font-medium text-amber-200">Replay Mode Active</p>
              <p className="max-w-sm text-xs text-zinc-400">
                Playing back recorded event telemetry for run <span className="font-mono">{runId}</span>.
              </p>
            </div>
          )}

          {/* Live audio level & progress overlay while camera active */}
          {(cameraState === "ready" || cameraState === "recording") && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Mic className="h-3.5 w-3.5 text-emerald-400" />
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-75"
                      style={{ width: `${Math.max(6, Math.round(audioLevel * 100))}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-[11px] text-zinc-300">
                  Target ~{RECOMMENDED_SECONDS}s • Max {MAX_RECORD_SECONDS}s
                </span>
              </div>
              {cameraState === "recording" && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full bg-rose-500 transition-all duration-100"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Errors */}
        {cameraError && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
            {cameraError}
          </div>
        )}
        {uploadError && (
          <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
            {uploadError}
          </div>
        )}

        {/* Controls Footer */}
        {!isReplay && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {cameraState === "ready" && (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(244,63,94,0.35)] transition hover:bg-rose-400"
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  <span>Record Pitch</span>
                </button>
              )}

              {cameraState === "recording" && (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 rounded-xl border border-rose-400/50 bg-rose-500/20 px-5 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30"
                >
                  <Square className="h-4 w-4 fill-current" />
                  <span>Stop Recording</span>
                </button>
              )}

              {cameraState === "recorded" && (
                <>
                  <button
                    onClick={handleLaunch}
                    disabled={uploading}
                    className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Rocket className="h-4 w-4" />
                    <span>{uploading ? "Launching Pipeline..." : "Launch Shadow Market"}</span>
                  </button>
                  <button
                    onClick={resetCapture}
                    disabled={uploading}
                    className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Retake</span>
                  </button>
                </>
              )}

              {cameraState === "error" && (
                <button
                  onClick={enableCamera}
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.1]"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Camera</span>
                </button>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload .webm / .mp4</span>
              <input
                type="file"
                accept="video/webm,video/mp4,video/*"
                onChange={handleFileSelected}
                className="hidden"
              />
            </label>
          </div>
        )}
      </section>

      {/* Right: Extracted Pitch Intelligence Card */}
      <section className="lg:col-span-5 flex flex-col rounded-2xl border border-white/10 bg-[#0d1018]/90 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
              Extracted Pitch Brief
            </h2>
          </div>
          <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
            gemini-4-hydrogen
          </span>
        </div>

        {!pitch ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            {runId ? (
              <>
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
                <p className="mt-4 text-sm font-medium text-zinc-200">
                  Analyzing pitch video &amp; sketch...
                </p>
                <p className="mt-1 max-w-xs text-xs text-zinc-500">
                  Waiting for <code className="text-zinc-300">pitch_parsed</code> event from run{" "}
                  <span className="font-mono">{runId}</span>.
                </p>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-500">
                  <Target className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-medium text-zinc-300">
                  No active pitch yet
                </p>
                <p className="mt-1 max-w-xs text-xs text-zinc-500">
                  Record a 20-second clip and hit Launch. The boardroom, managed agent builder,
                  browser usability panel, and 200-buyer market swarm will run live.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                    Product Concept
                  </span>
                  <h3
                    className="mt-0.5 text-xl font-bold text-white"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {pitch.title}
                  </h3>
                </div>
                {pitch.price_usd !== null && (
                  <div className="flex items-center gap-0.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 font-mono text-sm font-bold text-emerald-200">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>{pitch.price_usd}</span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">{pitch.one_liner}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                Target User
              </div>
              <p className="mt-1 text-sm text-zinc-100">{pitch.target_user || "—"}</p>
            </div>

            {pitch.features.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  Core Features
                </div>
                <ul className="space-y-1.5">
                  {pitch.features.map((feat, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-zinc-200"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pitch.sketch_notes && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3.5">
                <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">
                  Visual / Sketch Notes
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">{pitch.sketch_notes}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
