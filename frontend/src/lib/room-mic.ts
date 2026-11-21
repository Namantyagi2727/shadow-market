"use client";

import { getRoomAudioWebSocketUrl } from "@/lib/api";

export type RoomMicStatus =
  | "idle"
  | "starting"
  | "listening"
  | "muted"
  | "reconnecting"
  | "error"
  | "stopped";

export interface RoomMicStats {
  framesPerSec: number;
  bytesPerSec: number;
  level: number /* 0..1 */;
}

export interface RoomMicOptions {
  runId: string;
  onStatus: (status: RoomMicStatus, detail?: string) => void;
  onStats: (stats: RoomMicStats) => void;
}

interface WorkletLevelMessage {
  type: "level";
  value: number;
}

const WORKLET_URL = "/worklets/pcm16-worklet.js";
const WORKLET_NAME = "pcm16-worklet";
const TWIN_UNMUTE_DELAY_MS = 300;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 4000;
const STATS_INTERVAL_MS = 1000;
const LEVEL_EMIT_MIN_INTERVAL_MS = 100;
const MAX_BUFFERED_BYTES = 128_000;

// Avoid re-registering the same AudioWorkletProcessor name on a reused AudioContext.
const loadedWorkletContexts = new WeakSet<AudioContext>();

function isLevelMessage(data: unknown): data is WorkletLevelMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === "level" &&
    "value" in data &&
    typeof data.value === "number" &&
    Number.isFinite(data.value)
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function formatMicError(err: unknown): string {
  if (
    (typeof DOMException !== "undefined" && err instanceof DOMException) ||
    err instanceof Error
  ) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Microphone permission denied. Allow microphone access and retry.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone device found.";
      case "NotReadableError":
      case "TrackStartError":
        return "Microphone is unavailable or already in use by another app.";
      case "OverconstrainedError":
        return "Microphone does not support the required mono audio settings.";
      case "SecurityError":
        return "Microphone blocked by browser security policy (check HTTPS or insecure-origin flag).";
      default:
        return err.message || "Failed to start room microphone.";
    }
  }
  return "Failed to start room microphone.";
}

export class RoomMicStreamer {
  private readonly opts: RoomMicOptions;

  private status: RoomMicStatus = "idle";
  private stopped = false;
  private running = false;
  private startGeneration = 0;

  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private zeroGainNode: GainNode | null = null;

  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private manualMuted = false;
  private twinSpeaking = false;
  private twinMuted = false;
  private twinUnmuteTimer: ReturnType<typeof setTimeout> | null = null;

  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private sentFramesInWindow = 0;
  private sentBytesInWindow = 0;
  private lastFramesPerSec = 0;
  private lastBytesPerSec = 0;
  private latestLevel = 0;
  private lastStatsEmitMs = 0;

  constructor(opts: RoomMicOptions) {
    this.opts = opts;
  }

  async start(audioContext: AudioContext): Promise<void> {
    if (this.running) {
      return;
    }

    this.stopped = false;
    this.running = true;
    this.reconnectAttempt = 0;
    const generation = ++this.startGeneration;

    this.emitStatus("starting");

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      this.running = false;
      const insecureHint =
        typeof window !== "undefined" && !window.isSecureContext
          ? " Open chrome://flags/#unsafely-treat-insecure-origin-as-secure for this origin."
          : "";
      this.emitStatus("error", `Microphone capture is not available in this browser context.${insecureHint}`);
      return;
    }

