import type { SessionEvent } from "@/components/session/useSessionEvents";

export type SessionRole = "founder" | "judge";

export type ResearchStepId =
  | "pitch"
  | "competitors"
  | "web"
  | "analyst"
  | "buyers"
  | "questions";

export type ResearchStepState = "pending" | "running" | "done" | "failed";

export interface ResearchStepInfo {
  id: ResearchStepId;
  label: string;
  state: ResearchStepState;
  message: string;
}

export const RESEARCH_STEPS: readonly { id: ResearchStepId; label: string }[] = [
  { id: "pitch", label: "Pitch" },
  { id: "competitors", label: "Competitors" },
  { id: "web", label: "Web" },
  { id: "analyst", label: "Analyst" },
  { id: "buyers", label: "Buyers" },
  { id: "questions", label: "Questions" },
] as const;

export interface TranscriptUtterance {
  id: string;
  seq: number;
  speaker: string;
  speakerLabel: string;
  text: string;
  t?: number;
}

export interface InterimCaption {
  role: SessionRole | "other";
  text: string;
}

export interface PitchCompetitor {
  title: string;
  price_usd: number | null;
  url: string | null;
}

export interface PitchWebFact {
  fact: string;
  url: string | null;
}

export interface PitchAnalystFinding {
  probability: number;
  reason: string;
  framing: string;
}

export interface PitchBuyersFinding {
  n: number;
  rubrics: Record<string, number>;
  intent_mean: number;
  weakest: string;
}

export interface PitchSummary {
  title?: string;
  one_liner?: string;
  target_user?: string;
  price_usd?: number | null;
  location?: string | null;
  claims?: string[];
}

export interface PitchResearchData {
  pitch: PitchSummary | null;
  competitors: PitchCompetitor[];
  web: PitchWebFact[];
  analyst: PitchAnalystFinding | null;
  buyers: PitchBuyersFinding | null;
  latency_ms: number | null;
}

export type QuestionSource =
  | "competitors"
  | "web"
  | "buyers"
  | "analyst"
  | "pitch"
  | string;

export interface JudgeQuestion {
  id: string;
  question: string;
  why: string;
  evidence: string;
  source: QuestionSource;
}

const RUBRIC_LABELS: Record<string, string> = {
  value_clarity: "Value clarity",
  pain_urgency: "Pain urgency",
  price_value_fit: "Price-value fit",
  credibility_trust: "Credibility & trust",
  beat_competitors: "Beat competitors",
};

const SOURCE_LABELS: Record<string, string> = {
  competitors: "Competitors",
  web: "Web",
  buyers: "Buyers",
  analyst: "Analyst",
  pitch: "Pitch",
};

export function formatSpeakerTag(speaker: string, speakerLabel?: string): string {
  const normalized = speaker.trim().toLowerCase();
  if (normalized === "founder") return "Founder";
  if (normalized === "judge") return "Judge";
  if (speakerLabel && speakerLabel.trim()) return speakerLabel.trim();
  if (normalized) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return "Room";
}

