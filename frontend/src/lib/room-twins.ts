"use client";

import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from "@google/genai";
import {
  postRoomChallenge,
  requestTwinToken,
  resolveApiUrl,
} from "@/lib/api";
import type {
  RoomChallengeRequest,
  RoomTwinTokenResponse,
} from "@/lib/contracts";

export interface TwinSeat {
  seat: number;
  role: string;
}

export type TwinStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "speaking"
  | "error"
  | "closed";

export interface RoomTwinOptions {
  runId: string;
  seats: TwinSeat[];
  audioContext: AudioContext;
  onSeatStatus: (seat: number, status: TwinStatus, detail?: string) => void;
  onTwinSpeaking: (speaking: boolean) => void; // true while ANY twin audio (Live or server fallback) is playing
  onTwinTranscript: (seat: number, text: string) => void; // Live output transcription, accumulated per turn
}

type LiveFunctionCall = NonNullable<
  NonNullable<LiveServerMessage["toolCall"]>["functionCalls"]
>[number];

interface PendingUtterance {
  id: string | null;
  consumed: boolean;
}

interface SeatRuntime {
  seat: number;
  role: string;
  status: TwinStatus;
  session: Session | null;
  pendingUtterances: PendingUtterance[];
  turnTranscript: string;
  transcriptComplete: boolean;
  activeAudioCount: number;
  speakingDrainTimer: ReturnType<typeof setTimeout> | null;
  pendingSpeakTimers: Set<ReturnType<typeof setTimeout>>;
  closed: boolean;
}

interface ActivePlaybackItem {
  source: AudioBufferSourceNode;
  seat: number | null;
  resolve: () => void;
}

const DEFAULT_PCM_SAMPLE_RATE = 24000;
const SCHEDULE_LEAD_TIME_S = 0.02;
const QUEUE_DRAIN_GRACE_MS = 150;
const IMMEDIATE_SPEAK_THRESHOLD_MS = 50;

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
  if (!mimeType) return DEFAULT_PCM_SAMPLE_RATE;
  const match = mimeType.match(/rate=(\d+)/i);
  if (match) {
    const rate = Number(match[1]);
    if (Number.isFinite(rate) && rate >= 8000 && rate <= 96000) return rate;
  }
  return DEFAULT_PCM_SAMPLE_RATE;
}

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  return fallback;
}

function roleMatchesTopic(role: string, topic: string): boolean {
  const normalizedRole = role.toLowerCase();
  const normalizedTopic = topic.trim().toLowerCase();

  if (normalizedTopic === "price" || normalizedTopic === "traction") {
    return normalizedRole.includes("cfo") || normalizedRole.includes("finance");
  }
  if (normalizedTopic === "tech") {
    return normalizedRole.includes("product") || normalizedRole.includes("cto");
  }
  if (normalizedTopic === "market" || normalizedTopic === "competitors") {
    return normalizedRole.includes("vc") || normalizedRole.includes("partner");
  }
  return false;
}

export class RoomTwinManager {
  private readonly opts: RoomTwinOptions;
  private readonly seatOrder: SeatRuntime[];

  private disconnected = false;
  private connectGeneration = 0;
  private roundRobinCursor = 0;

  private readonly activeItems = new Set<ActivePlaybackItem>();
  private globalDrainTimer: ReturnType<typeof setTimeout> | null = null;
  private nextPlayTime = 0;
  private twinSpeaking = false;
  private serverLoadChain: Promise<void> = Promise.resolve();

  constructor(opts: RoomTwinOptions) {
    this.opts = opts;
    this.seatOrder = opts.seats.map((s) => ({
      seat: s.seat,
      role: s.role,
      status: "idle",
      session: null,
      pendingUtterances: [],
      turnTranscript: "",
      transcriptComplete: false,
      activeAudioCount: 0,
      speakingDrainTimer: null,
      pendingSpeakTimers: new Set(),
      closed: false,
    }));
    this.nextPlayTime = opts.audioContext.currentTime;
  }