    if (!audioContext.audioWorklet) {
      this.running = false;
      this.emitStatus("error", "AudioWorklet is not supported in this browser context.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      if (this.isStale(generation)) return;
      this.running = false;
      this.emitStatus("error", formatMicError(err));
      return;
    }

    if (this.isStale(generation)) {
      this.stopTracks(stream);
      return;
    }
    this.mediaStream = stream;

    for (const track of stream.getTracks()) {
      track.onended = () => {
        try {
          if (this.stopped || !this.running) return;
          this.cleanupMediaAndSocket();
          this.running = false;
          this.emitStatus("error", "Microphone input ended unexpectedly.");
        } catch {
          // Never throw out of event handlers.
        }
      };
    }

    if (!loadedWorkletContexts.has(audioContext)) {
      try {
        await audioContext.audioWorklet.addModule(WORKLET_URL);
        loadedWorkletContexts.add(audioContext);
      } catch (err) {
        if (this.isStale(generation)) return;
        this.cleanupMediaAndSocket();
        this.running = false;
        const msg =
          err instanceof Error && err.message
            ? `Failed to load PCM16 audio worklet: ${err.message}`
            : "Failed to load PCM16 audio worklet.";
        this.emitStatus("error", msg);
        return;
      }
    }

    if (this.isStale(generation)) {
      this.cleanupMediaAndSocket();
      return;
    }

    try {
      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      const zeroGain = audioContext.createGain();
      zeroGain.gain.value = 0;

      worklet.port.onmessage = (event: MessageEvent) => {
        try {
          if (this.stopped || !this.running) return;
          const data: unknown = event.data;
          if (data instanceof ArrayBuffer) {
            this.handlePcmFrame(data);
            return;
          }
          if (isLevelMessage(data)) {
            this.handleLevel(data.value);
          }
        } catch {
          // Never throw out of event handlers.
        }
      };

      worklet.onprocessorerror = () => {
        try {
          if (this.stopped || !this.running) return;
          this.cleanupMediaAndSocket();
          this.running = false;
          this.emitStatus("error", "Audio worklet processor encountered an error.");
        } catch {
          // Never throw out of event handlers.
        }
      };

      source.connect(worklet);
      worklet.connect(zeroGain);
      zeroGain.connect(audioContext.destination);

      this.sourceNode = source;
      this.workletNode = worklet;
      this.zeroGainNode = zeroGain;
    } catch (err) {
      if (this.isStale(generation)) return;
      this.cleanupMediaAndSocket();
      this.running = false;
      this.emitStatus("error", formatMicError(err));
      return;
    }

    this.startStatsLoop();
    this.openSocket();
  }

  setTwinSpeaking(speaking: boolean): void {
    if (speaking) {
      this.clearTwinUnmuteTimer();
      this.twinSpeaking = true;
      const wasMuted = this.isEffectivelyMuted();
      this.twinMuted = true;
      if (!wasMuted) {
        this.syncOpenStatus();
      }
      return;
    }

    if (!this.twinSpeaking) {
      return;
    }

    this.twinSpeaking = false;
    this.clearTwinUnmuteTimer();

    if (this.stopped) {
      this.twinMuted = false;
      return;
    }

    this.twinUnmuteTimer = setTimeout(() => {
      try {
        this.twinUnmuteTimer = null;
        if (this.stopped || this.twinSpeaking) {
          return;
        }
        const wasMuted = this.isEffectivelyMuted();
        this.twinMuted = false;
        const nowMuted = this.isEffectivelyMuted();
        if (wasMuted && !nowMuted) {
          this.flushWorklet();
          this.syncOpenStatus();
        }
      } catch {
        // Never throw out of timer callbacks.
      }
    }, TWIN_UNMUTE_DELAY_MS);
  }

  setManualMute(muted: boolean): void {
    const wasMuted = this.isEffectivelyMuted();
    this.manualMuted = muted;
    const nowMuted = this.isEffectivelyMuted();

    if (wasMuted && !nowMuted) {
      this.flushWorklet();
      this.syncOpenStatus();
    } else if (!wasMuted && nowMuted) {
      this.syncOpenStatus();
    }
  }

  stop(): void {
    if (this.status === "stopped") {
      return;
    }

    this.stopped = true;
    this.running = false;
    this.startGeneration += 1;

    this.clearReconnectTimer();
    this.clearTwinUnmuteTimer();
    this.clearStatsTimer();

    this.twinSpeaking = false;
    this.twinMuted = false;

    this.cleanupMediaAndSocket();

    this.sentFramesInWindow = 0;
    this.sentBytesInWindow = 0;
    this.lastFramesPerSec = 0;
    this.lastBytesPerSec = 0;
    this.latestLevel = 0;
    this.emitStats(true);

    this.emitStatus("stopped");
  }

  private isStale(generation: number): boolean {
    return this.stopped || this.startGeneration !== generation;
  }

  private isEffectivelyMuted(): boolean {
    return this.manualMuted || this.twinMuted;
  }

  private flushWorklet(): void {
    try {
      this.workletNode?.port.postMessage({ type: "flush" });
    } catch {
      // Ignore if worklet port is already closed.
    }
  }

