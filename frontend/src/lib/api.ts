import {
  CreateRunResponse,
  DemoRunSummary,
  DemoRunsResponse,
  getApiBase,
  HotseatResponse,
  resolveArtifactUrl,
  RoomAskRequest,
  RoomAskResponse,
  RoomChallengeRequest,
  RoomChallengeResponse,
  RoomSeatsRequest,
  RoomSeatsResponse,
  RoomTwinTokenRequest,
  RoomTwinTokenResponse,
  RunEvent,
  RunEventsResponse,
  VoteRequest,
  VoteResponse,
} from "./contracts";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText || "Request failed";
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { detail?: string; message?: string };
          detail = parsed.detail || parsed.message || text;
        } catch {
          detail = text;
        }
      }
    } catch {
      // ignore body read error
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export async function createRun(videoBlob: Blob, filename = "pitch.webm"): Promise<CreateRunResponse> {
  const form = new FormData();
  form.append("video", videoBlob, filename);

  const response = await fetch(`${getApiBase()}/api/runs`, {
    method: "POST",
    body: form,
  });

  return parseJsonOrThrow<CreateRunResponse>(response);
}

export async function fetchRunEvents(runId: string): Promise<RunEvent[]> {
  const response = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/events`, {
    method: "GET",
    cache: "no-store",
  });
  const data = await parseJsonOrThrow<RunEventsResponse>(response);
  return Array.isArray(data.events) ? data.events : [];
}

export async function fetchDemoRuns(): Promise<DemoRunSummary[]> {
  const response = await fetch(`${getApiBase()}/api/demo-runs`, {
    method: "GET",
    cache: "no-store",
  });
  const data = await parseJsonOrThrow<DemoRunsResponse>(response);
  return Array.isArray(data.runs) ? data.runs : [];
}

export async function requestHotseatToken(
  runId: string,
  personaId: string
): Promise<HotseatResponse> {
  const response = await fetch(
    `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/hotseat/${encodeURIComponent(personaId)}`,
    {
      method: "POST",
    }
  );
  return parseJsonOrThrow<HotseatResponse>(response);
}

export async function submitVote(runId: string, payload: VoteRequest): Promise<VoteResponse> {
  const response = await fetch(`${getApiBase()}/api/runs/${encodeURIComponent(runId)}/votes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<VoteResponse>(response);
}

export async function postRoomSeats(
  runId: string,
  payload: RoomSeatsRequest
): Promise<RoomSeatsResponse> {
  const response = await fetch(
    `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/room/seats`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  return parseJsonOrThrow<RoomSeatsResponse>(response);
}

export async function requestTwinToken(
  runId: string,
  seat: number
): Promise<RoomTwinTokenResponse> {
  const payload: RoomTwinTokenRequest = { seat };
  const response = await fetch(
    `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/room/twin-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  return parseJsonOrThrow<RoomTwinTokenResponse>(response);
}

export async function postRoomChallenge(
  runId: string,
  payload: RoomChallengeRequest
): Promise<RoomChallengeResponse> {
  const response = await fetch(
    `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/room/challenge`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  return parseJsonOrThrow<RoomChallengeResponse>(response);
}

export async function postRoomAsk(
  runId: string,
  payload: RoomAskRequest
): Promise<RoomAskResponse> {
  const response = await fetch(
    `${getApiBase()}/api/runs/${encodeURIComponent(runId)}/room/ask`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  return parseJsonOrThrow<RoomAskResponse>(response);
}

export function resolveApiUrl(path: string): string {
  return resolveArtifactUrl(null, path) ?? path;
}

export function getRunWebSocketUrl(runId: string): string {
  const base = getApiBase();
  const wsBase = base.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return `${wsBase}/ws/runs/${encodeURIComponent(runId)}`;
}

export function getRoomAudioWebSocketUrl(runId: string): string {
  return `${getRunWebSocketUrl(runId)}/room-audio`;
}

export interface RunSocketHandlers {
  onEvent: (event: RunEvent) => void;
  onStatusChange: (status: "connecting" | "connected" | "reconnecting" | "disconnected" | "error") => void;
  onErrorMessage?: (message: string) => void;
}

/**
 * Connects to GET /ws/runs/{run_id} (server -> client only, client sends nothing).
 * Backfills via GET /api/runs/{run_id}/events on initial connect and reconnects.
 */
export function connectRunStream(runId: string, handlers: RunSocketHandlers): () => void {
  let closedByCaller = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const backfill = async () => {
    try {
      const existing = await fetchRunEvents(runId);
      if (closedByCaller) return;
      for (const evt of existing) {
        handlers.onEvent(evt);
      }
    } catch {
      // Backfill failure is non-fatal while WebSocket connects/retries
    }
  };

  const openSocket = () => {
    if (closedByCaller) return;
    handlers.onStatusChange(attempt === 0 ? "connecting" : "reconnecting");

    try {
      socket = new WebSocket(getRunWebSocketUrl(runId));
    } catch (err) {
      handlers.onStatusChange("error");
      handlers.onErrorMessage?.(err instanceof Error ? err.message : "Failed to open WebSocket");
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      if (closedByCaller) {
        socket?.close();
        return;
      }
      attempt = 0;
      handlers.onStatusChange("connected");
      void backfill();
    };

    socket.onmessage = (msg) => {
      if (closedByCaller) return;
      try {
        const parsed = JSON.parse(String(msg.data)) as RunEvent;
        if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
          handlers.onEvent(parsed);
        }
      } catch {
        // Ignore malformed non-JSON frames rather than crashing the UI
      }
    };

    socket.onerror = () => {
      if (closedByCaller) return;
      handlers.onStatusChange("reconnecting");
    };

    socket.onclose = () => {
      if (closedByCaller) {
        handlers.onStatusChange("disconnected");
        return;
      }
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closedByCaller) return;
    attempt += 1;
    const delayMs = Math.min(1000 * Math.pow(1.6, attempt - 1), 8000);
    handlers.onStatusChange("reconnecting");
    reconnectTimer = setTimeout(() => {
      openSocket();
    }, delayMs);
  };

  openSocket();

  return () => {
    closedByCaller = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    handlers.onStatusChange("disconnected");
  };
}
