import assert from "node:assert/strict";
import sampleRun from "../src/dev/sample-run.json";
import roomSample from "../src/dev/room-sample.json";
import { applyRunEvent, createInitialRunState } from "../src/lib/run-store";
import type {
  BoardroomTurnData,
  BuildProgressData,
  CompetitorsData,
  MvpReadyData,
  PersonaFinishedData,
  PersonaStartedData,
  PitchParsedData,
  QuitMarkersData,
  RunEvent,
  SpecReadyData,
  SwarmResultData,
  TwinChallengeData,
  VerdictData,
  VoteTallyData,
} from "../src/lib/contracts";

function dedupeBySeq(events: RunEvent[]): RunEvent[] {
  const seen = new Set<number>();
  const unique: RunEvent[] = [];
  for (const evt of events) {
    if (typeof evt.seq === "number") {
      if (seen.has(evt.seq)) continue;
      seen.add(evt.seq);
    }
    unique.push(evt);
  }
  return unique;
}

function getEventDataByType<TData>(events: RunEvent[], type: string): TData[] {
  return events
    .filter((evt) => evt.type === type)
    .map((evt) => evt.data as unknown as TData);
}

const sampleEvents = sampleRun.events as RunEvent[];
const uniqueSampleEvents = dedupeBySeq(sampleEvents);
const maxSampleSeq = Math.max(...uniqueSampleEvents.map((e) => e.seq));

const firstBoardroomTurnEvent = uniqueSampleEvents.find((e) => e.type === "boardroom_turn");
const duplicateSeq = firstBoardroomTurnEvent ? firstBoardroomTurnEvent.seq : uniqueSampleEvents[0].seq;

const testEvents: RunEvent[] = [
  ...sampleEvents,
  // Unknown event type — contract requires ignoring without crash
  {
    type: "future_experimental_event",
    seq: maxSampleSeq + 1,
    ts: "2026-11-21T17:18:35.000Z",
    stage: "reality",
    data: { foo: "bar" },
  },
  // Duplicate seq — must be ignored
  {
    type: "boardroom_turn",
    seq: duplicateSeq,
    ts: "2026-11-21T17:18:36.000Z",
    stage: "boardroom",
    data: {
      speaker: "strategist",
      model: "gemini-4-neon",
      text: "DUPLICATE SHOULD NOT APPEAR",
      audio_url: null,
    },
  },
];

let state = createInitialRunState(sampleRun.run_id);
for (const evt of testEvents) {
  state = applyRunEvent(state, evt);
}

// Derived expectations from sample-run.json
const expectedPitch = getEventDataByType<PitchParsedData>(uniqueSampleEvents, "pitch_parsed").at(-1);
if (expectedPitch) {
  assert.equal(state.pitch?.title, expectedPitch.title);
  assert.equal(state.pitch?.price_usd, expectedPitch.price_usd);
}

const expectedBoardroomTurns = getEventDataByType<BoardroomTurnData>(
  uniqueSampleEvents,
  "boardroom_turn"
);
assert.equal(
  state.boardroomTurns.length,
  expectedBoardroomTurns.length,
  "unique boardroom turns counted (duplicate seq skipped)"
);
assert.ok(
  !state.boardroomTurns.some((t) => t.text === "DUPLICATE SHOULD NOT APPEAR"),
  "duplicate seq payload must not appear"
);

const expectedSpec = getEventDataByType<SpecReadyData>(uniqueSampleEvents, "spec_ready").at(-1);
if (expectedSpec) {
  assert.equal(state.spec?.price_usd, expectedSpec.price_usd);
  assert.equal(state.spec?.headline, expectedSpec.headline);
}

const expectedBuildMessages = getEventDataByType<BuildProgressData>(
  uniqueSampleEvents,
  "build_progress"
).filter((m) => typeof m.message === "string" && m.message.length > 0);
assert.equal(state.buildMessages.length, expectedBuildMessages.length);

const expectedMvp = getEventDataByType<MvpReadyData>(uniqueSampleEvents, "mvp_ready").at(-1);
if (expectedMvp) {
  assert.equal(state.mvp?.url, expectedMvp.url);
}

const expectedCompetitors = getEventDataByType<CompetitorsData>(
  uniqueSampleEvents,
  "competitors"
).at(-1);
if (expectedCompetitors) {
  assert.equal(state.competitors.length, expectedCompetitors.items.length);
}

