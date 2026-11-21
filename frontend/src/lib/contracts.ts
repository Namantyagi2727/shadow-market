export type Stage =
  | "pitch"
  | "boardroom"
  | "build"
  | "lab"
  | "swarm"
  | "verdict"
  | "iterate"
  | "room"
  | "reality";

export const STAGES: { id: Stage; label: string; shortLabel: string; step: number }[] = [
  { id: "pitch", label: "Pitch", shortLabel: "Pitch", step: 1 },
  { id: "boardroom", label: "Boardroom", shortLabel: "Boardroom", step: 2 },
  { id: "build", label: "Build MVP", shortLabel: "Build", step: 3 },
  { id: "lab", label: "Usability Lab", shortLabel: "Lab", step: 4 },
  { id: "swarm", label: "Market Swarm", shortLabel: "Swarm", step: 5 },
  { id: "verdict", label: "Verdict", shortLabel: "Verdict", step: 6 },
  { id: "iterate", label: "V2 Iterate", shortLabel: "V2", step: 7 },
  { id: "room", label: "Q&A Room", shortLabel: "Room", step: 8 },
  { id: "reality", label: "Reality Check", shortLabel: "Reality", step: 9 },
];

export interface EventEnvelope<TType extends string, TData> {
  type: TType;
  seq: number;
  ts: string;
  stage: Stage;
  data: TData;
}

export interface StageChangedData {
  stage: Stage;
}

export interface PitchParsedData {
  title: string;
  one_liner: string;
  target_user: string;
  price_usd: number | null;
  features: string[];
  sketch_notes: string;
}

export interface BoardroomTurnData {
  speaker: "strategist" | "skeptic";
  model: string;
  text: string;
  audio_url: string | null;
}

export interface SpecReadyData {
  headline: string;
  price_usd: number | null;
  pages: string[];
  risks: string[];
}

export interface BuildProgressData {
  message: string;
}

export interface MvpReadyData {
  url: string;
  screenshot_url: string;
  hero_image_url: string | null;
}

export interface CompetitorItem {
  title: string;
  price_usd: number | null;
  image_url: string | null;
  url: string | null;
}

export interface CompetitorsData {
  items: CompetitorItem[];
}

export interface PersonaStartedData {
  persona_id: string;
  name: string;
  role: string;
  device: string;
}

export type PersonaActionKind = "click" | "type" | "scroll" | "wait" | "quit";

export interface PersonaActionData {
  persona_id: string;
  t: number;
  action: PersonaActionKind;
  target: string;
  thought: string;
}

export interface PersonaFinishedData {
  persona_id: string;
  outcome: "converted" | "quit";
  quit_reason: string | null;
  video_url: string;
  duration_s: number;
}

export interface QuitMarker {
  t: number;
  kind: "confusion" | "quit";
  note: string;
}

export interface QuitMarkersData {
  persona_id: string;
  markers: QuitMarker[];
}

export interface SwarmProgressData {
  done: number;
  total: number;
}

export interface SwarmResultData {
  personas: number;
  rubrics: Record<string, number>;
  intent_mean: number;
}

export interface VerdictData {
  launch_probability: number;
  confidence: number;
  failure_modes: string[];
  summary: string;
  analyst_reason?: string;
  market_intent?: number;
  probability_source?: "analyst";
}

export interface V2Fix {
  issue: string;
  change: string;
  evidence: string;
}

export interface V2PlanData {
  fixes: V2Fix[];
  founder_todo: string[];
}

export interface V2BuildProgressData {
  message: string;
}

export interface V2ReadyData {
  url: string;
  screenshot_url: string;
  v1_screenshot_url: string;
  reused_sandbox: boolean;
}

export type V2Version = "v1" | "v2";

export interface V2PanelFinishedData {
  persona_id: string;
  name: string;
  version: V2Version;
  outcome: "converted" | "quit";
  quit_reason: string | null;
  video_url: string;
}

export interface V2HoldoutResult {
  n: number;
  v1_converted: number;
  v2_converted: number;
}

export interface V2ResultData {
  holdout: V2HoldoutResult;
  rubrics_v1: Record<string, number>;
  rubrics_v2: Record<string, number>;
  summary: string;
}

export interface RoomCaptionData {
  text: string;
}

export interface RoomUtteranceData {
  utterance_id: string;
  speaker: string;
  speaker_label: string;
  text: string;
  t: number;
}

export type RoomGateTopic =
  | "market"
  | "price"
  | "competitors"
  | "tech"
  | "traction"
  | "other";

export interface RoomGateData {
  utterance_id: string;
  is_challenge: number;
  topic: RoomGateTopic;
  triggered: boolean;
  latency_ms: number;
}

export type TwinChallengeSource = "live" | "server";

export interface TwinChallengeData {
  challenge_id: string;
  utterance_id: string | null;
  seat: number;
  role: string;
  text: string;
  audio_url: string | null;
  source: TwinChallengeSource;
}