  async connectAll(): Promise<void> {
    if (this.disconnected) {
      return;
    }

    const generation = ++this.connectGeneration;
    await Promise.allSettled(
      this.seatOrder.map((seatState) => this.connectSeat(seatState, generation))
    );
  }

  handleTriggeredGate(
    utteranceText: string,
    utteranceId: string | null,
    topic: string
  ): void {
    if (this.disconnected) {
      return;
    }

    const cleaned = utteranceText.trim();
    if (!cleaned) {
      return;
    }

    const chosen = this.selectReadySeat(topic);
    if (!chosen || !chosen.session) {
      // No seat is currently ready; backend server fallback covers it.
      return;
    }

    chosen.pendingUtterances.push({ id: utteranceId, consumed: false });
    chosen.turnTranscript = "";
    chosen.transcriptComplete = false;

    const prompt = `Judge said out loud: '${cleaned}'`;
    try {
      chosen.session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: prompt }] }],
        turnComplete: true,
      });
    } catch (err) {
      chosen.pendingUtterances.pop();
      const msg = formatError(err, "Failed to send prompt to twin session");
      console.error(
        `[RoomTwinManager] Seat ${chosen.seat} sendClientContent error:`,
        err
      );
      this.setSeatStatus(chosen, "error", msg);
    }
  }

  async playServerChallenge(audioUrl: string): Promise<void> {
    if (this.disconnected || !audioUrl.trim()) {
      return;
    }

    const ctx = this.opts.audioContext;
    if (ctx.state === "closed") {
      return;
    }

    const resolvedUrl = resolveApiUrl(audioUrl);

    const fetchAndDecode = (async (): Promise<AudioBuffer | null> => {
      const response = await fetch(resolvedUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to load twin audio (${response.status} ${response.statusText || "error"})`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      if (this.disconnected || ctx.state === "closed") {
        return null;
      }
      return await ctx.decodeAudioData(arrayBuffer);
    })();
    // Prevent unhandled rejection noise if an earlier item in serverLoadChain is still running.
    void fetchAndDecode.catch(() => {});

    let playbackDone: Promise<void> = Promise.resolve();
    const enqueueTask = this.serverLoadChain.then(async () => {
      const audioBuffer = await fetchAndDecode;
      if (!audioBuffer || this.disconnected || ctx.state === "closed") {
        return;
      }
      playbackDone = this.enqueueAudioBuffer(null, audioBuffer);
    });

    this.serverLoadChain = enqueueTask.catch(() => {});

    await enqueueTask;
    await playbackDone;
  }

  disconnectAll(): void {
    if (this.disconnected) {
      return;
    }

    this.disconnected = true;
    this.connectGeneration += 1;

    this.stopAllPlayback();

    for (const seatState of this.seatOrder) {
      seatState.closed = true;
      seatState.pendingUtterances = [];
      seatState.activeAudioCount = 0;
      this.clearSeatDrainTimer(seatState);
      this.clearSeatPendingSpeakTimers(seatState);

      const session = seatState.session;
      seatState.session = null;
      if (session) {
        try {
          session.close();
        } catch {
          // Ignore close errors during teardown.
        }
      }

      if (seatState.status !== "closed") {
        this.setSeatStatus(seatState, "closed");
      }
    }
  }

  private async connectSeat(
    seatState: SeatRuntime,
    generation: number
  ): Promise<void> {
    if (this.isStale(seatState, generation)) {
      return;
    }

    this.setSeatStatus(seatState, "connecting");

    let tokenResp: RoomTwinTokenResponse;
    try {
      tokenResp = await requestTwinToken(this.opts.runId, seatState.seat);
    } catch (err) {
      if (this.isStale(seatState, generation)) return;
      const msg = formatError(err, "Failed to request twin token");
      console.error(
        `[RoomTwinManager] Seat ${seatState.seat} token request failed:`,
        err
      );
      this.setSeatStatus(seatState, "error", msg);
      return;
    }

    if (this.isStale(seatState, generation)) {
      return;
    }

    if (!tokenResp.ephemeral_token || !tokenResp.model) {
      const msg = "Invalid twin token response from backend";
      console.error(`[RoomTwinManager] Seat ${seatState.seat}: ${msg}`);
      this.setSeatStatus(seatState, "error", msg);
      return;
    }

    let closedBeforeResolve = false;
    let erroredBeforeResolve = false;
    let connectedSession: Session | null = null;

    try {
      const ai = new GoogleGenAI({
        apiKey: tokenResp.ephemeral_token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const session = await ai.live.connect({
        model: tokenResp.model,
        config: {
          responseModalities: [Modality.AUDIO],
          ...(tokenResp.system_instruction
            ? { systemInstruction: tokenResp.system_instruction }
            : {}),
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            // Status transitions to "ready" immediately once session handle is stored below.
          },
          onmessage: (msg: LiveServerMessage) => {
            try {
              if (this.isStale(seatState, generation)) return;
              this.handleServerMessage(seatState, msg);
            } catch (err) {
              console.error(
                `[RoomTwinManager] Seat ${seatState.seat} onmessage error:`,
                err
              );
            }
          },
          onerror: (err: ErrorEvent) => {
            try {
              if (this.isStale(seatState, generation)) return;
              erroredBeforeResolve = true;
              const detail = err?.message || "Live WebSocket error";
              console.error(
                `[RoomTwinManager] Seat ${seatState.seat} WebSocket error:`,
                detail
              );
              this.setSeatStatus(seatState, "error", detail);
            } catch {
              // Never throw out of callbacks.
            }
          },
          onclose: (evt: CloseEvent) => {
            try {
              closedBeforeResolve = true;
              if (connectedSession && seatState.session === connectedSession) {
                seatState.session = null;
              }
              if (this.isStale(seatState, generation)) return;
              const detail = evt?.reason
                ? `Session closed (${evt.reason})`
                : evt?.code
                  ? `Session closed (code ${evt.code})`
                  : "Session closed";
              if (evt && evt.code !== 1000 && evt.code !== 0) {
                this.setSeatStatus(seatState, "error", detail);
              } else {
                this.setSeatStatus(seatState, "closed", detail);
              }
            } catch {
              // Never throw out of callbacks.
            }
          },
        },
      });

      connectedSession = session;

      if (this.isStale(seatState, generation) || closedBeforeResolve) {
        try {
          session.close();
        } catch {
          // Ignore close errors.
        }
        return;
      }

      seatState.session = session;
      if (!erroredBeforeResolve) {
        this.setSeatStatus(seatState, "ready");
      }
    } catch (err) {
      if (this.isStale(seatState, generation)) return;
      const msg = formatError(err, "Failed to connect Gemini Live twin session");
      console.error(
        `[RoomTwinManager] Seat ${seatState.seat} connect error:`,
        err
      );
      this.setSeatStatus(seatState, "error", msg);
    }
  }

  private selectReadySeat(topic: string): SeatRuntime | null {
    const readySeats = this.seatOrder.filter(
      (s) => s.status === "ready" && s.session !== null && !s.closed
    );
    if (readySeats.length === 0) {
      return null;
    }

    const topicMatches = readySeats.filter((s) =>
      roleMatchesTopic(s.role, topic)
    );
    const pool = topicMatches.length > 0 ? topicMatches : readySeats;
    const poolSet = new Set(pool);

    const total = this.seatOrder.length;
    for (let offset = 0; offset < total; offset++) {
      const idx = (this.roundRobinCursor + offset) % total;
      const candidate = this.seatOrder[idx];
      if (poolSet.has(candidate)) {
        this.roundRobinCursor = (idx + 1) % total;
        return candidate;
      }
    }

    return pool[0] ?? null;
  }

  private handleServerMessage(
    seatState: SeatRuntime,
    msg: LiveServerMessage
  ): void {
    const functionCalls = msg.toolCall?.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (call.name === "challenge_founder") {
          void this.handleChallengeToolCall(seatState, call);
        }
      }
    }

    const serverContent = msg.serverContent;
    if (!serverContent) {
      return;
    }

    if (serverContent.interrupted) {
      this.stopSeatPlayback(seatState);
    }

    // Enqueue audio before emitting transcript so any transition into "speaking"
    // happens before the latest accumulated transcript is delivered to listeners.
    const parts = serverContent.modelTurn?.parts ?? [];
    for (const part of parts) {
      const mime = part.inlineData?.mimeType?.toLowerCase() ?? "";
      if (
        part.inlineData?.data &&
        (mime.startsWith("audio/pcm") || mime.startsWith("audio/l16"))
      ) {
        this.enqueuePcmAudio(
          seatState,
          part.inlineData.data,
          parseSampleRate(part.inlineData.mimeType)
        );
      }
    }

    const transcriptChunk = serverContent.outputTranscription?.text;
    if (transcriptChunk) {
      if (seatState.transcriptComplete) {
        seatState.turnTranscript = "";
        seatState.transcriptComplete = false;
      }
      seatState.turnTranscript += transcriptChunk;
      this.safeOnTwinTranscript(seatState.seat, seatState.turnTranscript);
    }

    if (serverContent.turnComplete) {
      seatState.transcriptComplete = true;
      if (seatState.pendingUtterances.length > 0) {
        seatState.pendingUtterances.shift();
      }
    }
  }

  private async handleChallengeToolCall(
    seatState: SeatRuntime,
    call: LiveFunctionCall
  ): Promise<void> {
    const nextPending = seatState.pendingUtterances.find((u) => !u.consumed);
    let utteranceId: string | null = null;
    if (nextPending) {
      utteranceId = nextPending.id;
      nextPending.consumed = true;
    }

    const rawChallenge = call.args?.challenge;
    const challengeText =
      typeof rawChallenge === "string" ? rawChallenge.trim() : "";

    let postedOk = false;
    if (!challengeText) {
      const msg = "Twin tool call missing challenge text";
      console.error(`[RoomTwinManager] Seat ${seatState.seat}: ${msg}`);
      if (!this.disconnected && !seatState.closed) {
        this.reportNonFatalSeatError(seatState, msg);
      }
    } else {
      try {
        const payload: RoomChallengeRequest = {
          seat: seatState.seat,
          text: challengeText,
          utterance_id: utteranceId,
        };
        await postRoomChallenge(this.opts.runId, payload);
        postedOk = true;
      } catch (err) {
        const msg = formatError(err, "Failed to post twin challenge");
        console.error(
          `[RoomTwinManager] Seat ${seatState.seat} postRoomChallenge failed:`,
          err
        );
        if (!this.disconnected && !seatState.closed) {
          this.reportNonFatalSeatError(seatState, msg);
        }
      }
    }

    if (this.disconnected || seatState.closed || !seatState.session) {
      return;
    }

    try {
      seatState.session.sendToolResponse({
        functionResponses: [
          {
            ...(call.id ? { id: call.id } : {}),
            name: call.name ?? "challenge_founder",
            response: postedOk ? { ok: true } : { ok: false },
          },
        ],
      });
    } catch (err) {
      const msg = formatError(err, "Failed to send tool response");
      console.error(
        `[RoomTwinManager] Seat ${seatState.seat} sendToolResponse failed:`,
        err
      );
      if (!this.disconnected && !seatState.closed) {
        this.reportNonFatalSeatError(seatState, msg);
      }
    }
  }

  private enqueuePcmAudio(
    seatState: SeatRuntime,
    base64Pcm: string,
    sampleRate: number
  ): void {
    const ctx = this.opts.audioContext;
    if (this.disconnected || ctx.state === "closed") {
      return;
    }

    let float32: Float32Array<ArrayBuffer>;
    try {
      float32 = pcmBase64ToFloat32(base64Pcm);
    } catch (err) {
      console.error(
        `[RoomTwinManager] Seat ${seatState.seat} failed to decode PCM audio:`,
        err
      );
      return;
    }

    if (float32.length === 0) {
      return;
    }

    try {
      const buffer = ctx.createBuffer(1, float32.length, sampleRate);
      buffer.copyToChannel(float32, 0);
      void this.enqueueAudioBuffer(seatState, buffer);
    } catch (err) {
      console.error(
        `[RoomTwinManager] Seat ${seatState.seat} failed to create audio buffer:`,
        err
      );
    }
  }

  private enqueueAudioBuffer(
    seatState: SeatRuntime | null,
    buffer: AudioBuffer
  ): Promise<void> {
    const ctx = this.opts.audioContext;
    if (this.disconnected || ctx.state === "closed") {
      return Promise.resolve();
    }

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    this.clearGlobalDrainTimer();
    if (seatState) {
      this.clearSeatDrainTimer(seatState);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + SCHEDULE_LEAD_TIME_S, this.nextPlayTime);
    this.nextPlayTime = startAt + buffer.duration;

    if (!this.twinSpeaking) {
      this.twinSpeaking = true;
      this.safeOnTwinSpeaking(true);
    }

    if (seatState) {
      seatState.activeAudioCount += 1;
      const startDelayMs = Math.max(0, Math.round((startAt - now) * 1000));
      if (startDelayMs <= IMMEDIATE_SPEAK_THRESHOLD_MS) {
        this.markSeatSpeaking(seatState);
      } else {
        const timer = setTimeout(() => {
          seatState.pendingSpeakTimers.delete(timer);
          if (
            this.disconnected ||
            seatState.closed ||
            seatState.activeAudioCount <= 0
          ) {
            return;
          }
          this.markSeatSpeaking(seatState);
        }, startDelayMs);
        seatState.pendingSpeakTimers.add(timer);
      }
    }

    return new Promise<void>((resolve) => {
      const item: ActivePlaybackItem = {
        source,
        seat: seatState ? seatState.seat : null,
        resolve,
      };
      this.activeItems.add(item);

      source.onended = () => {
        try {
          if (!this.activeItems.delete(item)) {
            return;
          }
          resolve();

          if (this.disconnected) {
            return;
          }

          if (seatState) {
            seatState.activeAudioCount = Math.max(
              0,
              seatState.activeAudioCount - 1
            );
            if (seatState.activeAudioCount === 0) {
              this.scheduleSeatDrain(seatState);
            }
          }

          if (this.activeItems.size === 0) {
            this.scheduleGlobalDrain();
          }
        } catch {
          // Never throw out of WebAudio callbacks.
        }
      };

      try {
        source.start(startAt);
      } catch (err) {
        this.activeItems.delete(item);
        if (seatState) {
          seatState.activeAudioCount = Math.max(
            0,
            seatState.activeAudioCount - 1
          );
          if (seatState.activeAudioCount === 0) {
            this.scheduleSeatDrain(seatState);
          }
        }
        if (this.activeItems.size === 0) {
          this.scheduleGlobalDrain();
        }
        console.error("[RoomTwinManager] Failed to start audio buffer:", err);
        resolve();
      }
    });
  }

  private markSeatSpeaking(seatState: SeatRuntime): void {
    if (seatState.closed || seatState.status === "speaking") {
      return;
    }
    this.setSeatStatus(seatState, "speaking");
    // Re-emit any transcript already accumulated for this turn in case a listener
    // clears its per-seat live transcript upon entering the "speaking" state.
    if (seatState.turnTranscript) {
      this.safeOnTwinTranscript(seatState.seat, seatState.turnTranscript);
    }
  }

  private scheduleSeatDrain(seatState: SeatRuntime): void {
    this.clearSeatDrainTimer(seatState);
    seatState.speakingDrainTimer = setTimeout(() => {
      try {
        seatState.speakingDrainTimer = null;
        if (
          this.disconnected ||
          seatState.closed ||
          seatState.activeAudioCount > 0
        ) {
          return;
        }
        if (seatState.status === "speaking") {
          this.setSeatStatus(
            seatState,
            seatState.session ? "ready" : "closed"
          );
        }
      } catch {
        // Never throw out of timer callbacks.
      }
    }, QUEUE_DRAIN_GRACE_MS);
  }

  private scheduleGlobalDrain(): void {
    this.clearGlobalDrainTimer();
    this.globalDrainTimer = setTimeout(() => {
      try {
        this.globalDrainTimer = null;
        if (this.disconnected || this.activeItems.size > 0) {
          return;
        }
        if (this.twinSpeaking) {
          this.twinSpeaking = false;
          this.safeOnTwinSpeaking(false);
        }
      } catch {
        // Never throw out of timer callbacks.
      }
    }, QUEUE_DRAIN_GRACE_MS);
  }

  private stopSeatPlayback(seatState: SeatRuntime): void {
    for (const item of Array.from(this.activeItems)) {
      if (item.seat !== seatState.seat) continue;
      this.activeItems.delete(item);
      item.source.onended = null;
      try {
        item.source.stop();
      } catch {
        // Already stopped.
      }
      try {
        item.source.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
      item.resolve();
    }

    seatState.activeAudioCount = 0;
    this.clearSeatDrainTimer(seatState);
    this.clearSeatPendingSpeakTimers(seatState);
    if (!seatState.closed && seatState.status === "speaking") {
      this.setSeatStatus(seatState, seatState.session ? "ready" : "closed");
    }

    if (this.activeItems.size === 0) {
      if (this.opts.audioContext.state !== "closed") {
        this.nextPlayTime = this.opts.audioContext.currentTime;
      }
      this.clearGlobalDrainTimer();
      if (this.twinSpeaking) {
        this.twinSpeaking = false;
        this.safeOnTwinSpeaking(false);
      }
    }
  }

  private stopAllPlayback(): void {
    this.clearGlobalDrainTimer();

    for (const seatState of this.seatOrder) {
      this.clearSeatDrainTimer(seatState);
      this.clearSeatPendingSpeakTimers(seatState);
      seatState.activeAudioCount = 0;
    }

    for (const item of Array.from(this.activeItems)) {
      this.activeItems.delete(item);
      item.source.onended = null;
      try {
        item.source.stop();
      } catch {
        // Already stopped.
      }
      try {
        item.source.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
      item.resolve();
    }

    if (this.opts.audioContext.state !== "closed") {
      this.nextPlayTime = this.opts.audioContext.currentTime;
    }

    if (this.twinSpeaking) {
      this.twinSpeaking = false;
      this.safeOnTwinSpeaking(false);
    }
  }

  private clearSeatDrainTimer(seatState: SeatRuntime): void {
    if (seatState.speakingDrainTimer !== null) {
      clearTimeout(seatState.speakingDrainTimer);
      seatState.speakingDrainTimer = null;
    }
  }

  private clearSeatPendingSpeakTimers(seatState: SeatRuntime): void {
    for (const timer of seatState.pendingSpeakTimers) {
      clearTimeout(timer);
    }
    seatState.pendingSpeakTimers.clear();
  }

  private clearGlobalDrainTimer(): void {
    if (this.globalDrainTimer !== null) {
      clearTimeout(this.globalDrainTimer);
      this.globalDrainTimer = null;
    }
  }

  private isStale(seatState: SeatRuntime, generation: number): boolean {
    return (
      this.disconnected ||
      seatState.closed ||
      generation !== this.connectGeneration
    );
  }

  private setSeatStatus(
    seatState: SeatRuntime,
    status: TwinStatus,
    detail?: string
  ): void {
    seatState.status = status;
    try {
      this.opts.onSeatStatus(seatState.seat, status, detail);
    } catch {
      // Never throw out of caller callbacks.
    }
  }

  /**
   * Surfaces a non-fatal tool/HTTP error to the UI without breaking or
   * sidelining an otherwise open Live session.
   */
  private reportNonFatalSeatError(seatState: SeatRuntime, detail: string): void {
    try {
      this.opts.onSeatStatus(seatState.seat, "error", detail);
    } catch {
      // Never throw out of caller callbacks.
    }
  }

  private safeOnTwinSpeaking(speaking: boolean): void {
    try {
      this.opts.onTwinSpeaking(speaking);
    } catch {
      // Never throw out of caller callbacks.
    }
  }

  private safeOnTwinTranscript(seat: number, text: string): void {
    try {
      this.opts.onTwinTranscript(seat, text);
    } catch {
      // Never throw out of caller callbacks.
    }
  }
}