  private syncOpenStatus(): void {
    if (this.stopped || !this.running) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.emitStatus(this.isEffectivelyMuted() ? "muted" : "listening");
    }
  }

  private openSocket(): void {
    if (this.stopped || !this.running) {
      return;
    }

    this.closeSocketOnly();

    let ws: WebSocket;
    try {
      const url = getRoomAudioWebSocketUrl(this.opts.runId);
      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to open audio WebSocket.";
      this.scheduleReconnect(detail);
      return;
    }

    this.socket = ws;

    ws.onopen = () => {
      try {
        if (this.stopped || !this.running || this.socket !== ws) {
          ws.close();
          return;
        }
        this.reconnectAttempt = 0;
        if (this.isEffectivelyMuted()) {
          this.emitStatus("muted");
        } else {
          this.flushWorklet();
          this.emitStatus("listening");
        }
      } catch {
        // Never throw out of event handlers.
      }
    };

    ws.onmessage = () => {
      // Room audio socket is client -> server only; ignore any server frames.
    };

    ws.onerror = () => {
      // Browser fires onclose after onerror; let onclose trigger reconnect.
    };

    ws.onclose = (event: CloseEvent) => {
      try {
        if (this.socket === ws) {
          this.socket = null;
        }
        if (this.stopped || !this.running) {
          return;
        }
        const detail = event.reason
          ? `Audio stream closed (${event.reason})`
          : `Audio stream closed (code ${event.code})`;
        this.scheduleReconnect(detail);
      } catch {
        // Never throw out of event handlers.
      }
    };
  }

  private scheduleReconnect(detail?: string): void {
    if (this.stopped || !this.running) {
      return;
    }
    this.clearReconnectTimer();

    const delayMs = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempt += 1;

    this.emitStatus("reconnecting", detail);

    this.reconnectTimer = setTimeout(() => {
      try {
        this.reconnectTimer = null;
        this.openSocket();
      } catch {
        // Never throw out of timer callbacks.
      }
    }, delayMs);
  }

  private handlePcmFrame(frame: ArrayBuffer): void {
    if (this.isEffectivelyMuted()) {
      return;
    }
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      return;
    }

    try {
      ws.send(frame);
      this.sentFramesInWindow += 1;
      this.sentBytesInWindow += frame.byteLength;
    } catch {
      // Ignore transient send errors while closing.
    }
  }

  private handleLevel(rawLevel: number): void {
    this.latestLevel = clamp01(rawLevel);
    const now = Date.now();
    if (now - this.lastStatsEmitMs >= LEVEL_EMIT_MIN_INTERVAL_MS) {
      this.emitStats(false);
    }
  }

  private startStatsLoop(): void {
    this.clearStatsTimer();
    this.sentFramesInWindow = 0;
    this.sentBytesInWindow = 0;
    this.lastFramesPerSec = 0;
    this.lastBytesPerSec = 0;
    this.latestLevel = 0;
    this.lastStatsEmitMs = 0;

    this.statsTimer = setInterval(() => {
      try {
        if (this.stopped || !this.running) {
          return;
        }
        this.lastFramesPerSec = this.sentFramesInWindow;
        this.lastBytesPerSec = this.sentBytesInWindow;
        this.sentFramesInWindow = 0;
        this.sentBytesInWindow = 0;
        this.emitStats(true);
      } catch {
        // Never throw out of timer callbacks.
      }
    }, STATS_INTERVAL_MS);
  }

  private emitStats(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastStatsEmitMs < LEVEL_EMIT_MIN_INTERVAL_MS) {
      return;
    }
    this.lastStatsEmitMs = now;
    try {
      this.opts.onStats({
        framesPerSec: this.lastFramesPerSec,
        bytesPerSec: this.lastBytesPerSec,
        level: this.latestLevel,
      });
    } catch {
      // Isolate caller callback failures.
    }
  }

  private emitStatus(status: RoomMicStatus, detail?: string): void {
    this.status = status;
    try {
      this.opts.onStatus(status, detail);
    } catch {
      // Isolate caller callback failures.
    }
  }

  private closeSocketOnly(): void {
    const ws = this.socket;
    this.socket = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "stopped");
      }
    } catch {
      // Ignore close errors.
    }
  }

  private stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      track.onended = null;
      try {
        track.stop();
      } catch {
        // Ignore stop errors.
      }
    }
  }

  private cleanupMediaAndSocket(): void {
    this.clearReconnectTimer();
    this.clearStatsTimer();
    this.closeSocketOnly();

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.onprocessorerror = null;
      try {
        this.workletNode.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
      this.workletNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
      this.sourceNode = null;
    }

    if (this.zeroGainNode) {
      try {
        this.zeroGainNode.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
      this.zeroGainNode = null;
    }

    if (this.mediaStream) {
      this.stopTracks(this.mediaStream);
      this.mediaStream = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTwinUnmuteTimer(): void {
    if (this.twinUnmuteTimer !== null) {
      clearTimeout(this.twinUnmuteTimer);
      this.twinUnmuteTimer = null;
    }
  }

  private clearStatsTimer(): void {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }
}