const expectedPersonaIds = new Set(
  getEventDataByType<PersonaStartedData>(uniqueSampleEvents, "persona_started").map(
    (p) => p.persona_id
  )
);
assert.equal(state.personaOrder.length, expectedPersonaIds.size, "All unique personas tracked");

const expectedPersonaFinished = getEventDataByType<PersonaFinishedData>(
  uniqueSampleEvents,
  "persona_finished"
);
for (const finished of expectedPersonaFinished) {
  assert.equal(state.personas[finished.persona_id]?.status, finished.outcome);
}

const expectedQuitMarkers = getEventDataByType<QuitMarkersData>(
  uniqueSampleEvents,
  "quit_markers"
);
for (const qm of expectedQuitMarkers) {
  assert.equal(state.personas[qm.persona_id]?.markers.length, qm.markers.length);
}

const expectedSwarmResult = getEventDataByType<SwarmResultData>(
  uniqueSampleEvents,
  "swarm_result"
).at(-1);
if (expectedSwarmResult) {
  assert.equal(state.swarmResult?.intent_mean, expectedSwarmResult.intent_mean);
}

const expectedVerdict = getEventDataByType<VerdictData>(uniqueSampleEvents, "verdict").at(-1);
if (expectedVerdict) {
  assert.equal(state.verdict?.launch_probability, expectedVerdict.launch_probability);
  assert.equal(state.verdict?.confidence, expectedVerdict.confidence);
}

const expectedVoteTally = getEventDataByType<VoteTallyData>(
  uniqueSampleEvents,
  "vote_tally"
).at(-1);
if (expectedVoteTally) {
  assert.equal(state.voteTally?.buy, expectedVoteTally.buy);
} else {
  assert.equal(state.voteTally, null);
}

const expectedErrors = uniqueSampleEvents.filter((e) => e.type === "error");
assert.equal(state.errors.length, expectedErrors.length);

assert.equal(
  state.eventCount,
  uniqueSampleEvents.length + 1,
  "All unique sample events + 1 unknown event processed; duplicate seq skipped"
);

// Apply room-sample.json events on top (contract v2)
const roomEvents = roomSample.events as RunEvent[];
const maxSeenSeqBeforeRoom = Math.max(...state.seenSeqs);
const minRoomSeq = Math.min(...roomEvents.map((e) => e.seq));
const roomSeqOffset =
  minRoomSeq <= maxSeenSeqBeforeRoom ? maxSeenSeqBeforeRoom + 1 - minRoomSeq : 0;

for (const rawEvt of roomEvents) {
  const evt: RunEvent =
    roomSeqOffset === 0 ? rawEvt : { ...rawEvt, seq: rawEvt.seq + roomSeqOffset };
  state = applyRunEvent(state, evt);
  if (evt.type === "room_caption") {
    assert.ok(state.roomCaption && state.roomCaption.length > 0, "room_caption sets roomCaption");
  }
  if (evt.type === "room_utterance") {
    assert.equal(state.roomCaption, null, "room_utterance clears roomCaption");
  }
}

assert.equal(state.currentStage, "room");
assert.equal(state.roomUtterances.length, 3, "3 room utterances recorded");
assert.equal(Object.keys(state.roomGates).length, 3, "3 room gates keyed by utterance_id");
assert.equal(state.twinChallenges.length, 2, "2 twin challenges recorded");
assert.equal(state.founderBriefs.length, 2, "2 founder briefs recorded");
assert.equal(state.roomCaption, null, "roomCaption is null after the last utterance");

// Duplicate twin_challenge with a new seq but the same challenge_id must not be added twice
const firstChallenge: TwinChallengeData = state.twinChallenges[0];
const duplicateChallengeEvent: RunEvent = {
  type: "twin_challenge",
  seq: Math.max(...state.seenSeqs) + 1,
  ts: "2026-11-21T17:19:30.000Z",
  stage: "room",
  data: {
    ...firstChallenge,
    text: "DUPLICATE CHALLENGE SHOULD NOT BE ADDED",
  },
};
state = applyRunEvent(state, duplicateChallengeEvent);
assert.equal(
  state.twinChallenges.length,
  2,
  "duplicated twin_challenge (same challenge_id) is not added twice"
);
assert.equal(state.twinChallenges[0].text, firstChallenge.text);

console.log(
  `All ${uniqueSampleEvents.length} sample-run + ${roomEvents.length} room-sample + unknown-event + dedup assertions PASSED.`
);
