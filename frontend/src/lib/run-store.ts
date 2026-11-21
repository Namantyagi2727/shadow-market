import {
  BoardroomTurnData,
  CompetitorItem,
  FounderBriefBadge,
  FounderBriefData,
  FounderBriefProof,
  FounderBriefProofSource,
  isValidStage,
  MvpReadyData,
  PersonaActionData,
  PersonaFinishedData,
  PersonaStartedData,
  PitchParsedData,
  QuitMarker,
  RoomGateData,
  RoomGateTopic,
  RoomUtteranceData,
  RunEvent,
  SpecReadyData,
  Stage,
  STAGES,
  SwarmProgressData,
  SwarmResultData,
  TwinChallengeData,
  VerdictData,
  VoteTallyData,
} from "./contracts";

export interface PersonaState {
  persona_id: string;
  name: string;
  role: string;
  device: string;
  status: "running" | "converted" | "quit";
  actions: PersonaActionData[];
  quit_reason: string | null;
  video_url: string | null;
  duration_s: number | null;
  markers: QuitMarker[];
}

export interface BuildLogEntry {
  seq: number;
  ts: string;
  message: string;
}

export interface RunErrorEntry {
  seq: number;
  ts: string;
  stage: Stage;
  message: string;
  recoverable: boolean;
}

export interface RunState {
  runId: string | null;
  currentStage: Stage;
  highestStageIndex: number;
  visitedStages: Stage[];
  pitch: PitchParsedData | null;
  boardroomTurns: (BoardroomTurnData & { seq: number; ts: string })[];
  spec: SpecReadyData | null;
  buildMessages: BuildLogEntry[];
  mvp: MvpReadyData | null;
  competitors: CompetitorItem[];
  personas: Record<string, PersonaState>;
  personaOrder: string[];
  swarmProgress: SwarmProgressData | null;
  swarmResult: SwarmResultData | null;
  verdict: VerdictData | null;
  roomCaption: string | null;
  roomUtterances: RoomUtteranceData[];
  roomGates: Record<string, RoomGateData>;
  twinChallenges: TwinChallengeData[];
  founderBriefs: FounderBriefData[];
  voteTally: VoteTallyData | null;
  errors: RunErrorEntry[];
  seenSeqs: number[];
  eventCount: number;
  lastEventTs: string | null;
}

export function createInitialRunState(runId: string | null = null): RunState {
  return {
    runId,
    currentStage: "pitch",
    highestStageIndex: 0,
    visitedStages: ["pitch"],
    pitch: null,
    boardroomTurns: [],
    spec: null,
    buildMessages: [],
    mvp: null,
    competitors: [],
    personas: {},
    personaOrder: [],
    swarmProgress: null,
    swarmResult: null,
    verdict: null,
    roomCaption: null,
    roomUtterances: [],
    roomGates: {},
    twinChallenges: [],
    founderBriefs: [],
    voteTally: null,
    errors: [],
    seenSeqs: [],
    eventCount: 0,
    lastEventTs: null,
  };
}

function isRoomGateTopic(value: unknown): value is RoomGateTopic {
  return (
    value === "market" ||
    value === "price" ||
    value === "competitors" ||
    value === "tech" ||
    value === "traction" ||
    value === "other"
  );
}

function isFounderBriefBadge(value: unknown): value is FounderBriefBadge {
  return value === "VERIFIED" || value === "PARTIAL" || value === "PUSH_BACK";
}

function isFounderBriefProofSource(value: unknown): value is FounderBriefProofSource {
  return (
    value === "swarm" ||
    value === "lab" ||
    value === "analyst" ||
    value === "competitors" ||
    value === "boardroom"
  );
}

function stageIndex(stage: Stage): number {
  const idx = STAGES.findIndex((s) => s.id === stage);
  return idx >= 0 ? idx : 0;
}

function recordStage(state: RunState, stage: Stage): Pick<RunState, "currentStage" | "highestStageIndex" | "visitedStages"> {
  const idx = stageIndex(stage);
  const visitedStages = state.visitedStages.includes(stage)
    ? state.visitedStages
    : [...state.visitedStages, stage];
  return {
    currentStage: stage,
    highestStageIndex: Math.max(state.highestStageIndex, idx),
    visitedStages,
  };
}

