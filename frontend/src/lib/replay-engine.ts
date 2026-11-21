import { RunEvent } from "./contracts";

export interface ReplayController {
  stop: () => void;
  setSpeed: (speed: number) => void;
  flushAll: () => void;
}

/**
 * Replays events loaded from GET /api/runs/{run_id}/events with their original
 * timestamp spacing (capped at 4s per gap so long silent waits don't stall demos).
 */
export function startEventReplay(
  events: RunEvent[],
  onEvent: (event: RunEvent) => void,
  onComplete: () => void,
  initialSpeed = 1
): ReplayController {
  const sorted = [...events].sort((a, b) => {
    if (typeof a.seq === "number" && typeof b.seq === "number") {
      return a.seq - b.seq;
    }
    return Date.parse(a.ts || "") - Date.parse(b.ts || "");
  });

  let index = 0;
  let speed = initialSpeed > 0 ? initialSpeed : 1;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleNext = () => {
    if (stopped) return;
    if (index >= sorted.length) {
      onComplete();
      return;
    }

    const current = sorted[index];
    const prev = index > 0 ? sorted[index - 1] : null;
    let delayMs = 0;

    if (prev) {
      const tPrev = Date.parse(prev.ts || "");
      const tCurr = Date.parse(current.ts || "");
      if (!Number.isNaN(tPrev) && !Number.isNaN(tCurr) && tCurr > tPrev) {
        delayMs = Math.min(tCurr - tPrev, 4000) / speed;
      } else {
        delayMs = 350 / speed;
      }
    }

    timer = setTimeout(() => {
      if (stopped) return;
      onEvent(current);
      index += 1;
      scheduleNext();
    }, Math.max(0, Math.round(delayMs)));
  };

  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    setSpeed(nextSpeed: number) {
      if (nextSpeed > 0) {
        speed = nextSpeed;
      }
    },
    flushAll() {
      if (stopped) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      while (index < sorted.length) {
        onEvent(sorted[index]);
        index += 1;
      }
      stopped = true;
      onComplete();
    },
  };
}
