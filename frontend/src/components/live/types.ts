export type LiveStageId =
  | "pitch"
  | "boardroom"
  | "build"
  | "lab"
  | "swarm"
  | "verdict"
  | "iterate"
  | "room";

export type StageStatus = "pending" | "active" | "done";

export interface LiveStageDefinition {
  id: LiveStageId;
  label: string;
}

export const LIVE_STAGES: readonly LiveStageDefinition[] = [
  { id: "pitch", label: "Pitch" },
  { id: "boardroom", label: "Boardroom" },
  { id: "build", label: "Build" },
  { id: "lab", label: "Usability lab" },
  { id: "swarm", label: "Market" },
  { id: "verdict", label: "Verdict" },
  { id: "iterate", label: "Fix & prove (V2)" },
  { id: "room", label: "Q&A room" },
] as const;

export const LIVE_STAGE_INDEX: Record<LiveStageId, number> = {
  pitch: 0,
  boardroom: 1,
  build: 2,
  lab: 3,
  swarm: 4,
  verdict: 5,
  iterate: 6,
  room: 7,
};

export interface StageTimelineInfo {
  id: LiveStageId;
  label: string;
  status: StageStatus;
  statusLine: string;
  durationLabel: string;
}

export interface V2Fix {
  issue: string;
  change: string;
  evidence: string;
}

export interface V2PlanData {
  fixes: V2Fix[];
  founderTodo: string[];
}

export interface V2BuildMessage {
  seq: number;
  ts: string;
  message: string;
}

export interface V2ReadyData {
  url: string;
  screenshot_url: string;
  v1_screenshot_url: string;
  reused_sandbox: boolean;
}

export interface V2PanelEntry {
  persona_id: string;
  name: string;
  version: "v1" | "v2";
  outcome: "converted" | "quit";
  quit_reason: string | null;
  video_url: string;
}

export interface V2ResultData {
  holdout: {
    n: number;
    v1_converted: number;
    v2_converted: number;
  };
  rubrics_v1: Record<string, number>;
  rubrics_v2: Record<string, number>;
  summary: string;
}

export interface V2State {
  started: boolean;
  startedTs: string | null;
  completedTs: string | null;
  plan: V2PlanData | null;
  buildMessages: V2BuildMessage[];
  ready: V2ReadyData | null;
  panel: V2PanelEntry[];
  result: V2ResultData | null;
}

export interface ModelLegendItem {
  model: string;
  role: string;
}

export const MODEL_LEGEND: readonly ModelLegendItem[] = [
  { model: "Hydrogen", role: "Pitch, lab driver, Q&A briefs" },
  { model: "Neon / Argon", role: "Boardroom & analyst" },
  { model: "Carbon", role: "Verdict & V2 fix plan" },
  { model: "Decision-1", role: "200-buyer swarm & gate" },
  { model: "Antigravity", role: "Sandbox MVP & V2 patch" },
  { model: "Live", role: "Hot-seat & judge twins" },
] as const;

export const RUBRIC_LABELS: Record<string, string> = {
  value_clarity: "Value clarity",
  pain_urgency: "Pain urgency",
  price_value_fit: "Price-value fit",
  credibility_trust: "Credibility & trust",
  beat_competitors: "Beat competitors",
};

export function formatRubricLabel(key: string): string {
  if (RUBRIC_LABELS[key]) return RUBRIC_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatShortModel(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("neon")) return "Neon";
  if (lower.includes("argon")) return "Argon";
  if (lower.includes("hydrogen")) return "Hydrogen";
  if (lower.includes("carbon")) return "Carbon";
  if (lower.includes("decision")) return "Decision-1";
  if (lower.includes("antigravity")) return "Antigravity";
  if (lower.includes("live")) return "Live";
  return model || "Gemini";
}

export function formatDurationCompact(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = ms / 1000;
  if (totalSeconds < 10) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const rounded = Math.round(totalSeconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatPrice(price: number | null | undefined): string {
  if (typeof price !== "number" || !Number.isFinite(price)) return "—";
  return Number.isInteger(price) ? `$${price}` : `$${price.toFixed(2)}`;
}

export function truncateWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  const slice = words.slice(0, maxWords).join(" ").replace(/[,;:\-]+$/, "");
  return `${slice}…`;
}

export function isLiveStageId(value: unknown): value is LiveStageId {
  return (
    value === "pitch" ||
    value === "boardroom" ||
    value === "build" ||
    value === "lab" ||
    value === "swarm" ||
    value === "verdict" ||
    value === "iterate" ||
    value === "room"
  );
}