export function formatRubricLabel(key: string): string {
  if (!key) return "—";
  if (RUBRIC_LABELS[key]) return RUBRIC_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatSourceLabel(source: string): string {
  const key = source.trim().toLowerCase();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (!key) return "Research";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function formatPrice(price: number | null | undefined): string {
  if (typeof price !== "number" || !Number.isFinite(price)) return "—";
  return Number.isInteger(price) ? `$${price}` : `$${price.toFixed(2)}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const pct = value <= 1 && value >= 0 ? Math.round(value * 100) : Math.round(value);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    return parsed.hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

export function formatAnalystFraming(
  framing: string | null | undefined,
  reason?: string | null
): string {
  const raw = (framing || "").trim();
  if (!raw) {
    return (reason || "").trim();
  }

  // Handle multiline Kickstarter campaign_text from analyst._campaign_text cleanly
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    const categoryLine = lines.find((l) => /^category:/i.test(l));
    const goalLine = lines.find((l) => /^funding goal:/i.test(l));
    if (categoryLine || goalLine) {
      const parts: string[] = [];
      if (categoryLine) {
        const cleaned = categoryLine
          .replace(/^category:\s*/i, "")
          .replace(/\s*\(top-level:[^)]*\)/i, "")
          .trim();
        if (cleaned) parts.push(cleaned);
      }
      if (goalLine) {
        const cleaned = goalLine.replace(/^funding goal:\s*/i, "").trim();
        if (cleaned) parts.push(`${cleaned} goal`);
      }
      if (parts.length > 0) {
        return parts.join(" · ");
      }
    }
    return lines.join(" · ");
  }

  return raw;
}

export function extractTranscript(events: SessionEvent[]): {
  utterances: TranscriptUtterance[];
  interimCaptions: InterimCaption[];
} {
  const utterances: TranscriptUtterance[] = [];
  const seenUtteranceIds = new Set<string>();
  const interimByRole: Partial<Record<SessionRole | "other", string>> = {};

  for (const evt of events) {
    if (evt.type === "room_caption") {
      const data = evt.data as { text?: unknown; role?: unknown } | null;
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      const rawRole = typeof data?.role === "string" ? data.role.toLowerCase() : "";
      const role: SessionRole | "other" =
        rawRole === "founder" || rawRole === "judge" ? rawRole : "other";
      if (text) {
        interimByRole[role] = text;
      } else {
        delete interimByRole[role];
      }
    } else if (evt.type === "room_utterance") {
      const data = evt.data as {
        utterance_id?: unknown;
        speaker?: unknown;
        speaker_label?: unknown;
        text?: unknown;
        t?: unknown;
      } | null;
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (!text) continue;

      const utteranceId =
        typeof data?.utterance_id === "string" && data.utterance_id.trim()
          ? data.utterance_id
          : `utt_${evt.seq}`;
      if (seenUtteranceIds.has(utteranceId)) continue;
      seenUtteranceIds.add(utteranceId);

      const speaker =
        typeof data?.speaker === "string" ? data.speaker : "room";
      const speakerLabel =
        typeof data?.speaker_label === "string" ? data.speaker_label : "";

      utterances.push({
        id: utteranceId,
        seq: evt.seq,
        speaker,
        speakerLabel,
        text,
        t: typeof data?.t === "number" ? data.t : undefined,
      });

      const normalizedSpeaker = speaker.trim().toLowerCase();
      if (normalizedSpeaker === "founder" || normalizedSpeaker === "judge") {
        delete interimByRole[normalizedSpeaker];
      }
      delete interimByRole.other;
    }
  }

  const interimCaptions: InterimCaption[] = [];
  const roleOrder: Array<SessionRole | "other"> = ["founder", "judge", "other"];
  for (const role of roleOrder) {
    const text = interimByRole[role];
    if (text) {
      interimCaptions.push({ role, text });
    }
  }

  return { utterances, interimCaptions };
}

export function extractResearchSteps(
  events: SessionEvent[],
  hasQuestions: boolean
): ResearchStepInfo[] {
  const latestByStep = new Map<
    ResearchStepId,
    { state: ResearchStepState; message: string }
  >();

  for (const evt of events) {
    if (evt.type !== "research_status") continue;
    const data = evt.data as {
      step?: unknown;
      state?: unknown;
      message?: unknown;
    } | null;
    if (!data || typeof data.step !== "string") continue;

    const stepId = data.step as ResearchStepId;
    if (!RESEARCH_STEPS.some((s) => s.id === stepId)) continue;

    const rawState = typeof data.state === "string" ? data.state : "pending";
    const state: ResearchStepState =
      rawState === "running" || rawState === "done" || rawState === "failed"
        ? rawState
        : "pending";
    const message = typeof data.message === "string" ? data.message.trim() : "";

    latestByStep.set(stepId, { state, message });
  }

  return RESEARCH_STEPS.map((step) => {
    const current = latestByStep.get(step.id);
    if (current) {
      if (step.id === "questions" && hasQuestions && current.state === "running") {
        return {
          id: step.id,
          label: step.label,
          state: "done",
          message: current.message || "Ready",
        };
      }
      return {
        id: step.id,
        label: step.label,
        state: current.state,
        message: current.message,
      };
    }

    if (step.id === "questions" && hasQuestions) {
      return {
        id: step.id,
        label: step.label,
        state: "done",
        message: "Ready",
      };
    }

    return {
      id: step.id,
      label: step.label,
      state: "pending",
      message: "",
    };
  });
}

export function extractPitchResearch(
  events: SessionEvent[]
): PitchResearchData | null {
  let found = false;
  const merged: PitchResearchData = {
    pitch: null,
    competitors: [],
    web: [],
    analyst: null,
    buyers: null,
    latency_ms: null,
  };

  for (const evt of events) {
    if (evt.type !== "pitch_research") continue;
    const data = evt.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object") continue;
    found = true;

    if (data.pitch && typeof data.pitch === "object") {
      merged.pitch = data.pitch as PitchSummary;
    }

    if (Array.isArray(data.competitors) && data.competitors.length > 0) {
      merged.competitors = data.competitors
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          title: typeof item.title === "string" ? item.title : "",
          price_usd:
            typeof item.price_usd === "number" && Number.isFinite(item.price_usd)
              ? item.price_usd
              : null,
          url: typeof item.url === "string" ? item.url : null,
        }))
        .filter((item) => item.title.trim().length > 0);
    }

    if (Array.isArray(data.web) && data.web.length > 0) {
      merged.web = data.web
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          fact: typeof item.fact === "string" ? item.fact.trim() : "",
          url: typeof item.url === "string" ? item.url : null,
        }))
        .filter((item) => item.fact.length > 0);
    }

    if (data.analyst && typeof data.analyst === "object") {
      const a = data.analyst as Record<string, unknown>;
      if (typeof a.probability === "number" && Number.isFinite(a.probability)) {
        merged.analyst = {
          probability: a.probability,
          reason: typeof a.reason === "string" ? a.reason : "",
          framing: typeof a.framing === "string" ? a.framing : "",
        };
      }
    }

    if (data.buyers && typeof data.buyers === "object") {
      const b = data.buyers as Record<string, unknown>;
      const rawRubrics =
        b.rubrics && typeof b.rubrics === "object"
          ? (b.rubrics as Record<string, unknown>)
          : {};
      const rubrics: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawRubrics)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          rubrics[k] = v;
        }
      }
      const n =
        typeof b.n === "number" && Number.isFinite(b.n) ? b.n : 200;
      const intentMean =
        typeof b.intent_mean === "number" && Number.isFinite(b.intent_mean)
          ? b.intent_mean
          : 0;
      let weakest = typeof b.weakest === "string" ? b.weakest : "";
      if (!weakest) {
        let minVal = Infinity;
        for (const [k, v] of Object.entries(rubrics)) {
          if (v < minVal) {
            minVal = v;
            weakest = k;
          }
        }
      }
      if (weakest || Object.keys(rubrics).length > 0) {
        merged.buyers = {
          n,
          rubrics,
          intent_mean: intentMean,
          weakest,
        };
      }
    }

    if (typeof data.latency_ms === "number" && Number.isFinite(data.latency_ms)) {
      merged.latency_ms = data.latency_ms;
    }
  }

  return found ? merged : null;
}

export function extractJudgeQuestions(events: SessionEvent[]): JudgeQuestion[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.type !== "judge_questions") continue;
    const data = evt.data as { questions?: unknown } | null;
    if (!data || !Array.isArray(data.questions)) continue;

    const cleaned = data.questions
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item, idx) => ({
        id:
          typeof item.id === "string" && item.id.trim()
            ? item.id
            : `q${idx + 1}`,
        question: typeof item.question === "string" ? item.question.trim() : "",
        why: typeof item.why === "string" ? item.why.trim() : "",
        evidence: typeof item.evidence === "string" ? item.evidence.trim() : "",
        source: typeof item.source === "string" ? item.source.trim() : "research",
      }))
      .filter((item) => item.question.length > 0);

    if (cleaned.length > 0) {
      return cleaned.slice(0, 3);
    }
  }
  return [];
}
