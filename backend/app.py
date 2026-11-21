"""FastAPI server for Shadow Market."""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from pipeline.context import REPO_ROOT, RUNS_DIR, EventLog, RunContext
from pipeline.hotseat import create_hotseat_session
from pipeline.orchestrator import run_pipeline
from pipeline import iterate, room, session

load_dotenv(REPO_ROOT / ".env")
os.environ["PUBLIC_BASE_URL"] = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

_BACKGROUND: set = set()  # keep references to fire-and-forget tasks
RUNS: dict[str, tuple[RunContext, EventLog, asyncio.Task[None] | None]] = {}
_VOTE_LOCKS: dict[str, asyncio.Lock] = {}

_EXT_RE = re.compile(r"^\.[a-z0-9]{1,8}$")


class VoteRequest(BaseModel):
    choice: Literal["buy", "bounce"]
    reason: str | None = None


def _hydrate_context(ctx: RunContext, events: list[dict[str, Any]]) -> None:
    """Populate RunContext fields from a loaded EventLog so replays support hot-seat & votes."""
    actions_by_persona: dict[str, list[dict[str, Any]]] = {}
    for ev in events:
        etype = ev.get("type")
        data = ev.get("data") or {}
        if etype == "pitch_parsed":
            ctx.pitch = data
        elif etype == "boardroom_turn":
            ctx.boardroom.append(data)
        elif etype == "spec_ready":
            ctx.spec = data
        elif etype == "mvp_ready":
            ctx.mvp_url = data.get("url")
        elif etype == "competitors":
            ctx.competitors = list(data.get("items") or [])
        elif etype == "persona_action":
            pid = data.get("persona_id")
            if pid:
                actions_by_persona.setdefault(pid, []).append(data)
        elif etype == "persona_finished":
            pid = data.get("persona_id")
            entry = dict(data)
            if pid:
                entry["actions"] = actions_by_persona.get(pid, [])
            ctx.lab_results.append(entry)
        elif etype == "quit_markers":
            pid = data.get("persona_id")
            if pid:
                ctx.quit_markers[pid] = list(data.get("markers") or [])
        elif etype == "swarm_result":
            ctx.swarm = data
        elif etype == "verdict":
            ctx.verdict = data

    mvp_dir = ctx.run_dir / "mvp"
    if (mvp_dir / "index.html").is_file():
        ctx.mvp_dir = mvp_dir
    if (mvp_dir / "screenshot.png").is_file():
        ctx.screenshot_path = mvp_dir / "screenshot.png"