export type FounderBriefBadge = "VERIFIED" | "PARTIAL" | "PUSH_BACK";

export type FounderBriefProofSource =
  | "swarm"
  | "lab"
  | "analyst"
  | "competitors"
  | "boardroom";

export interface FounderBriefProof {
  label: string;
  value: string;
  source: FounderBriefProofSource;
}

export interface FounderBriefData {
  challenge_id: string;
  badge: FounderBriefBadge;
  badge_confidence: number;
  line: string;
  proof: FounderBriefProof[];
  latency_ms: number;
}

export interface VoteTallyData {
  buy: number;
  bounce: number;
  ai_probability: number;
}

export interface ErrorEventData {
  message: string;
  recoverable: boolean;
}

export type KnownRunEvent =
  | EventEnvelope<"stage_changed", StageChangedData>
  | EventEnvelope<"pitch_parsed", PitchParsedData>
  | EventEnvelope<"boardroom_turn", BoardroomTurnData>
  | EventEnvelope<"spec_ready", SpecReadyData>
  | EventEnvelope<"build_progress", BuildProgressData>
  | EventEnvelope<"mvp_ready", MvpReadyData>
  | EventEnvelope<"competitors", CompetitorsData>
  | EventEnvelope<"persona_started", PersonaStartedData>
  | EventEnvelope<"persona_action", PersonaActionData>
  | EventEnvelope<"persona_finished", PersonaFinishedData>
  | EventEnvelope<"quit_markers", QuitMarkersData>
  | EventEnvelope<"swarm_progress", SwarmProgressData>
  | EventEnvelope<"swarm_result", SwarmResultData>
  | EventEnvelope<"verdict", VerdictData>
  | EventEnvelope<"v2_plan", V2PlanData>
  | EventEnvelope<"v2_build_progress", V2BuildProgressData>
  | EventEnvelope<"v2_ready", V2ReadyData>
  | EventEnvelope<"v2_panel_finished", V2PanelFinishedData>
  | EventEnvelope<"v2_result", V2ResultData>
  | EventEnvelope<"room_caption", RoomCaptionData>
  | EventEnvelope<"room_utterance", RoomUtteranceData>
  | EventEnvelope<"room_gate", RoomGateData>
  | EventEnvelope<"twin_challenge", TwinChallengeData>
  | EventEnvelope<"founder_brief", FounderBriefData>
  | EventEnvelope<"vote_tally", VoteTallyData>
  | EventEnvelope<"error", ErrorEventData>;

export interface UnknownRunEvent {
  type: string;
  seq: number;
  ts: string;
  stage?: Stage | string;
  data?: Record<string, unknown>;
}

export type RunEvent = KnownRunEvent | UnknownRunEvent;

export interface CreateRunResponse {
  run_id: string;
}

export interface RunEventsResponse {
  events: RunEvent[];
}

export interface HotseatResponse {
  ephemeral_token: string;
  model: string;
  system_instruction: string;
}

export interface VoteRequest {
  choice: "buy" | "bounce";
  reason?: string;
}

export interface VoteResponse {
  ok: boolean;
}

export interface RoomSeatConfig {
  seat: number;
  role: string;
}

export interface RoomSeatsRequest {
  seats: RoomSeatConfig[];
}

export interface RoomSeatsResponse {
  ok: boolean;
}

export interface RoomTwinTokenRequest {
  seat: number;
}

export interface RoomTwinTokenResponse {
  ephemeral_token: string;
  model: string;
  system_instruction: string;
}

export interface RoomChallengeRequest {
  seat: number;
  text: string;
  utterance_id: string | null;
}

export interface RoomChallengeResponse {
  ok: boolean;
}

export interface RoomAskRequest {
  text: string;
  seat: number;
}

export interface RoomAskResponse {
  ok: boolean;
}

export interface DemoRunSummary {
  run_id: string;
  title: string;
}

export interface DemoRunsResponse {
  runs: DemoRunSummary[];
}

export function isValidStage(value: unknown): value is Stage {
  return (
    value === "pitch" ||
    value === "boardroom" ||
    value === "build" ||
    value === "lab" ||
    value === "swarm" ||
    value === "verdict" ||
    value === "iterate" ||
    value === "room" ||
    value === "reality"
  );
}

export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  // No fixed address: use the host this page was opened from, so the laptop (localhost)
  // and other devices (http://<laptop-ip>:3000) all reach the backend on port 8000 without restarts.
  if (typeof window !== "undefined" && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}

export function resolveArtifactUrl(runId: string | null, urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  if (/^https?:\/\//i.test(urlOrPath) || urlOrPath.startsWith("data:") || urlOrPath.startsWith("blob:")) {
    return urlOrPath;
  }
  const base = getApiBase();
  if (urlOrPath.startsWith("/")) {
    return `${base}${urlOrPath}`;
  }
  if (runId) {
    return `${base}/api/runs/${encodeURIComponent(runId)}/artifacts/${urlOrPath}`;
  }
  return `${base}/${urlOrPath}`;
}
