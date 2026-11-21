"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Circle, Square, Sparkles, Play } from "lucide-react";
import { Inter } from "next/font/google";
import { createRun, fetchDemoRuns } from "@/lib/api";
import { getApiBase, type DemoRunSummary } from "@/lib/contracts";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500"] });

const MAX_SECONDS = 30;

async function createTextRun(text: string): Promise<string> {
  const form = new FormData();
  form.append("text", text);
  const res = await fetch(`${getApiBase()}/api/runs`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Could not start run (${res.status})`);
  return (await res.json()).run_id as string;
}

/** Minimal start screen: record a pitch (webcam + mic) or type it, then go to /live/[runId]. */
export function StartPitch() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<"video" | "text">("video");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<DemoRunSummary[]>([]);

  useEffect(() => {
    fetchDemoRuns().then(setRuns).catch(() => setRuns([]));
  }, []);

  useEffect(() => {
    if (mode !== "video") return;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError("Camera or microphone unavailable — you can type the pitch instead."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, recording]);

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "" });
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      await submit(() => createRun(blob, "pitch.webm").then((r) => r.run_id));
    };
    recorderRef.current = rec;
    setSeconds(0);
    setRecording(true);
    rec.start(250);
  }

  function stopRecording() {
    setRecording(false);
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
  }

  async function submit(start: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      const runId = await start();
      router.push(`/live/${runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the run.");
      setBusy(false);
    }
  }

  return (
    <div className={`${inter.className} min-h-screen bg-[#0E0F11] text-[#E8EAED] flex flex-col`}>
      <header className="h-14 px-8 flex items-center justify-between border-b border-[#2A2B30]">
        <span className="text-[15px] font-medium">Shadow Market</span>
        <a href="/classic" className="text-[12px] text-[#5F6368] hover:text-[#9AA0A6]">Classic view</a>
      </header>

      <main className="flex-1 grid grid-cols-[1fr_360px] gap-8 px-8 py-8 max-w-[1440px] w-full mx-auto">
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="text-[32px] font-light tracking-tight">Pitch an idea.</h1>
            <p className="text-[14px] text-[#9AA0A6] mt-2 max-w-xl">
              Gemini builds the MVP, sends six testers through it, asks 200 buyers, and gives you a launch probability we backtested on real 2026 launches.
            </p>
          </div>

          <div className="flex gap-2 text-[13px]">
            {(["video", "text"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 h-8 rounded-[10px] border ${mode === m ? "border-[#E8EAED] text-[#E8EAED]" : "border-[#2A2B30] text-[#9AA0A6] hover:text-[#E8EAED]"}`}
              >
                {m === "video" ? "Record" : "Type"}
              </button>
            ))}
          </div>

          {mode === "video" ? (
            <div className="relative aspect-video max-h-[56vh] rounded-2xl overflow-hidden bg-[#16171A] border border-[#2A2B30]">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
              <div className="absolute inset-x-0 bottom-0 p-5 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                <span className="text-[12px] text-[#9AA0A6]">
                  {recording ? `Recording · ${seconds}s / ${MAX_SECONDS}s` : "Speak your idea and hold up any sketch. Up to 30 seconds."}
                </span>
                <button
                  disabled={busy || !streamRef.current}
                  onClick={recording ? stopRecording : startRecording}
                  className="h-10 px-4 rounded-full bg-[#E8EAED] text-[#0E0F11] text-[13px] font-medium flex items-center gap-2 disabled:opacity-40"
                >
                  {recording ? <Square size={14} /> : <Circle size={14} className="fill-[#F28B82] text-[#F28B82]" />}
                  {busy ? "Starting…" : recording ? "Stop & run" : "Record"}
                </button>
              </div>
              {recording && (
                <div className="absolute top-0 inset-x-0 h-[2px] bg-[linear-gradient(90deg,#4285F4,#9B72CB,#D96570)]" style={{ width: `${(seconds / MAX_SECONDS) * 100}%` }} />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="A clip-on bike light that projects a glowing lane onto the road. $39. For city commuters who ride after dark."
                className="w-full rounded-2xl bg-[#16171A] border border-[#2A2B30] p-5 text-[15px] leading-relaxed placeholder:text-[#5F6368] focus:outline-none focus:border-[#9AA0A6]"
              />
              <button
                disabled={busy || text.trim().length < 15}
                onClick={() => submit(() => createTextRun(text.trim()))}
                className="self-start h-10 px-4 rounded-full bg-[#E8EAED] text-[#0E0F11] text-[13px] font-medium flex items-center gap-2 disabled:opacity-40"
              >
                <Sparkles size={14} /> {busy ? "Starting…" : "Run it"}
              </button>
            </div>
          )}

          {error && <p className="text-[13px] text-[#F28B82]">{error}</p>}
        </section>

        <aside className="flex flex-col gap-3">
          <span className="text-[12px] uppercase tracking-[0.08em] text-[#5F6368]">Recent runs</span>
          {runs.length === 0 && <p className="text-[13px] text-[#5F6368]">No runs yet.</p>}
          {runs.map((r) => (
            <div key={r.run_id} className="rounded-2xl bg-[#16171A] border border-[#2A2B30] p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] truncate">{r.title || r.run_id}</p>
                <p className="text-[12px] text-[#5F6368] font-mono">{r.run_id}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={`/live/${r.run_id}`} className="text-[12px] text-[#9AA0A6] hover:text-[#E8EAED]">Open</a>
                <a href={`/live/${r.run_id}?replay=1&speed=4`} className="text-[12px] text-[#9AA0A6] hover:text-[#E8EAED] flex items-center gap-1">
                  <Play size={12} /> Replay
                </a>
              </div>
            </div>
          ))}
        </aside>
      </main>
    </div>
  );
}
