"use client";

import { useMemo } from "react";
import type { RunEvent } from "@/lib/contracts";
import type {
  V2BuildMessage,
  V2Fix,
  V2PanelEntry,
  V2PlanData,
  V2ReadyData,
  V2ResultData,
  V2State,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toNumberRecord(value: unknown): Record<string, number> {
  const obj = asRecord(value);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

export function deriveV2State(events: readonly RunEvent[]): V2State {
  let started = false;
  let startedTs: string | null = null;
  let completedTs: string | null = null;
  let plan: V2PlanData | null = null;
  const buildMessages: V2BuildMessage[] = [];
  let ready: V2ReadyData | null = null;
  const panelMap = new Map<string, V2PanelEntry>();
  let result: V2ResultData | null = null;

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const data = asRecord(event.data);
    const ts = typeof event.ts === "string" ? event.ts : "";

    if (event.stage === "iterate" || (event.type === "stage_changed" && data.stage === "iterate")) {
      started = true;
      if (!startedTs && ts) startedTs = ts;
    }

    switch (event.type) {
      case "v2_plan": {
        started = true;
        if (!startedTs && ts) startedTs = ts;
        const rawFixes = Array.isArray(data.fixes) ? data.fixes : [];
        const fixes: V2Fix[] = rawFixes
          .map((item) => {
            const rec = asRecord(item);
            return {
              issue: typeof rec.issue === "string" ? rec.issue : "",
              change: typeof rec.change === "string" ? rec.change : "",
              evidence: typeof rec.evidence === "string" ? rec.evidence : "",
            };
          })
          .filter((fix) => fix.issue.length > 0 || fix.change.length > 0);

        const rawTodo = Array.isArray(data.founder_todo) ? data.founder_todo : [];
        const founderTodo = rawTodo
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0);

        plan = { fixes, founderTodo };
        break;
      }

      case "v2_build_progress": {
        started = true;
        if (!startedTs && ts) startedTs = ts;
        const message = typeof data.message === "string" ? data.message : "";
        if (message) {
          buildMessages.push({
            seq: typeof event.seq === "number" ? event.seq : buildMessages.length,
            ts,
            message,
          });
        }
        break;
      }

      case "v2_ready": {
        started = true;
        if (!startedTs && ts) startedTs = ts;
        ready = {
          url: typeof data.url === "string" ? data.url : "",
          screenshot_url: typeof data.screenshot_url === "string" ? data.screenshot_url : "",
          v1_screenshot_url:
            typeof data.v1_screenshot_url === "string" ? data.v1_screenshot_url : "",
          reused_sandbox: Boolean(data.reused_sandbox),
        };
        break;
      }

      case "v2_panel_finished": {
        started = true;
        if (!startedTs && ts) startedTs = ts;
        const personaId = typeof data.persona_id === "string" ? data.persona_id : "";
        const version = data.version === "v2" ? "v2" : "v1";
        if (personaId) {
          const entry: V2PanelEntry = {
            persona_id: personaId,
            name: typeof data.name === "string" ? data.name : personaId,
            version,
            outcome: data.outcome === "converted" ? "converted" : "quit",
            quit_reason: typeof data.quit_reason === "string" ? data.quit_reason : null,
            video_url: typeof data.video_url === "string" ? data.video_url : "",
          };
          panelMap.set(`${personaId}:${version}`, entry);
        }
        break;
      }

      case "v2_result": {
        started = true;
        if (!startedTs && ts) startedTs = ts;
        if (ts) completedTs = ts;
        const holdout = asRecord(data.holdout);
        result = {
          holdout: {
            n: typeof holdout.n === "number" ? holdout.n : 6,
            v1_converted:
              typeof holdout.v1_converted === "number" ? holdout.v1_converted : 0,
            v2_converted:
              typeof holdout.v2_converted === "number" ? holdout.v2_converted : 0,
          },
          rubrics_v1: toNumberRecord(data.rubrics_v1),
          rubrics_v2: toNumberRecord(data.rubrics_v2),
          summary: typeof data.summary === "string" ? data.summary : "",
        };
        break;
      }

      default:
        break;
    }
  }

  return {
    started,
    startedTs,
    completedTs,
    plan,
    buildMessages,
    ready,
    panel: Array.from(panelMap.values()),
    result,
  };
}

export function useV2(events: readonly RunEvent[]): V2State {
  return useMemo(() => deriveV2State(events), [events]);
}
