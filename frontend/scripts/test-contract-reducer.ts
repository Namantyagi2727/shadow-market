import assert from "node:assert/strict";
import { applyRunEvent, createInitialRunState } from "../src/lib/run-store";
import type { RunEvent } from "../src/lib/contracts";

const sampleEvents: RunEvent[] = [
  {
    type: "stage_changed",
    seq: 1,
    ts: "2026-11-21T12:15:00Z",
    stage: "pitch",
    data: { stage: "pitch" },
  },
  {
    type: "pitch_parsed",
    seq: 2,
    ts: "2026-11-21T12:15:05Z",
    stage: "pitch",
    data: {
      title: "Pocket Barista",
      one_liner: "Portable induction espresso mug with bean pods",
      target_user: "Commuters & travelers",
      price_usd: 89,
      features: ["USB-C heating", "30-second brew", "Leak-proof lid"],
      sketch_notes: "Cylinder mug with bottom battery puck",
    },
  },
  {
    type: "stage_changed",
    seq: 3,
    ts: "2026-11-21T12:15:06Z",
    stage: "boardroom",
    data: { stage: "boardroom" },
  },
  {
    type: "boardroom_turn",
    seq: 4,
    ts: "2026-11-21T12:15:10Z",
    stage: "boardroom",
    data: {
      speaker: "strategist",
      model: "gemini-4-neon",
      text: "Focus on frequent flyers tired of airport coffee.",
      audio_url: "/api/runs/r_test/artifacts/turn1.wav",
    },
  },
  {
    type: "boardroom_turn",
    seq: 5,
    ts: "2026-11-21T12:15:14Z",
    stage: "boardroom",
    data: {
      speaker: "skeptic",
      model: "gemini-4-argon",
      text: "USB-C cannot boil water fast enough without a heavy battery.",
      audio_url: null,
    },
  },
  {
    type: "spec_ready",
    seq: 6,
    ts: "2026-11-21T12:15:18Z",
    stage: "boardroom",
    data: {
      headline: "Real Espresso Anywhere in 90 Seconds",
      price_usd: 99,
      pages: ["Landing", "Specs", "Preorder Checkout"],
      risks: ["Battery weight", "Cleaning friction"],
    },
  },
  {
    type: "build_progress",
    seq: 7,
    ts: "2026-11-21T12:15:25Z",
    stage: "build",
    data: { message: "Writing index.html and checkout flow..." },
  },
  {
    type: "mvp_ready",
    seq: 8,
    ts: "2026-11-21T12:15:40Z",
    stage: "build",
    data: {
      url: "/api/runs/r_test/artifacts/mvp/index.html",
      screenshot_url: "/api/runs/r_test/artifacts/mvp.png",
      hero_image_url: "/api/runs/r_test/artifacts/hero.png",
    },
  },
  {
    type: "competitors",
    seq: 9,
    ts: "2026-11-21T12:15:42Z",
    stage: "build",
    data: {
      items: [
        { title: "AeroPress Go", price_usd: 39.95, image_url: null, url: "https://example.com" },
      ],
    },
  },
  {
    type: "persona_started",
    seq: 10,
    ts: "2026-11-21T12:15:45Z",
    stage: "lab",
    data: { persona_id: "p1", name: "Maya Lin", role: "Frequent Flyer", device: "mobile" },
  },
  {
    type: "persona_action",
    seq: 11,
    ts: "2026-11-21T12:15:50Z",
    stage: "lab",
    data: {
      persona_id: "p1",
      t: 4.5,
      action: "click",
      target: "Preorder $99",
      thought: "Wait, how heavy is this in my backpack?",
    },
  },
  {
    type: "persona_finished",
    seq: 12,
    ts: "2026-11-21T12:16:00Z",
    stage: "lab",
    data: {
      persona_id: "p1",
      outcome: "quit",
      quit_reason: "No weight or TSA battery info on checkout",
      video_url: "/api/runs/r_test/artifacts/p1.webm",
      duration_s: 14.2,
    },
  },
  {
    type: "quit_markers",
    seq: 13,
    ts: "2026-11-21T12:16:05Z",
    stage: "lab",
    data: {
      persona_id: "p1",
      markers: [
        { t: 4.5, kind: "confusion", note: "Scrolled looking for battery specs" },
        { t: 13.8, kind: "quit", note: "Closed checkout modal without paying" },
      ],
    },
  },
  {
    type: "swarm_progress",
    seq: 14,
    ts: "2026-11-21T12:16:10Z",
    stage: "swarm",
    data: { done: 100, total: 200 },
  },
  {
    type: "swarm_result",
    seq: 15,
    ts: "2026-11-21T12:16:15Z",
    stage: "swarm",
    data: {
      personas: 200,
      rubrics: { clarity: 0.72, trust: 0.44, price_fit: 0.51, urgency: 0.39, intent: 0.48 },
      intent_mean: 0.48,
    },
  },
  {
    type: "verdict",
    seq: 16,
    ts: "2026-11-21T12:16:20Z",
    stage: "verdict",
    data: {
      launch_probability: 0.42,
      confidence: 0.81,
      failure_modes: ["Missing battery/TSA compliance details", "Price 2.5x AeroPress"],
      summary: "Compelling hook, but checkout friction and unclear specs suppress conversion.",
    },
  },
  {
    type: "vote_tally",
    seq: 17,
    ts: "2026-11-21T12:16:30Z",
    stage: "reality",
    data: { buy: 12, bounce: 18, ai_probability: 0.42 },
  },
  {
    type: "error",
    seq: 18,
    ts: "2026-11-21T12:16:31Z",
    stage: "reality",
    data: { message: "Optional video ad skipped", recoverable: true },
  },
  // Unknown event type — contract requires ignoring without crash
  {
    type: "future_experimental_event",
    seq: 19,
    ts: "2026-11-21T12:16:32Z",
    stage: "reality",
    data: { foo: "bar" },
  },
  // Duplicate seq — must be ignored
  {
    type: "boardroom_turn",
    seq: 4,
    ts: "2026-11-21T12:15:10Z",
    stage: "boardroom",
    data: {
      speaker: "strategist",
      model: "gemini-4-neon",
      text: "DUPLICATE SHOULD NOT APPEAR",
      audio_url: null,
    },
  },
];

let state = createInitialRunState("r_test");
for (const evt of sampleEvents) {
  state = applyRunEvent(state, evt);
}

assert.equal(state.pitch?.title, "Pocket Barista");
assert.equal(state.boardroomTurns.length, 2, "Duplicate seq should be deduplicated");
assert.equal(state.spec?.price_usd, 99);
assert.equal(state.buildMessages.length, 1);
assert.equal(state.mvp?.url, "/api/runs/r_test/artifacts/mvp/index.html");
assert.equal(state.competitors.length, 1);
assert.equal(state.personas.p1.status, "quit");
assert.equal(state.personas.p1.markers.length, 2);
assert.equal(state.swarmResult?.intent_mean, 0.48);
assert.equal(state.verdict?.launch_probability, 0.42);
assert.equal(state.voteTally?.buy, 12);
assert.equal(state.errors.length, 1);
assert.equal(state.eventCount, 19, "19 unique events processed, 1 duplicate skipped");

console.log("All 16 contract events + unknown-event + dedup assertions PASSED.");