def _load_existing_runs() -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    # backend/demo_runs/ holds committed golden runs: replay works on any machine, no API key needed.
    demo_dir = Path(__file__).resolve().parent / "demo_runs"
    files = (
        sorted(RUNS_DIR.glob("r_*/events.jsonl"))
        + sorted(RUNS_DIR.glob("s_*/events.jsonl"))
        + sorted(demo_dir.glob("r_*/events.jsonl"))
    )
    for events_file in files:
        run_dir = events_file.parent
        run_id = run_dir.name
        if run_id in RUNS:
            continue
        try:
            log = EventLog(run_dir)
            ctx = RunContext(run_id=run_id, run_dir=run_dir)
            _hydrate_context(ctx, log.events)
            RUNS[run_id] = (ctx, log, None)
        except Exception as exc:  # noqa: BLE001
            print(f"[startup] skipped loading {run_id}: {type(exc).__name__}: {exc}", flush=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_existing_runs()
    yield


app = FastAPI(title="Shadow Market Backend", lifespan=lifespan)


class ClientAllowlist:
    """Only our own devices may call the API (HTTP and WebSocket).

    Localhost is always allowed. Other machines must be listed in ALLOWED_CLIENT_IPS
    (comma-separated, e.g. Laptop B and the iPad). ALLOWED_CLIENT_IPS=* allows everyone.
    Without this, anyone on shared venue Wi-Fi could start runs on our Gemini key or mint Live tokens.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            client = (scope.get("client") or ("", 0))[0]
            allowed = {"127.0.0.1", "::1", "localhost"} | {
                ip.strip() for ip in os.environ.get("ALLOWED_CLIENT_IPS", "").split(",") if ip.strip()
            }
            if "*" not in allowed and client not in allowed:
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                    return
                await send({"type": "http.response.start", "status": 403, "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": b'{"detail":"client not allowed"}'})
                return
        await self.app(scope, receive, send)


app.add_middleware(ClientAllowlist)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_run(run_id: str) -> tuple[RunContext, EventLog, asyncio.Task[None] | None]:
    entry = RUNS.get(run_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return entry


@app.get("/api/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/runs")
async def create_run(
    video: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
) -> dict[str, str]:
    if video is None and (text is None or not text.strip()):
        raise HTTPException(status_code=400, detail="Provide either a video upload or a non-empty text pitch.")

    run_id = f"r_{secrets.token_hex(4)}"
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    if video is not None:
        raw_suffix = Path(video.filename or "pitch.webm").suffix.lower()
        ext = raw_suffix if _EXT_RE.match(raw_suffix) else ".webm"
        video_path = run_dir / f"pitch{ext}"
        content = await video.read()
        video_path.write_bytes(content)
        ctx = RunContext(run_id=run_id, run_dir=run_dir, pitch_video=video_path)
    else:
        ctx = RunContext(run_id=run_id, run_dir=run_dir, pitch_video=None, pitch={"raw_text": text.strip()})

    log = EventLog(run_dir)
    task = asyncio.create_task(run_pipeline(ctx, log))
    RUNS[run_id] = (ctx, log, task)
    return {"run_id": run_id}


@app.get("/api/runs/{run_id}/events")
async def get_run_events(run_id: str) -> dict[str, list[dict[str, Any]]]:
    _, log, _ = _get_run(run_id)
    return {"events": log.events}


@app.api_route("/api/runs/{run_id}/artifacts/{path:path}", methods=["GET", "HEAD"])
async def get_run_artifact(run_id: str, path: str) -> FileResponse:
    ctx, _, _ = _get_run(run_id)
    run_root = ctx.run_dir.resolve()
    target = (run_root / path).resolve()
    if not target.is_relative_to(run_root) or target == run_root:
        raise HTTPException(status_code=400, detail="Invalid artifact path")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")
    return FileResponse(target)


@app.post("/api/runs/{run_id}/hotseat/{persona_id}")
async def post_hotseat(run_id: str, persona_id: str) -> dict[str, str]:
    ctx, _, _ = _get_run(run_id)
    try:
        return await asyncio.to_thread(create_hotseat_session, ctx, persona_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create hot-seat session: {type(exc).__name__}",
        ) from exc


@app.post("/api/runs/{run_id}/votes")
async def post_vote(run_id: str, body: VoteRequest) -> dict[str, bool]:
    ctx, log, _ = _get_run(run_id)
    lock = _VOTE_LOCKS.setdefault(run_id, asyncio.Lock())
    async with lock:
        votes_path = ctx.run_dir / "votes.json"
        votes: list[dict[str, Any]] = []
        if votes_path.is_file():
            try:
                loaded = json.loads(votes_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    votes = loaded
            except json.JSONDecodeError:
                votes = []

        votes.append(
            {
                "choice": body.choice,
                "reason": body.reason,
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        )
        votes_path.write_text(json.dumps(votes, indent=2), encoding="utf-8")

        buy_count = sum(1 for v in votes if v.get("choice") == "buy")
        bounce_count = sum(1 for v in votes if v.get("choice") == "bounce")
        ai_probability = ctx.verdict.get("launch_probability") if isinstance(ctx.verdict, dict) else None

        await log.emit(
            "vote_tally",
            "reality",
            {
                "buy": buy_count,
                "bounce": bounce_count,
                "ai_probability": ai_probability,
            },
        )
    return {"ok": True}


@app.post("/api/runs/{run_id}/iterate")
async def post_iterate(run_id: str) -> dict[str, bool]:
    ctx, log, _ = _get_run(run_id)
    if not (ctx.run_dir / "mvp" / "index.html").is_file():
        raise HTTPException(status_code=400, detail="Run has no V1 MVP to iterate on.")
    if run_id in iterate.ACTIVE_RUNS:
        return {"ok": True}

    async def _run_v2() -> None:
        if run_id in iterate.ACTIVE_RUNS:
            return
        await log.emit("stage_changed", "iterate", {"stage": "iterate"})
        try:
            await iterate.run(ctx, log.emit)
        except Exception as exc:  # noqa: BLE001
            msg = f"iterate failed: {type(exc).__name__}: {exc}"
            for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
                secret = os.environ.get(env_name)
                if secret and len(secret) >= 8:
                    msg = msg.replace(secret, "[REDACTED]")
            await log.emit("error", "iterate", {"message": msg, "recoverable": True})

    task = asyncio.create_task(_run_v2())
    _BACKGROUND.add(task)
    task.add_done_callback(_BACKGROUND.discard)
    return {"ok": True}


@app.get("/api/demo-runs")
async def get_demo_runs() -> dict[str, list[dict[str, str]]]:
    demo_entries: list[tuple[str, str, str]] = []
    for run_id, (_, log, _) in RUNS.items():
        has_verdict = False
        title = run_id
        latest_ts = ""
        for ev in log.events:
            if ev.get("ts"):
                latest_ts = str(ev["ts"])
            if ev.get("type") == "pitch_parsed":
                t = (ev.get("data") or {}).get("title")
                if t:
                    title = str(t)
            elif ev.get("type") == "verdict":
                has_verdict = True
        if has_verdict:
            demo_entries.append((latest_ts, run_id, title))

    demo_entries.sort(key=lambda item: item[0], reverse=True)
    return {"runs": [{"run_id": rid, "title": title} for _, rid, title in demo_entries]}


@app.websocket("/ws/runs/{run_id}")
async def ws_run_events(websocket: WebSocket, run_id: str) -> None:
    entry = RUNS.get(run_id)
    if entry is None:
        await websocket.accept()
        await websocket.close(code=4404, reason="Run not found")
        return

    _, log, _ = entry
    await websocket.accept()

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    log.subscribers.add(queue)

    async def _watch_disconnect() -> None:
        try:
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    return
        except WebSocketDisconnect:
            return

    disconnect_task = asyncio.create_task(_watch_disconnect())
    try:
        last_seq = -1
        for ev in list(log.events):
            await websocket.send_json(ev)
            last_seq = ev["seq"]

        while True:
            get_task = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait(
                {get_task, disconnect_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if disconnect_task in done:
                get_task.cancel()
                break
            ev = get_task.result()
            if ev["seq"] <= last_seq:
                continue
            await websocket.send_json(ev)
            last_seq = ev["seq"]
    except WebSocketDisconnect:
        pass
    finally:
        disconnect_task.cancel()
        log.subscribers.discard(queue)


class RoomSeatItem(BaseModel):
    seat: int
    role: str


class RoomSeatsRequest(BaseModel):
    seats: list[RoomSeatItem]


class RoomTwinTokenRequest(BaseModel):
    seat: int = 1


class RoomChallengeRequest(BaseModel):
    seat: int = 1
    text: str
    utterance_id: str | None = None


class RoomAskRequest(BaseModel):
    text: str
    seat: int | None = None


class SessionAskRequest(BaseModel):
    text: str
    role: Literal["founder", "judge"]


@app.post("/api/sessions")
async def create_session() -> dict[str, str]:
    run_id = f"s_{secrets.token_hex(4)}"
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    ctx = RunContext(run_id=run_id, run_dir=run_dir)
    log = EventLog(run_dir)
    RUNS[run_id] = (ctx, log, None)
    room_state = room.ensure_room(run_id, ctx, log)
    room_state.is_session = True
    session.ensure_session(run_id)
    return {"run_id": run_id}


@app.post("/api/runs/{run_id}/session/pitch-done")
async def post_session_pitch_done(run_id: str) -> dict[str, bool]:
    ctx, log, _ = _get_run(run_id)
    room_state = room.ensure_room(run_id, ctx, log)
    room_state.is_session = True
    session.ensure_session(run_id)
    session.schedule_research(run_id, force=True)
    return {"ok": True}


@app.post("/api/runs/{run_id}/session/ask")
async def post_session_ask(run_id: str, body: SessionAskRequest) -> dict[str, bool]:
    ctx, log, _ = _get_run(run_id)
    room_state = room.ensure_room(run_id, ctx, log)
    room_state.is_session = True
    session.ensure_session(run_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text must be non-empty.")
    await room.handle_utterance(
        run_id,
        text,
        forced=(body.role == "judge"),
        role=body.role,
    )
    return {"ok": True}


@app.post("/api/runs/{run_id}/session/full-run")
async def post_session_full_run(run_id: str) -> dict[str, bool]:
    ctx, log, existing_task = _get_run(run_id)
    if existing_task is not None and not existing_task.done():
        return {"ok": True}
    sess = session.ensure_session(run_id)
    transcript = sess.transcript.strip()
    if not transcript:
        for ev in reversed(log.events):
            if ev.get("type") == "pitch_update":
                t = str((ev.get("data") or {}).get("transcript") or "").strip()
                if t:
                    transcript = t
                    break
    if not transcript:
        raise HTTPException(status_code=400, detail="Session has no pitch transcript yet.")
    ctx.pitch = {"raw_text": transcript}
    task = asyncio.create_task(run_pipeline(ctx, log))
    RUNS[run_id] = (ctx, log, task)
    return {"ok": True}


@app.websocket("/ws/runs/{run_id}/room-audio")
async def ws_room_audio(websocket: WebSocket, run_id: str) -> None:
    entry = RUNS.get(run_id)
    if entry is None:
        await websocket.accept()
        await websocket.close(code=4404, reason="Run not found")
        return

    ctx, log, _ = entry
    raw_role = websocket.query_params.get("role")
    role = raw_role if raw_role in ("founder", "judge") else None
    await websocket.accept()
    room.ensure_room(run_id, ctx, log)
    await room.stream_audio(run_id, websocket, role=role)


@app.post("/api/runs/{run_id}/room/seats")
async def post_room_seats(run_id: str, body: RoomSeatsRequest) -> dict[str, bool]:
    ctx, log, _ = _get_run(run_id)
    room.ensure_room(run_id, ctx, log)
    room.set_seats(run_id, [{"seat": s.seat, "role": s.role} for s in body.seats])
    return {"ok": True}


@app.post("/api/runs/{run_id}/room/twin-token")
async def post_room_twin_token(run_id: str, body: RoomTwinTokenRequest) -> dict[str, str]:
    ctx, log, _ = _get_run(run_id)
    room.ensure_room(run_id, ctx, log)
    try:
        return await asyncio.to_thread(room.twin_token, run_id, body.seat)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create twin token: {type(exc).__name__}",
        ) from exc


@app.post("/api/runs/{run_id}/room/challenge")
async def post_room_challenge(run_id: str, body: RoomChallengeRequest) -> dict[str, bool]:
    ctx, log, _ = _get_run(run_id)
    room.ensure_room(run_id, ctx, log)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Challenge text must be non-empty.")
    # Reply at once; twin_challenge is emitted immediately and founder_brief follows in the background.
    task = asyncio.create_task(
        room.post_challenge(run_id=run_id, seat=body.seat, text=text, utterance_id=body.utterance_id, source="live")
    )
    _BACKGROUND.add(task)
    task.add_done_callback(_BACKGROUND.discard)
    return {"ok": True}


@app.post("/api/runs/{run_id}/room/ask")
async def post_room_ask(run_id: str, body: RoomAskRequest) -> dict[str, bool]:
    ctx, log, _ = _get_run(run_id)
    room.ensure_room(run_id, ctx, log)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Question text must be non-empty.")
    await room.handle_utterance(run_id, text, forced=True, seat=body.seat)
    return {"ok": True}


@app.get("/api/room/stats")
async def get_room_stats() -> dict[str, Any]:
    return room.get_stats()
