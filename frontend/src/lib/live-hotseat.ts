import { GoogleGenAI, LiveServerMessage, Modality, Session } from "@google/genai";

export interface LiveTranscriptEntry {
  id: string;
  role: "founder" | "persona" | "system";
  text: string;
  ts: string;
}

export type LiveSessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "closed";

export interface LiveHotseatCallbacks {
  onStatusChange: (status: LiveSessionStatus, detail?: string) => void;
  onTranscriptDelta: (role: "founder" | "persona", text: string) => void;
  onTurnComplete: () => void;
  onMicLevel: (level: number) => void;
  onSpeakerLevel: (level: number) => void;
}

function float32ToPcm16Base64(input: Float32Array, sourceRate: number, targetRate = 16000): string {
  let samples = input;
  if (sourceRate !== targetRate && sourceRate > 0) {
    const ratio = sourceRate / targetRate;
    const newLength = Math.max(1, Math.round(input.length / ratio));
    const resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = i * ratio;
      const idx0 = Math.floor(idx);
      const idx1 = Math.min(idx0 + 1, input.length - 1);
      const frac = idx - idx0;
      resampled[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
    }
    samples = resampled;
  }

  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function pcmBase64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const byteLen = binary.length;
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(byteLen / 2);
  const float32 = new Float32Array(new ArrayBuffer(sampleCount * 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

function parseSampleRate(mimeType?: string): number {
  if (!mimeType) return 24000;
  const match = mimeType.match(/rate=(\d+)/i);
  if (match) {
    const rate = Number(match[1]);
    if (Number.isFinite(rate) && rate >= 8000 && rate <= 96000) return rate;
  }
  return 24000;
}

/**
 * Browser bidirectional voice client for gemini-3.8-live using a short-lived
 * ephemeral token issued by the backend (`POST /api/runs/{run_id}/hotseat/{persona_id}`).
 * Never handles or stores a long-lived API key.
 */
export class LiveHotseatClient {
  private session: Session | null = null;
  private micStream: MediaStream | null = null;
  private inputCtx: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private outputCtx: AudioContext | null = null;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private nextPlayTime = 0;
  private muted = false;
  private closed = false;
  private callbacks: LiveHotseatCallbacks;

  constructor(callbacks: LiveHotseatCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(params: {
    ephemeralToken: string;
    model: string;
    systemInstruction: string;
  }): Promise<void> {
    this.closed = false;
    this.callbacks.onStatusChange("connecting");

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Request mic permission before opening Live WebSocket
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.outputCtx = new AudioCtx({ sampleRate: 24000 });
      if (this.outputCtx.state === "suspended") {
        await this.outputCtx.resume();
      }
      this.nextPlayTime = this.outputCtx.currentTime;

      const ai = new GoogleGenAI({
        apiKey: params.ephemeralToken,
        httpOptions: { apiVersion: "v1alpha" },
      });

      this.session = await ai.live.connect({
        model: params.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: params.systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (this.closed) return;
            this.callbacks.onStatusChange("connected");
          },
          onmessage: (msg: LiveServerMessage) => {
            if (this.closed) return;
            this.handleServerMessage(msg);
          },
          onerror: (err: ErrorEvent) => {
            if (this.closed) return;
            this.callbacks.onStatusChange("error", err.message || "Live WebSocket error");
          },
          onclose: (evt: CloseEvent) => {
            if (this.closed) return;
            const reason = evt.reason ? ` (${evt.reason})` : "";
            this.callbacks.onStatusChange("closed", `Session closed${reason}`);
          },
        },
      });

      this.startMicCapture();
    } catch (err) {
      this.disconnect();
      const message = err instanceof Error ? err.message : "Failed to connect live voice session";
      this.callbacks.onStatusChange("error", message);
      throw err;
    }
  }

  private startMicCapture(): void {
    if (!this.micStream || !this.session) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    const ctx = new AudioCtx();
    this.inputCtx = ctx;
    const source = ctx.createMediaStreamSource(this.micStream);
    // 2048 samples gives ~42ms chunks at 48kHz for low-latency streaming
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    this.processorNode = processor;

    const zeroGain = ctx.createGain();
    zeroGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (this.closed || !this.session) return;
      const input = event.inputBuffer.getChannelData(0);

      if (this.muted) {
        this.callbacks.onMicLevel(0);
        return;
      }

      // Compute RMS level for visual feedback
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) {
        sumSq += input[i] * input[i];
      }
      const rms = Math.sqrt(sumSq / input.length);
      this.callbacks.onMicLevel(Math.min(1, rms * 5.5));

      try {
        const base64 = float32ToPcm16Base64(input, ctx.sampleRate, 16000);
        this.session.sendRealtimeInput({
          audio: {
            data: base64,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      } catch {
        // Ignore transient send errors when closing
      }
    };

    source.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(ctx.destination);
  }

  private handleServerMessage(msg: LiveServerMessage): void {
    const serverContent = msg.serverContent;
    if (!serverContent) return;

    // Immediate barge-in flush when user interrupts model speech
    if (serverContent.interrupted) {
      this.clearPlaybackQueue();
    }

    if (serverContent.inputTranscription?.text) {
      this.callbacks.onTranscriptDelta("founder", serverContent.inputTranscription.text);
    }

    if (serverContent.outputTranscription?.text) {
      this.callbacks.onTranscriptDelta("persona", serverContent.outputTranscription.text);
    }

    const parts = serverContent.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/pcm")) {
        this.enqueuePcmAudio(part.inlineData.data, parseSampleRate(part.inlineData.mimeType));
      }
    }

    if (serverContent.turnComplete) {
      this.callbacks.onTurnComplete();
    }
  }

  private enqueuePcmAudio(base64Pcm: string, sampleRate: number): void {
    if (!this.outputCtx) return;
    if (this.outputCtx.state === "suspended") {
      void this.outputCtx.resume();
    }

    const float32 = pcmBase64ToFloat32(base64Pcm);
    if (float32.length === 0) return;

    // Speaker energy level for orb animation
    let sumSq = 0;
    for (let i = 0; i < float32.length; i++) sumSq += float32[i] * float32[i];
    const rms = Math.sqrt(sumSq / float32.length);
    this.callbacks.onSpeakerLevel(Math.min(1, rms * 5));

    const buffer = this.outputCtx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = this.outputCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputCtx.destination);

    const now = this.outputCtx.currentTime;
    const startAt = Math.max(now + 0.02, this.nextPlayTime);
    this.nextPlayTime = startAt + buffer.duration;

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) {
        this.callbacks.onSpeakerLevel(0);
      }
    };
    source.start(startAt);
  }

  private clearPlaybackQueue(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextPlayTime = this.outputCtx.currentTime;
    }
    this.callbacks.onSpeakerLevel(0);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.callbacks.onMicLevel(0);
      try {
        this.session?.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // ignore
      }
    }
  }

  sendTextMessage(text: string): void {
    if (!this.session || !text.trim()) return;
    this.session.sendRealtimeInput({ text: text.trim() });
    this.callbacks.onTranscriptDelta("founder", text.trim());
  }

  disconnect(): void {
    this.closed = true;
    this.clearPlaybackQueue();

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.inputCtx) {
      void this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }
    if (this.outputCtx) {
      void this.outputCtx.close().catch(() => {});
      this.outputCtx = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // ignore
      }
      this.session = null;
    }
    this.callbacks.onMicLevel(0);
    this.callbacks.onSpeakerLevel(0);
  }
}