function ensurePersona(
  personas: Record<string, PersonaState>,
  personaOrder: string[],
  id: string,
  partial?: Partial<PersonaStartedData>
): { personas: Record<string, PersonaState>; personaOrder: string[]; existing: PersonaState } {
  const found = personas[id];
  if (found) {
    const updated: PersonaState = {
      ...found,
      name: partial?.name ?? found.name,
      role: partial?.role ?? found.role,
      device: partial?.device ?? found.device,
    };
    return {
      personas: { ...personas, [id]: updated },
      personaOrder,
      existing: updated,
    };
  }
  const created: PersonaState = {
    persona_id: id,
    name: partial?.name ?? id,
    role: partial?.role ?? "User Persona",
    device: partial?.device ?? "desktop",
    status: "running",
    actions: [],
    quit_reason: null,
    video_url: null,
    duration_s: null,
    markers: [],
  };
  return {
    personas: { ...personas, [id]: created },
    personaOrder: [...personaOrder, id],
    existing: created,
  };
}

/**
 * Pure reducer for RunEvent envelopes.
 * Deduplicates by seq and safely ignores unknown event types per contracts/events.md.
 */
export function applyRunEvent(state: RunState, event: RunEvent): RunState {
  if (!event || typeof event !== "object" || typeof event.type !== "string") {
    return state;
  }

  // Deduplicate by seq if numeric seq is provided
  if (typeof event.seq === "number" && state.seenSeqs.includes(event.seq)) {
    return state;
  }

  const nextSeenSeqs =
    typeof event.seq === "number" ? [...state.seenSeqs, event.seq] : state.seenSeqs;

  const baseStageUpdate = isValidStage(event.stage)
    ? {
        visitedStages: state.visitedStages.includes(event.stage)
          ? state.visitedStages
          : [...state.visitedStages, event.stage],
        highestStageIndex: Math.max(state.highestStageIndex, stageIndex(event.stage)),
      }
    : {};

  const baseNext: RunState = {
    ...state,
    ...baseStageUpdate,
    seenSeqs: nextSeenSeqs,
    eventCount: state.eventCount + 1,
    lastEventTs: typeof event.ts === "string" ? event.ts : state.lastEventTs,
  };

  const data = (event.data ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "stage_changed": {
      const nextStage = data.stage;
      if (isValidStage(nextStage)) {
        return {
          ...baseNext,
          ...recordStage(baseNext, nextStage),
        };
      }
      return baseNext;
    }

    case "pitch_parsed": {
      const pitch = data as unknown as PitchParsedData;
      return {
        ...baseNext,
        pitch: {
          title: typeof pitch.title === "string" ? pitch.title : "Untitled Concept",
          one_liner: typeof pitch.one_liner === "string" ? pitch.one_liner : "",
          target_user: typeof pitch.target_user === "string" ? pitch.target_user : "",
          price_usd: typeof pitch.price_usd === "number" ? pitch.price_usd : null,
          features: Array.isArray(pitch.features) ? pitch.features.map(String) : [],
          sketch_notes: typeof pitch.sketch_notes === "string" ? pitch.sketch_notes : "",
        },
      };
    }

    case "boardroom_turn": {
      const turn = data as unknown as BoardroomTurnData;
      return {
        ...baseNext,
        boardroomTurns: [
          ...baseNext.boardroomTurns,
          {
            speaker: turn.speaker === "skeptic" ? "skeptic" : "strategist",
            model: typeof turn.model === "string" ? turn.model : "",
            text: typeof turn.text === "string" ? turn.text : "",
            audio_url: typeof turn.audio_url === "string" ? turn.audio_url : null,
            seq: event.seq ?? baseNext.boardroomTurns.length,
            ts: event.ts ?? new Date().toISOString(),
          },
        ],
      };
    }

    case "spec_ready": {
      const spec = data as unknown as SpecReadyData;
      return {
        ...baseNext,
        spec: {
          headline: typeof spec.headline === "string" ? spec.headline : "",
          price_usd: typeof spec.price_usd === "number" ? spec.price_usd : null,
          pages: Array.isArray(spec.pages) ? spec.pages.map(String) : [],
          risks: Array.isArray(spec.risks) ? spec.risks.map(String) : [],
        },
      };
    }

    case "build_progress": {
      const message = typeof data.message === "string" ? data.message : "";
      if (!message) return baseNext;
      return {
        ...baseNext,
        buildMessages: [
          ...baseNext.buildMessages,
          {
            seq: event.seq ?? baseNext.buildMessages.length,
            ts: event.ts ?? new Date().toISOString(),
            message,
          },
        ],
      };
    }

    case "mvp_ready": {
      const mvp = data as unknown as MvpReadyData;
      return {
        ...baseNext,
        mvp: {
          url: typeof mvp.url === "string" ? mvp.url : "",
          screenshot_url: typeof mvp.screenshot_url === "string" ? mvp.screenshot_url : "",
          hero_image_url: typeof mvp.hero_image_url === "string" ? mvp.hero_image_url : null,
        },
      };
    }

    case "competitors": {
      const items = Array.isArray(data.items) ? (data.items as CompetitorItem[]) : [];
      return {
        ...baseNext,
        competitors: items,
      };
    }

    case "persona_started": {
      const started = data as unknown as PersonaStartedData;
      if (!started.persona_id) return baseNext;
      const { personas, personaOrder } = ensurePersona(
        baseNext.personas,
        baseNext.personaOrder,
        started.persona_id,
        started
      );
      return {
        ...baseNext,
        personas,
        personaOrder,
      };
    }

    case "persona_action": {
      const action = data as unknown as PersonaActionData;
      if (!action.persona_id) return baseNext;
      const { personas, personaOrder, existing } = ensurePersona(
        baseNext.personas,
        baseNext.personaOrder,
        action.persona_id
      );
      return {
        ...baseNext,
        personaOrder,
        personas: {
          ...personas,
          [action.persona_id]: {
            ...existing,
            actions: [...existing.actions, action],
          },
        },
      };
    }

    case "persona_finished": {
      const finished = data as unknown as PersonaFinishedData;
      if (!finished.persona_id) return baseNext;
      const { personas, personaOrder, existing } = ensurePersona(
        baseNext.personas,
        baseNext.personaOrder,
        finished.persona_id
      );
      return {
        ...baseNext,
        personaOrder,
        personas: {
          ...personas,
          [finished.persona_id]: {
            ...existing,
            status: finished.outcome === "converted" ? "converted" : "quit",
            quit_reason: typeof finished.quit_reason === "string" ? finished.quit_reason : null,
            video_url: typeof finished.video_url === "string" ? finished.video_url : existing.video_url,
            duration_s: typeof finished.duration_s === "number" ? finished.duration_s : existing.duration_s,
          },
        },
      };
    }

    case "quit_markers": {
      const personaId = typeof data.persona_id === "string" ? data.persona_id : "";
      if (!personaId) return baseNext;
      const markers = Array.isArray(data.markers) ? (data.markers as QuitMarker[]) : [];
      const { personas, personaOrder, existing } = ensurePersona(
        baseNext.personas,
        baseNext.personaOrder,
        personaId
      );
      return {
        ...baseNext,
        personaOrder,
        personas: {
          ...personas,
          [personaId]: {
            ...existing,
            markers: [...markers].sort((a, b) => a.t - b.t),
          },
        },
      };
    }

    case "swarm_progress": {
      const done = typeof data.done === "number" ? data.done : 0;
      const total = typeof data.total === "number" ? data.total : 200;
      return {
        ...baseNext,
        swarmProgress: { done, total },
      };
    }

    case "swarm_result": {
      const result = data as unknown as SwarmResultData;
      return {
        ...baseNext,
        swarmProgress: {
          done: typeof result.personas === "number" ? result.personas : 200,
          total: typeof result.personas === "number" ? result.personas : 200,
        },
        swarmResult: {
          personas: typeof result.personas === "number" ? result.personas : 200,
          rubrics:
            result.rubrics && typeof result.rubrics === "object"
              ? result.rubrics
              : {},
          intent_mean: typeof result.intent_mean === "number" ? result.intent_mean : 0,
        },
      };
    }

    case "verdict": {
      const verdict = data as unknown as VerdictData;
      return {
        ...baseNext,
        verdict: {
          launch_probability:
            typeof verdict.launch_probability === "number" ? verdict.launch_probability : 0,
          confidence: typeof verdict.confidence === "number" ? verdict.confidence : 0,
          failure_modes: Array.isArray(verdict.failure_modes)
            ? verdict.failure_modes.map(String)
            : [],
          summary: typeof verdict.summary === "string" ? verdict.summary : "",
          ...(typeof verdict.analyst_reason === "string"
            ? { analyst_reason: verdict.analyst_reason }
            : {}),
          ...(typeof verdict.market_intent === "number"
            ? { market_intent: verdict.market_intent }
            : {}),
          ...(verdict.probability_source === "analyst"
            ? { probability_source: "analyst" as const }
            : {}),
        },
      };
    }

    case "room_caption": {
      const text = typeof data.text === "string" ? data.text : "";
      return {
        ...baseNext,
        roomCaption: text.length > 0 ? text : null,
      };
    }

    case "room_utterance": {
      const utterance = data as unknown as RoomUtteranceData;
      const utteranceId =
        typeof utterance.utterance_id === "string" ? utterance.utterance_id : "";
      if (!utteranceId) {
        return {
          ...baseNext,
          roomCaption: null,
        };
      }
      if (baseNext.roomUtterances.some((u) => u.utterance_id === utteranceId)) {
        return {
          ...baseNext,
          roomCaption: null,
        };
      }
      return {
        ...baseNext,
        roomCaption: null,
        roomUtterances: [
          ...baseNext.roomUtterances,
          {
            utterance_id: utteranceId,
            speaker: typeof utterance.speaker === "string" ? utterance.speaker : "unknown",
            speaker_label:
              typeof utterance.speaker_label === "string" ? utterance.speaker_label : "",
            text: typeof utterance.text === "string" ? utterance.text : "",
            t: typeof utterance.t === "number" ? utterance.t : 0,
          },
        ],
      };
    }

    case "room_gate": {
      const gate = data as unknown as RoomGateData;
      const utteranceId =
        typeof gate.utterance_id === "string" ? gate.utterance_id : "";
      if (!utteranceId) return baseNext;
      return {
        ...baseNext,
        roomGates: {
          ...baseNext.roomGates,
          [utteranceId]: {
            utterance_id: utteranceId,
            is_challenge: typeof gate.is_challenge === "number" ? gate.is_challenge : 0,
            topic: isRoomGateTopic(gate.topic) ? gate.topic : "other",
            triggered: Boolean(gate.triggered),
            latency_ms: typeof gate.latency_ms === "number" ? gate.latency_ms : 0,
          },
        },
      };
    }

    case "twin_challenge": {
      const challenge = data as unknown as TwinChallengeData;
      const challengeId =
        typeof challenge.challenge_id === "string" ? challenge.challenge_id : "";
      if (!challengeId) return baseNext;
      if (baseNext.twinChallenges.some((c) => c.challenge_id === challengeId)) {
        return baseNext;
      }
      return {
        ...baseNext,
        twinChallenges: [
          ...baseNext.twinChallenges,
          {
            challenge_id: challengeId,
            utterance_id:
              typeof challenge.utterance_id === "string" ? challenge.utterance_id : null,
            seat: typeof challenge.seat === "number" ? challenge.seat : 1,
            role: typeof challenge.role === "string" ? challenge.role : "",
            text: typeof challenge.text === "string" ? challenge.text : "",
            audio_url:
              typeof challenge.audio_url === "string" ? challenge.audio_url : null,
            source: challenge.source === "live" ? "live" : "server",
          },
        ],
      };
    }

    case "founder_brief": {
      const brief = data as unknown as FounderBriefData;
      const challengeId =
        typeof brief.challenge_id === "string" ? brief.challenge_id : "";
      if (!challengeId) return baseNext;
      if (baseNext.founderBriefs.some((b) => b.challenge_id === challengeId)) {
        return baseNext;
      }
      const rawProof: unknown[] = Array.isArray(data.proof) ? data.proof : [];
      const proof: FounderBriefProof[] = rawProof
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object")
        )
        .map((item) => ({
          label: typeof item.label === "string" ? item.label : "",
          value: typeof item.value === "string" ? item.value : "",
          source: isFounderBriefProofSource(item.source) ? item.source : "analyst",
        }));
      return {
        ...baseNext,
        founderBriefs: [
          ...baseNext.founderBriefs,
          {
            challenge_id: challengeId,
            badge: isFounderBriefBadge(brief.badge) ? brief.badge : "PARTIAL",
            badge_confidence:
              typeof brief.badge_confidence === "number" ? brief.badge_confidence : 0,
            line: typeof brief.line === "string" ? brief.line : "",
            proof,
            latency_ms: typeof brief.latency_ms === "number" ? brief.latency_ms : 0,
          },
        ],
      };
    }

    case "vote_tally": {
      const tally = data as unknown as VoteTallyData;
      return {
        ...baseNext,
        voteTally: {
          buy: typeof tally.buy === "number" ? tally.buy : 0,
          bounce: typeof tally.bounce === "number" ? tally.bounce : 0,
          ai_probability:
            typeof tally.ai_probability === "number" ? tally.ai_probability : 0,
        },
      };
    }

    case "error": {
      const message = typeof data.message === "string" ? data.message : "Unknown backend error";
      const recoverable = typeof data.recoverable === "boolean" ? data.recoverable : true;
      const errorStage = isValidStage(event.stage) ? event.stage : baseNext.currentStage;
      return {
        ...baseNext,
        errors: [
          ...baseNext.errors,
          {
            seq: event.seq ?? baseNext.errors.length,
            ts: event.ts ?? new Date().toISOString(),
            stage: errorStage,
            message,
            recoverable,
          },
        ],
      };
    }

    default:
      // Contract rule: Unknown event types must be ignored, not crash the UI.
      return baseNext;
  }
}
