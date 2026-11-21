import type { SessionEvent } from "@/components/session/useSessionEvents";
import type { FounderBriefBadge, FounderBriefProof } from "@/lib/contracts";

export type SessionRole = "founder" | "judge";

export interface RoomCaptionPayload {
  text: string;
  role?: SessionRole;
}

export interface RoomUtterancePayload {
  utterance_id: string;
  speaker: string;
  speaker_label?: string;
  text: string;
  t: number;
}

export interface PitchUpdatePayload {
  transcript: string;
  words: number;
}

export type ResearchStep =
  | "pitch"
  | "competitors"
  | "web"
  | "analyst"
  | "buyers"
  | "questions"
  | "prep";

export type ResearchStepState = "running" | "done" | "failed";

export interface ResearchStatusPayload {
  step: string;
  state: ResearchStepState;
  message: string;
}

export interface PitchResearchPitch {
  title?: string;
  one_liner?: string;
  target_user?: string;
  price_usd?: number | null;
  location?: string | null;
  claims?: string[];
}

export interface PitchResearchCompetitor {
  title: string;
  price_usd: number | null;
  url: string | null;
}

export interface PitchResearchWebFact {
  fact: string;
  url: string | null;
}

export interface PitchResearchAnalyst {
  probability: number;
  reason?: string;
  framing?: string;
}

export interface PitchResearchBuyers {
  n: number;
  rubrics: Record<string, number>;
  intent_mean: number;
  weakest: string;
}

export interface PitchResearchPayload {
  pitch?: PitchResearchPitch | null;
  competitors?: PitchResearchCompetitor[] | null;
  web?: PitchResearchWebFact[] | null;
  analyst?: PitchResearchAnalyst | null;
  buyers?: PitchResearchBuyers | null;
  latency_ms?: number;
}

export interface FounderPrepAnswer {
  question_id: string;
  question: string;
  line: string;
  points: string[];
  evidence?: string;
}

export interface FounderPrepPayload {
  answers: FounderPrepAnswer[];
}

export interface SessionFounderBriefPayload {
  challenge_id: string;
  utterance_id?: string | null;
  question?: string | null;
  badge: FounderBriefBadge;
  badge_confidence: number;
  line: string;
  /** Full spoken paragraph (60-90 words) to read out loud. */
  answer?: string;
  proof: FounderBriefProof[];
  latency_ms: number;
  matched_question_id?: string | null;
}

const RUBRIC_LABELS: Record<string, string> = {
  value_clarity: "Value clarity",
  pain_urgency: "Pain urgency",
  price_value_fit: "Price-value fit",
  credibility_trust: "Credibility & trust",
  beat_competitors: "Beats competitors",
};

const RESEARCH_STEP_LABELS: Record<string, string> = {
  pitch: "Pitch claims",
  competitors: "Competitors",
  web: "Web search",
  analyst: "Launch analyst",
  buyers: "200-buyer panel",
  questions: "Judge questions",
  prep: "Prepared answers",
};

export function formatResearchStep(step: string): string {
  return (
    RESEARCH_STEP_LABELS[step] ??
    step
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function formatRubricLabel(key: string): string {
  return (
    RUBRIC_LABELS[key] ??
    key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function formatPrice(price: number | null | undefined): string {
  if (typeof price !== "number" || !Number.isFinite(price)) return "—";
  return Number.isInteger(price) ? `$${price}` : `$${price.toFixed(2)}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export function getBadgeConfig(badge: string): {
  label: string;
  className: string;
} {
  switch (badge) {
    case "VERIFIED":
      return {
        label: "VERIFIED",
        className: "border-[#81C995]/40 bg-[#81C995]/12 text-[#81C995]",
      };
    case "PUSH_BACK":
      return {
        label: "PUSH BACK",
        className: "border-[#F28B82]/40 bg-[#F28B82]/12 text-[#F28B82]",
      };
    case "PARTIAL":
    default:
      return {
        label: "PARTIAL",
        className: "border-[#FDD663]/40 bg-[#FDD663]/12 text-[#FDD663]",
      };
  }
}

export function mergePitchResearch(
  researchEvents: SessionEvent[]
): PitchResearchPayload | null {
  if (researchEvents.length === 0) return null;

  const merged: PitchResearchPayload = {};
  for (const evt of researchEvents) {
    const data = evt.data as Partial<PitchResearchPayload> | null | undefined;
    if (!data || typeof data !== "object") continue;

    if (data.pitch && typeof data.pitch === "object") {
      merged.pitch = data.pitch;
    }
    if (Array.isArray(data.competitors) && data.competitors.length > 0) {
      merged.competitors = data.competitors;
    } else if (data.competitors !== undefined && merged.competitors === undefined) {
      merged.competitors = data.competitors;
    }
    if (Array.isArray(data.web) && data.web.length > 0) {
      merged.web = data.web;
    } else if (data.web !== undefined && merged.web === undefined) {
      merged.web = data.web;
    }
    if (data.analyst && typeof data.analyst === "object") {
      merged.analyst = data.analyst;
    }
    if (data.buyers && typeof data.buyers === "object") {
      merged.buyers = data.buyers;
    }
    if (typeof data.latency_ms === "number") {
      merged.latency_ms = data.latency_ms;
    }
  }

  return merged;
}

export function findMatchingJudgeQuestion(
  briefEvent: SessionEvent | null,
  utteranceEvents: SessionEvent[]
): string | null {
  if (!briefEvent) return null;
  const brief = briefEvent.data as SessionFounderBriefPayload | null | undefined;
  if (!brief) return null;

  const targetIds = new Set<string>();
  if (brief.utterance_id) targetIds.add(brief.utterance_id);
  if (brief.challenge_id) targetIds.add(brief.challenge_id);

  if (targetIds.size > 0) {
    for (let i = utteranceEvents.length - 1; i >= 0; i--) {
      const u = utteranceEvents[i].data as RoomUtterancePayload | null | undefined;
      if (u && u.utterance_id && targetIds.has(u.utterance_id) && u.text) {
        return u.text;
      }
    }
  }

  if (typeof brief.question === "string" && brief.question.trim()) {
    return brief.question.trim();
  }

  for (let i = utteranceEvents.length - 1; i >= 0; i--) {
    const evt = utteranceEvents[i];
    if (evt.seq >= briefEvent.seq) continue;
    const u = evt.data as RoomUtterancePayload | null | undefined;
    if (u && u.speaker === "judge" && typeof u.text === "string" && u.text.trim()) {
      return u.text.trim();
    }
  }

  return null;
}

export function getLatestResearchStatuses(
  statusEvents: SessionEvent[]
): Record<string, ResearchStatusPayload> {
  const map: Record<string, ResearchStatusPayload> = {};
  for (const evt of statusEvents) {
    const data = evt.data as ResearchStatusPayload | null | undefined;
    if (data && typeof data.step === "string" && data.step) {
      map[data.step] = data;
    }
  }
  return map;
}
