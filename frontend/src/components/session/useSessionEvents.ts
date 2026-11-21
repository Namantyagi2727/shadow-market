"use client";

import { useEffect, useState } from "react";
import { connectRunStream } from "@/lib/api";

/** Raw event envelope for live-session events (see contracts/session.md). */
export interface SessionEvent {
  type: string;
  seq: number;
  ts: string;
  stage: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export type StreamStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

/** Backfills + streams every event of a session/run, de-duplicated by seq and kept in order. */
export function useSessionEvents(runId: string) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    if (!runId) return;
    setEvents([]);
    const seen = new Set<number>();
    const stop = connectRunStream(runId, {
      onEvent: (evt) => {
        const e = evt as unknown as SessionEvent;
        if (seen.has(e.seq)) return;
        seen.add(e.seq);
        setEvents((prev) => [...prev, e].sort((a, b) => a.seq - b.seq));
      },
      onStatusChange: setStatus,
    });
    return stop;
  }, [runId]);

  /** Latest event of a type (or null). */
  const latest = (type: string): SessionEvent | null => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].type === type) return events[i];
    return null;
  };
  const all = (type: string) => events.filter((e) => e.type === type);

  return { events, status, latest, all };
}
