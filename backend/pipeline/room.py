"""Live Q&A room backend: streaming transcription, Decisions gate, judge twins, and founder teleprompter."""

from __future__ import annotations

import asyncio
import difflib
import os
import re
import secrets
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from pipeline.boardroom import _synthesize_wav
from pipeline.context import EventLog, RunContext
from pipeline.llm import MODEL_IDS, beta, generate_json, generate_text, text_part

DEFAULT_SEAT_ROLES: dict[int, str] = {
    1: "VC partner",
    2: "Skeptical CFO",
    3: "AI engineer",
}

VALID_TOPICS: set[str] = {"market", "price", "competitors", "tech", "traction", "other"}
VALID_PROOF_SOURCES: set[str] = {"swarm", "lab", "analyst", "competitors", "boardroom"}

ECHO_WINDOW_S = 45.0
ECHO_RATIO_THRESHOLD = 0.6
SESSION_DEDUPE_WINDOW_S = 90.0  # both mics hear the same sentence; repeats can land up to a minute apart
SESSION_DEDUPE_RATIO = 0.8
CAPTION_MIN_INTERVAL_S = 0.25  # <= 4/s
GATE_TRIGGER_THRESHOLD = 0.7
FALLBACK_DELAY_S = 4.0
SILENCE_COMMIT_S = 1.8  # commit a live caption as an utterance after this much silence  # Live twin normally answers in ~1-2 s
FALLBACK_VOICE = "Fenrir"
MAX_FOUNDER_LINE_WORDS = 14

CHECKER_STATS: dict[str, int] = {"pills": 0, "dropped": 0}
_GATE_LATENCIES_MS: list[int] = []
_BRIEF_LATENCIES_MS: list[int] = []

_NUM_RE = re.compile(r"(?<![A-Za-z_])\$?(?:\d[\d,]*(?:\.\d+)?|\.\d+)%?")

CHALLENGE_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="challenge_founder",
            description="Send one sharp, specific challenge to the founder's screen.",
            parameters={
                "type": "object",
                "properties": {"challenge": {"type": "string"}},
                "required": ["challenge"],
            },
        )
    ]
)

GATE_QUESTIONS: dict[str, dict[str, Any]] = {
    "is_challenge": {
        "type": "noul",
        "instructions": (
            "Is this utterance a judge's question or challenge to the founder that needs "
            "a substantive answer (not small talk, logistics, or the founder speaking)?"
        ),
    },
    "topic": {
        "type": "choice",
        "instructions": "What is the utterance mainly about?",
        "criteria": {
            "market": "market size or demand",
            "price": "pricing or willingness to pay",
            "competitors": "incumbents or alternatives",
            "tech": "how it works or can be built",
            "traction": "users, churn, revenue, retention",
            "other": "anything else",
        },
    },
}

SUPPORT_QUESTIONS: dict[str, dict[str, Any]] = {
    "support": {
        "type": "choice",
        "instructions": (
            "Given ONLY the evidence from our own analysis, how well does it let the founder "
            "answer this challenge?"
        ),
        "criteria": {
            "verified": "the evidence directly supports a strong answer",
            "partial": "the evidence supports part of an answer or is mixed",
            "push_back": (
                "the evidence agrees with the challenge; the founder should concede and give the fix"
            ),
        },
    }
}

FOUNDER_BRIEF_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "line": {"type": "string"},
        "answer": {"type": "string"},
        "proof": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "value": {"type": "string"},
                    "source": {
                        "type": "string",
                        "enum": ["swarm", "lab", "analyst", "competitors", "boardroom"],
                    },
                },
                "required": ["label", "value", "source"],
                "additionalProperties": False,
            },
            "minItems": 1,
            "maxItems": 2,
        },
    },
    "required": ["line", "answer", "proof"],
    "additionalProperties": False,
}


@dataclass
class PendingUtterance:
    utterance_id: str
    text: str
    t_start: float
    preferred_seat: int | None = None
    task: asyncio.Task[None] | None = None


@dataclass
class RoomState:
    run_id: str
    ctx: RunContext
    log: EventLog
    seats: dict[int, str] = field(default_factory=lambda: dict(DEFAULT_SEAT_ROLES))
    recent_challenges: list[tuple[float, str]] = field(default_factory=list)
    recent_utterances: list[tuple[float, str]] = field(default_factory=list)
    pending: dict[str, PendingUtterance] = field(default_factory=dict)
    room_start: float = field(default_factory=time.monotonic)
    stage_changed_emitted: bool = False
    next_seat_idx: int = 0
    is_session: bool = False
    latest_interim: dict[str, str] = field(default_factory=dict)  # role -> latest live caption


ROOMS: dict[str, RoomState] = {}


@lru_cache(maxsize=1)
def _alpha_client() -> genai.Client:
    return genai.Client(http_options={"api_version": "v1alpha"})


def ensure_room(run_id: str, ctx: RunContext, log: EventLog) -> RoomState:
    state = ROOMS.get(run_id)
    if state is None:
        state = RoomState(run_id=run_id, ctx=ctx, log=log, is_session=run_id.startswith("s_"))
        ROOMS[run_id] = state
    else:
        state.ctx = ctx
        state.log = log
    return state


def _get_room(run_id: str) -> RoomState:
    state = ROOMS.get(run_id)
    if state is not None:
        return state

    app_mod = sys.modules.get("app")
    if app_mod is not None:
        runs_map = getattr(app_mod, "RUNS", None)
        if isinstance(runs_map, dict) and run_id in runs_map:
            ctx, log, _ = runs_map[run_id]
            return ensure_room(run_id, ctx, log)

    raise KeyError(f"Room state not initialized for run: {run_id}")


def set_seats(run_id: str, seats: list[dict[str, Any]]) -> None:
    room = _get_room(run_id)
    updated: dict[int, str] = {}
    for item in seats:
        seat_num = int(item["seat"])
        role = str(item.get("role") or "").strip() or DEFAULT_SEAT_ROLES.get(seat_num, f"Judge {seat_num}")
        updated[seat_num] = role
    if updated:
        room.seats = updated


def _get_seat_role(room: RoomState, seat: int) -> str:
    return room.seats.get(seat) or DEFAULT_SEAT_ROLES.get(seat) or f"Judge seat {seat}"


def _pick_next_seat(room: RoomState, preferred_seat: int | None = None) -> int:
    if preferred_seat is not None:
        return preferred_seat
    seat_nums = sorted(room.seats.keys()) or sorted(DEFAULT_SEAT_ROLES.keys())
    seat = seat_nums[room.next_seat_idx % len(seat_nums)]
    room.next_seat_idx += 1
    return seat


async def _ensure_room_stage(room: RoomState) -> None:
    if not room.stage_changed_emitted:
        room.stage_changed_emitted = True
        room.room_start = time.monotonic()
        await room.log.emit("stage_changed", "room", {"stage": "room"})


def get_stats() -> dict[str, Any]:
    gate_avg = round(sum(_GATE_LATENCIES_MS) / len(_GATE_LATENCIES_MS), 1) if _GATE_LATENCIES_MS else None
    brief_avg = round(sum(_BRIEF_LATENCIES_MS) / len(_BRIEF_LATENCIES_MS), 1) if _BRIEF_LATENCIES_MS else None
    return {
        "pills": CHECKER_STATS["pills"],
        "dropped": CHECKER_STATS["dropped"],
        "checker": dict(CHECKER_STATS),
        "gate_latency_ms_avg": gate_avg,
        "gate_count": len(_GATE_LATENCIES_MS),
        "brief_latency_ms_avg": brief_avg,
        "brief_count": len(_BRIEF_LATENCIES_MS),
    }


# ---------- 1. Evidence pack ----------


def _as_float(val: Any) -> float | None:
    if isinstance(val, bool) or val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _fmt_prob(val: float) -> str:
    return f"{val:.2f} ({round(val * 100)}%)"


def _fmt_price(val: float) -> str:
    if float(val).is_integer():
        return f"${int(val)}"
    return f"${val:.2f}"


def build_evidence(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a compact structured evidence pack from a run's EventLog events."""
    pitch: dict[str, Any] = {}
    spec: dict[str, Any] = {}
    competitors: list[dict[str, Any]] = []
    web_facts: list[dict[str, Any]] = []
    persona_names: dict[str, str] = {}
    lab_by_persona: dict[str, dict[str, Any]] = {}
    swarm_rubrics: dict[str, float] = {}
    swarm_personas: int = 0
    swarm_intent_mean: float | None = None
    swarm_weakest: str | None = None
    verdict: dict[str, Any] = {}

    for ev in events:
        etype = ev.get("type")
        data = ev.get("data") or {}
        if not isinstance(data, dict):
            continue

        if etype == "pitch_parsed":
            pitch = {
                "title": str(data.get("title") or "").strip(),
                "one_liner": str(data.get("one_liner") or "").strip(),
                "target_user": str(data.get("target_user") or "").strip(),
                "price_usd": _as_float(data.get("price_usd")),
            }
        elif etype == "pitch_research":
            pr_pitch = data.get("pitch")
            if isinstance(pr_pitch, dict) and (pr_pitch.get("title") or pr_pitch.get("one_liner")):
                pitch = {
                    "title": str(pr_pitch.get("title") or "").strip(),
                    "one_liner": str(pr_pitch.get("one_liner") or "").strip(),
                    "target_user": str(pr_pitch.get("target_user") or "").strip(),
                    "price_usd": _as_float(pr_pitch.get("price_usd")),
                    "location": str(pr_pitch.get("location") or "").strip() or None,
                    "claims": [str(c).strip() for c in (pr_pitch.get("claims") or []) if str(c).strip()],
                }
            pr_comps = data.get("competitors")
            if isinstance(pr_comps, list) and pr_comps:
                competitors = []
                for item in pr_comps:
                    if not isinstance(item, dict):
                        continue
                    title = str(item.get("title") or "").strip()
                    if title:
                        competitors.append({"title": title, "price_usd": _as_float(item.get("price_usd"))})
            pr_web = data.get("web")
            if isinstance(pr_web, list) and pr_web:
                web_facts = []
                for item in pr_web:
                    if not isinstance(item, dict):
                        continue
                    fact = str(item.get("fact") or "").strip()
                    if fact:
                        web_facts.append({"fact": fact, "url": item.get("url")})
            pr_analyst = data.get("analyst")
            if isinstance(pr_analyst, dict):
                ap = _as_float(pr_analyst.get("probability"))
                if ap is not None:
                    verdict = {
                        **verdict,
                        "launch_probability": ap,
                        "analyst_reason": str(pr_analyst.get("reason") or "").strip()
                        or str(verdict.get("analyst_reason") or "").strip(),
                        "framing": str(pr_analyst.get("framing") or "").strip()
                        or str(verdict.get("framing") or "").strip(),
                    }
            pr_buyers = data.get("buyers")
            if isinstance(pr_buyers, dict) and (pr_buyers.get("rubrics") or pr_buyers.get("n")):
                raw_n = _as_float(pr_buyers.get("n"))
                if raw_n is not None:
                    swarm_personas = int(raw_n)
                im = _as_float(pr_buyers.get("intent_mean"))
                if im is not None:
                    swarm_intent_mean = im
                raw_rubrics = pr_buyers.get("rubrics") or {}
                if isinstance(raw_rubrics, dict) and raw_rubrics:
                    swarm_rubrics = {}
                    for k, v in raw_rubrics.items():
                        fv = _as_float(v)
                        if fv is not None:
                            swarm_rubrics[str(k)] = fv
                w = str(pr_buyers.get("weakest") or "").strip()
                if w:
                    swarm_weakest = w
        elif etype == "spec_ready":
            spec = {
                "headline": str(data.get("headline") or "").strip(),
                "price_usd": _as_float(data.get("price_usd")),
                "risks": [str(r).strip() for r in (data.get("risks") or []) if str(r).strip()],
            }
        elif etype == "competitors":
            items = data.get("items") or []
            competitors = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or "").strip()
                if title:
                    competitors.append({"title": title, "price_usd": _as_float(item.get("price_usd"))})
        elif etype == "persona_started":
            pid = str(data.get("persona_id") or "").strip()
            name = str(data.get("name") or "").strip()
            if pid and name:
                persona_names[pid] = name
        elif etype == "persona_finished":
            pid = str(data.get("persona_id") or f"p_{len(lab_by_persona) + 1}").strip()
            lab_by_persona[pid] = {
                "persona_id": pid,
                "name": persona_names.get(pid, pid),
                "outcome": str(data.get("outcome") or "").strip(),
                "quit_reason": str(data.get("quit_reason") or "").strip() or None,
            }
        elif etype == "swarm_result":
            raw_personas = _as_float(data.get("personas"))
            if raw_personas is not None:
                swarm_personas = int(raw_personas)
            swarm_intent_mean = _as_float(data.get("intent_mean"))
            raw_rubrics = data.get("rubrics") or {}
            if isinstance(raw_rubrics, dict):
                swarm_rubrics = {}
                for k, v in raw_rubrics.items():
                    fv = _as_float(v)
                    if fv is not None:
                        swarm_rubrics[str(k)] = fv
                if swarm_rubrics:
                    swarm_weakest = min(swarm_rubrics, key=lambda k: swarm_rubrics[k])
        elif etype == "verdict":
            verdict = {
                "launch_probability": _as_float(data.get("launch_probability")),
                "analyst_reason": str(data.get("analyst_reason") or "").strip(),
                "market_intent": _as_float(data.get("market_intent")),
                "confidence": _as_float(data.get("confidence")),
                "failure_modes": [str(m).strip() for m in (data.get("failure_modes") or []) if str(m).strip()],
                "summary": str(data.get("summary") or "").strip(),
            }

    lab_entries = list(lab_by_persona.values())
    converted = sum(1 for r in lab_entries if r.get("outcome") == "converted")
    quit_count = sum(1 for r in lab_entries if r.get("outcome") == "quit")
    quit_reasons = [
        {"persona_id": r["persona_id"], "name": r["name"], "quit_reason": r["quit_reason"]}
        for r in lab_entries
        if r.get("outcome") == "quit" and r.get("quit_reason")
    ]

    return {
        "pitch": pitch,
        "spec": spec,
        "competitors": competitors,
        "web": web_facts,
        "lab": {
            "total": len(lab_entries),
            "converted": converted,
            "quit": quit_count,
            "quit_reasons": quit_reasons,
        },
        "swarm": {
            "personas": swarm_personas,
            "rubrics": swarm_rubrics,
            "intent_mean": swarm_intent_mean,
            "weakest": swarm_weakest,
        },
        "verdict": verdict,
    }


def evidence_text(evidence: dict[str, Any]) -> str:
    """Compact text summary of the evidence pack; 0-1 metrics written once as decimal + percent."""
    lines: list[str] = []

    pitch = evidence.get("pitch") or {}
    if pitch.get("title") or pitch.get("one_liner"):
        title = pitch.get("title") or "Untitled startup"
        one_liner = pitch.get("one_liner") or ""
        pitch_line = f"Pitch: {title}"
        if one_liner:
            pitch_line += f" — {one_liner}"
        if pitch.get("target_user"):
            pitch_line += f" (target: {pitch['target_user']})"
        if pitch.get("location"):
            pitch_line += f"; location {pitch['location']}"
        if pitch.get("price_usd") is not None:
            pitch_line += f"; pitched price {_fmt_price(pitch['price_usd'])}"
        lines.append(pitch_line)
        for claim in (pitch.get("claims") or [])[:5]:
            lines.append(f"- Pitch claim: {claim}")

    spec = evidence.get("spec") or {}
    if spec.get("headline") or spec.get("price_usd") is not None or spec.get("risks"):
        parts: list[str] = []
        if spec.get("headline"):
            parts.append(f"headline '{spec['headline']}'")
        if spec.get("price_usd") is not None:
            parts.append(f"spec price {_fmt_price(spec['price_usd'])}")
        if parts:
            lines.append("Boardroom spec: " + "; ".join(parts))
        for risk in (spec.get("risks") or [])[:4]:
            lines.append(f"- Boardroom risk: {risk}")

    verdict = evidence.get("verdict") or {}
    verdict_parts: list[str] = []
    if verdict.get("launch_probability") is not None:
        verdict_parts.append(f"launch_probability {_fmt_prob(verdict['launch_probability'])}")
    if verdict.get("market_intent") is not None:
        verdict_parts.append(f"market_intent {_fmt_prob(verdict['market_intent'])}")
    if verdict_parts:
        lines.append("Analyst verdict: " + ", ".join(verdict_parts))
    if verdict.get("analyst_reason"):
        lines.append(f"Analyst reason: {verdict['analyst_reason']}")
    if verdict.get("framing"):
        lines.append(f"Analyst framing: {verdict['framing']}")
    for mode in (verdict.get("failure_modes") or [])[:5]:
        lines.append(f"- Failure mode: {mode}")

    swarm = evidence.get("swarm") or {}
    rubrics = swarm.get("rubrics") or {}
    if rubrics or swarm.get("personas"):
        header = f"Buyer swarm ({swarm.get('personas', 0)} personas)"
        rubric_bits = [f"{k} {_fmt_prob(v)}" for k, v in rubrics.items()]
        if swarm.get("intent_mean") is not None:
            rubric_bits.append(f"intent_mean {_fmt_prob(swarm['intent_mean'])}")
        if swarm.get("weakest"):
            rubric_bits.append(f"weakest {swarm['weakest']}")
        lines.append(f"{header}: " + ", ".join(rubric_bits))

    lab = evidence.get("lab") or {}
    if lab.get("total"):
        lines.append(
            f"Usability lab: {lab.get('converted', 0)} converted / {lab.get('quit', 0)} quit "
            f"(of {lab.get('total', 0)} testers)"
        )
        for q in (lab.get("quit_reasons") or [])[:6]:
            lines.append(f"- Lab quit ({q.get('name', q.get('persona_id', 'tester'))}): {q['quit_reason']}")

    competitors = evidence.get("competitors") or []
    if competitors:
        comp_bits: list[str] = []
        for c in competitors[:6]:
            if c.get("price_usd") is not None:
                comp_bits.append(f"{c['title']} ({_fmt_price(c['price_usd'])})")
            else:
                comp_bits.append(str(c["title"]))
        lines.append("Competitors: " + "; ".join(comp_bits))

    web_facts = evidence.get("web") or []
    if web_facts:
        for w in web_facts[:5]:
            fact = str(w.get("fact") or "").strip()
            if fact:
                lines.append(f"- Web fact: {fact}")

    return chr(10).join(lines) if lines else "No prior pipeline evidence available."


def _pitch_summary_line(evidence: dict[str, Any]) -> str:
    pitch = evidence.get("pitch") or {}
    title = pitch.get("title") or "Startup pitch"
    one_liner = pitch.get("one_liner") or ""
    price = pitch.get("price_usd")
    if price is None:
        price = (evidence.get("spec") or {}).get("price_usd")
    price_part = f" ({_fmt_price(price)})" if price is not None else ""
    if one_liner:
        return f"Pitch: {title}{price_part} — {one_liner}"
    return f"Pitch: {title}{price_part}"


# ---------- 2. Streaming audio transcription ----------


def _extract_interim_text(msg: Any, sc: Any) -> str | None:
    interim = getattr(sc, "interim_input_transcription", None)
    if interim is not None:
        return getattr(interim, "text", None)

    extras = getattr(sc, "model_extra", None)
    if isinstance(extras, dict):
        raw = extras.get("interim_input_transcription")
        if isinstance(raw, dict):
            return raw.get("text")
        if raw is not None:
            return getattr(raw, "text", None)

    # Fallback to model_dump only when input_transcription is absent
    if getattr(sc, "input_transcription", None) is None and hasattr(msg, "model_dump"):
        d = msg.model_dump(exclude_none=True).get("server_content", {})
        raw = d.get("interim_input_transcription") if isinstance(d, dict) else None
        if isinstance(raw, dict):
            return raw.get("text")
    return None


async def stream_audio(run_id: str, websocket: WebSocket, role: str | None = None) -> None:
    """Stream 16 kHz mono PCM16 frames from browser mic into Gemini live transcription."""
    room = _get_room(run_id)
    await _ensure_room_stage(room)
    effective_role = role if role in ("founder", "judge") else None

    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=100)
    client_disconnected = asyncio.Event()
    utterance_tasks: set[asyncio.Task[None]] = set()
    last_caption_ts = 0.0
    # Silence watchdog: in a noisy venue the transcriber may never close a sentence, so if the live
    # caption stops changing for SILENCE_COMMIT_S we commit it as an utterance ourselves.
    interim = {"text": "", "ts": 0.0, "prefix": ""}

    def _caption_payload(text: str) -> dict[str, Any]:
        if effective_role is not None:
            return {"text": text, "role": effective_role}
        return {"text": text}

    def _spawn_utterance(text: str) -> None:
        task = asyncio.create_task(handle_utterance(run_id, text, role=effective_role))
        utterance_tasks.add(task)

        def _done(t: asyncio.Task[None]) -> None:
            utterance_tasks.discard(t)
            if not t.cancelled():
                exc = t.exception()
                if exc is not None:
                    print(f"[room] handle_utterance error ({run_id}): {type(exc).__name__}", flush=True)

        task.add_done_callback(_done)

    def _new_part(full: str) -> str:
        prefix = interim["prefix"]
        if prefix and full.startswith(prefix):
            return full[len(prefix):].strip(" ,.")
        return full.strip()

    def _on_interim(text: str) -> None:
        if text != interim["text"]:
            interim["text"], interim["ts"] = text, time.monotonic()
        if effective_role is not None:
            room.latest_interim[effective_role] = text

    def _on_final(text: str) -> None:
        part = _new_part(text)
        interim["text"], interim["prefix"] = "", ""
        if len(part.split()) >= 2:
            _spawn_utterance(part)

    async def _silence_watchdog() -> None:
        while not client_disconnected.is_set():
            await asyncio.sleep(0.5)
            text = interim["text"]
            if text and time.monotonic() - interim["ts"] >= SILENCE_COMMIT_S:
                part = _new_part(text)
                interim["prefix"], interim["text"] = text, ""
                if len(part.split()) >= 2:
                    _spawn_utterance(part)

    async def _ws_reader() -> None:
        try:
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                pcm = msg.get("bytes")
                if pcm:
                    if audio_queue.full():
                        try:
                            audio_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    audio_queue.put_nowait(pcm)
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # noqa: BLE001
            print(f"[room] audio websocket reader stopped ({run_id}): {type(exc).__name__}", flush=True)
        finally:
            client_disconnected.set()
            if audio_queue.full():
                try:
                    audio_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            audio_queue.put_nowait(None)

    async def _transcribe_loop() -> None:
        nonlocal last_caption_ts
        backoff_s = 0.5
        live_client = genai.Client(http_options={"api_version": "v1beta"})

        while not client_disconnected.is_set():
            try:
                async with live_client.aio.live.connect(
                    model=MODEL_IDS["room_transcribe"],
                    config={"input_audio_transcription": {}},
                ) as session:
                    backoff_s = 0.5

                    async def _sender() -> None:
                        while not client_disconnected.is_set():
                            pcm = await audio_queue.get()
                            if pcm is None:
                                return
                            await session.send_realtime_input(
                                audio=types.Blob(data=pcm, mime_type="audio/pcm;rate=16000")
                            )

                    async def _receiver() -> None:
                        nonlocal last_caption_ts
                        while not client_disconnected.is_set():
                            got_msg = False
                            async for msg in session.receive():
                                got_msg = True
                                sc = getattr(msg, "server_content", None)
                                if not sc:
                                    continue

                                interim_text = _extract_interim_text(msg, sc)
                                if interim_text and interim_text.strip():
                                    _on_interim(interim_text.strip())
                                    now = time.monotonic()
                                    if now - last_caption_ts >= CAPTION_MIN_INTERVAL_S:
                                        last_caption_ts = now
                                        await room.log.emit(
                                            "room_caption",
                                            "room",
                                            _caption_payload(interim_text.strip()),
                                        )

                                final_tr = getattr(sc, "input_transcription", None)
                                final_text = getattr(final_tr, "text", None) if final_tr else None
                                if final_text and final_text.strip():
                                    finished = getattr(final_tr, "finished", None)
                                    cleaned = final_text.strip()
                                    if finished is False:
                                        now = time.monotonic()
                                        if now - last_caption_ts >= CAPTION_MIN_INTERVAL_S:
                                            last_caption_ts = now
                                            await room.log.emit(
                                                "room_caption",
                                                "room",
                                                _caption_payload(cleaned),
                                            )
                                    else:
                                        _on_final(cleaned)
                            if not got_msg:
                                return

                    sender_task = asyncio.create_task(_sender())
                    receiver_task = asyncio.create_task(_receiver())
                    try:
                        done, pending = await asyncio.wait(
                            {sender_task, receiver_task},
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                        for task in pending:
                            task.cancel()
                        await asyncio.gather(*pending, return_exceptions=True)
                        for task in done:
                            exc = task.exception()
                            if exc is not None and not isinstance(exc, asyncio.CancelledError):
                                raise exc
                    finally:
                        for task in (sender_task, receiver_task):
                            if not task.done():
                                task.cancel()
                        await asyncio.gather(sender_task, receiver_task, return_exceptions=True)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                if client_disconnected.is_set():
                    break
                print(
                    f"[room] transcribe session closed ({run_id}): {type(exc).__name__}; reconnecting",
                    flush=True,
                )
                await asyncio.sleep(backoff_s)
                backoff_s = min(backoff_s * 1.5, 3.0)

    reader_task = asyncio.create_task(_ws_reader())
    watchdog_task = asyncio.create_task(_silence_watchdog())
    transcribe_task = asyncio.create_task(_transcribe_loop())
    try:
        await reader_task
    finally:
        client_disconnected.set()
        transcribe_task.cancel()
        watchdog_task.cancel()
        # Commit anything still in the live caption when the mic stops.
        leftover = _new_part(interim["text"]) if interim["text"] else ""
        if len(leftover.split()) >= 2:
            _spawn_utterance(leftover)
        await asyncio.gather(transcribe_task, watchdog_task, return_exceptions=True)


# ---------- 3. Utterance handling & Decisions gate ----------


def _is_echo(room: RoomState, text: str) -> bool:
    now = time.monotonic()
    room.recent_challenges = [
        (ts, ch_text) for ts, ch_text in room.recent_challenges if now - ts <= ECHO_WINDOW_S
    ]
    probe = " ".join(text.lower().split())
    if not probe:
        return False
    for _, ch_text in room.recent_challenges:
        ref = " ".join(ch_text.lower().split())
        if ref and difflib.SequenceMatcher(None, probe, ref).ratio() >= ECHO_RATIO_THRESHOLD:
            return True
    return False


def _coerce_prob(val: Any) -> float | None:
    if isinstance(val, bool):
        return 1.0 if val else 0.0
    if isinstance(val, (int, float)):
        return max(0.0, min(1.0, float(val)))
    if isinstance(val, dict) and "probability" in val:
        return _coerce_prob(val["probability"])
    if hasattr(val, "probability"):
        return _coerce_prob(getattr(val, "probability"))
    try:
        return max(0.0, min(1.0, float(val)))
    except (TypeError, ValueError):
        return None


def _get_answer(answers: Any, key: str) -> Any:
    if isinstance(answers, dict):
        return answers.get(key)
    return getattr(answers, key, None)


def _get_answer_field(ans: Any, field_name: str) -> Any:
    if ans is None:
        return None
    if isinstance(ans, dict):
        return ans.get(field_name)
    return getattr(ans, field_name, None)


def _gate_utterance_sync(pitch_line: str, utterance: str) -> tuple[float, str]:
    gate_input = chr(10).join([pitch_line, f"Utterance heard in Q&A room: {utterance}"])
    resp = beta().decisions.create(
        model=MODEL_IDS["decisions"],
        input=[text_part(gate_input)],
        questions=GATE_QUESTIONS,
    )
    answers = getattr(resp, "answers", None)
    if answers is None:
        raise ValueError("Decisions API response missing 'answers'")

    challenge_ans = _get_answer(answers, "is_challenge")
    topic_ans = _get_answer(answers, "topic")

    prob = _coerce_prob(_get_answer_field(challenge_ans, "noul"))
    if prob is None:
        prob = 0.0

    raw_topic = str(_get_answer_field(topic_ans, "choice") or "other").strip().lower()
    topic = raw_topic if raw_topic in VALID_TOPICS else "other"
    return prob, topic


SPEAKER_QUESTION = {
    "type": "choice",
    "instructions": (
        "In a live startup pitch with one founder and one or more judges, who most likely said this utterance? "
        "The founder pitches the product and answers questions about it; judges ask, challenge, react or comment."
    ),
    "criteria": {
        "founder": "the founder: pitching, describing or defending the product, or answering a question",
        "judge": "a judge: asking, challenging, reacting to or commenting on the pitch",
    },
}


def _speaker_gate_sync(
    pitch_line: str, utterance: str, mic_role: str | None, pitch_done: bool
) -> tuple[str, float, float, str]:
    """One Decisions call: who is speaking (by content, mic only as a hint) + is it a real question + topic.

    Both laptops sit in the same room with open mics, so either mic can hear either person first.
    Returns (speaker, speaker_confidence, is_challenge, topic)."""
    ctx_lines = [
        pitch_line,
        "Stage: the founder has already pitched; this is Q&A." if pitch_done else "Stage: the founder is pitching now.",
        f"(Heard first by the {mic_role}'s laptop microphone; both microphones are in the same room.)" if mic_role else "",
        f"Utterance: {utterance}",
    ]
    questions = dict(GATE_QUESTIONS)
    questions["speaker"] = SPEAKER_QUESTION
    resp = beta().decisions.create(
        model=MODEL_IDS["decisions"],
        input=[text_part(chr(10).join(l for l in ctx_lines if l))],
        questions=questions,
    )
    answers = getattr(resp, "answers", None)
    if answers is None:
        raise ValueError("Decisions API response missing 'answers'")
    sp_ans = _get_answer(answers, "speaker")
    speaker = str(_get_answer_field(sp_ans, "choice") or mic_role or "judge").strip().lower()
    if speaker not in ("founder", "judge"):
        speaker = mic_role or "judge"
    sp_conf = _coerce_prob(_get_answer_field(sp_ans, "confidence")) or 0.0
    prob = _coerce_prob(_get_answer_field(_get_answer(answers, "is_challenge"), "noul")) or 0.0
    raw_topic = str(_get_answer_field(_get_answer(answers, "topic"), "choice") or "other").strip().lower()
    return speaker, sp_conf, prob, (raw_topic if raw_topic in VALID_TOPICS else "other")


def _is_recent_duplicate(room: RoomState, text: str) -> bool:
    now = time.monotonic()
    room.recent_utterances = [
        (ts, prev) for ts, prev in room.recent_utterances if now - ts <= SESSION_DEDUPE_WINDOW_S
    ]
    probe = " ".join(text.lower().split())
    if not probe:
        return False
    def _words(t: str) -> list[str]:
        return [w.strip(".,!?\"'") for w in t.split() if w.strip(".,!?\"'")]

    pw = _words(probe)
    for _, prev in room.recent_utterances:
        ref = " ".join(prev.lower().split())
        if not ref:
            continue
        if difflib.SequenceMatcher(None, probe, ref).ratio() >= SESSION_DEDUPE_RATIO:
            return True
        # Both mics in one room transcribe the same sentence with different lengths: treat a line whose
        # words are mostly contained in a recent line (either way round) as the same sentence.
        rw = _words(ref)
        short, long_ = (pw, rw) if len(pw) <= len(rw) else (rw, pw)
        if len(short) >= 4 and len(pw) <= 1.4 * len(rw):  # a much longer new line carries new content: keep it
            long_set = set(long_)
            if sum(1 for w in short if w in long_set) / len(short) >= 0.8:
                return True
    room.recent_utterances.append((now, text))
    return False


async def handle_utterance(
    run_id: str,
    text: str,
    forced: bool = False,
    seat: int | None = None,
    role: str | None = None,
) -> None:
    """Emit room_utterance, run echo filter + Decisions gate, and schedule fallback if triggered."""
    cleaned = " ".join(str(text or "").split()).strip()
    if not cleaned:
        return

    room = _get_room(run_id)
    await _ensure_room_stage(room)

    if room.is_session:
        from pipeline import session as session_mod

        if not forced:
            if _is_recent_duplicate(room, cleaned):
                return
        else:
            now = time.monotonic()
            room.recent_utterances = [
                (ts, prev) for ts, prev in room.recent_utterances if now - ts <= SESSION_DEDUPE_WINDOW_S
            ]
            room.recent_utterances.append((now, cleaned))

        t_utterance_start = time.monotonic()
        utterance_id = f"u_{secrets.token_hex(4)}"
        t_since_start = round(max(0.0, t_utterance_start - room.room_start), 2)
        speaker = role if role in ("founder", "judge") else "judge"

        # Speaker check: both mics are open in one room, so decide WHO spoke from what was said.
        # Typed fallbacks (forced) keep the role they were sent with.
        evidence = build_evidence(room.log.events)
        pitch_line = _pitch_summary_line(evidence)
        sess_state = session_mod.get_session(run_id)
        pitch_done = bool(sess_state and sess_state.research_runs > 0)
        precomputed_gate: tuple[float, str] | None = None
        if not forced:
            t_gate_start = time.monotonic()
            try:
                speaker, sp_conf, is_ch, topic_pre = await asyncio.to_thread(
                    _speaker_gate_sync, pitch_line, cleaned, role, pitch_done
                )
                precomputed_gate = (is_ch, topic_pre)
                print(f"[room] speaker check mic={role} -> {speaker} ({sp_conf:.2f}) "
                      f"in {int((time.monotonic() - t_gate_start) * 1000)} ms", flush=True)
            except Exception as exc:  # noqa: BLE001  (fall back to the mic label)
                print(f"[room] speaker check failed ({type(exc).__name__}); using mic={role}", flush=True)

        await room.log.emit(
            "room_utterance",
            "room",
            {
                "utterance_id": utterance_id,
                "speaker": speaker,
                "speaker_label": "",
                "text": cleaned,
                "t": t_since_start,
            },
        )

        if speaker == "founder":
            await session_mod.on_founder_utterance(run_id, cleaned, room.log)
            return

        t_gate_start = time.monotonic()
        try:
            if precomputed_gate is not None:
                is_challenge, topic = precomputed_gate
            else:
                is_challenge, topic = await asyncio.to_thread(_gate_utterance_sync, pitch_line, cleaned)
        except Exception as exc:  # noqa: BLE001
            await room.log.emit(
                "error",
                "room",
                {"message": f"Room gate failed ({type(exc).__name__})", "recoverable": True},
            )
            is_challenge = 1.0 if forced else 0.0
            topic = "other"

        latency_ms = int(round(max(0.0, time.monotonic() - t_gate_start) * 1000))
        _GATE_LATENCIES_MS.append(latency_ms)

        triggered = bool(forced or is_challenge >= GATE_TRIGGER_THRESHOLD)
        await room.log.emit(
            "room_gate",
            "room",
            {
                "utterance_id": utterance_id,
                "is_challenge": round(is_challenge, 4),
                "topic": topic,
                "triggered": triggered,
                "latency_ms": latency_ms,
            },
        )

        if triggered:
            matched_question_id, prep_hint = session_mod.match_prepared_question(run_id, cleaned)
            await founder_brief(
                run_id=run_id,
                challenge_id=utterance_id,
                challenge_text=cleaned,
                t_start=t_utterance_start,
                matched_question_id=matched_question_id,
                prep_hint=prep_hint,
            )
        return

    t_utterance_start = time.monotonic()
    utterance_id = f"u_{secrets.token_hex(4)}"
    t_since_start = round(max(0.0, t_utterance_start - room.room_start), 2)

    await room.log.emit(
        "room_utterance",
        "room",
        {
            "utterance_id": utterance_id,
            "speaker": "unknown",
            "speaker_label": "",
            "text": cleaned,
            "t": t_since_start,
        },
    )

    if not forced and _is_echo(room, cleaned):
        return

    evidence = build_evidence(room.log.events)
    pitch_line = _pitch_summary_line(evidence)

    t_gate_start = time.monotonic()
    try:
        is_challenge, topic = await asyncio.to_thread(_gate_utterance_sync, pitch_line, cleaned)
    except Exception as exc:  # noqa: BLE001
        await room.log.emit(
            "error",
            "room",
            {"message": f"Room gate failed ({type(exc).__name__})", "recoverable": True},
        )
        is_challenge = 1.0 if forced else 0.0
        topic = "other"

    latency_ms = int(round(max(0.0, time.monotonic() - t_gate_start) * 1000))
    _GATE_LATENCIES_MS.append(latency_ms)

    triggered = bool(forced or is_challenge >= GATE_TRIGGER_THRESHOLD)
    await room.log.emit(
        "room_gate",
        "room",
        {
            "utterance_id": utterance_id,
            "is_challenge": round(is_challenge, 4),
            "topic": topic,
            "triggered": triggered,
            "latency_ms": latency_ms,
        },
    )

    if triggered:
        pending = PendingUtterance(
            utterance_id=utterance_id,
            text=cleaned,
            t_start=t_utterance_start,
            preferred_seat=seat,
        )
        room.pending[utterance_id] = pending
        pending.task = asyncio.create_task(
            _server_fallback_after(run_id, utterance_id, cleaned, delay=FALLBACK_DELAY_S)
        )


# ---------- 4. Ephemeral Live twin token ----------


def _twin_system_instruction(seat: int, role: str, ev_text: str) -> str:
    return (
        f"You are the digital twin of judge seat {seat}, a {role} at a live startup pitch. "
        "When the judge's words arrive, say ONE short spoken challenge (max 2 sentences, "
        "sharp and specific to this startup) AND call challenge_founder with exactly that text. "
        f"Use these facts from our analysis when relevant:{chr(10)}{ev_text}"
    )


def twin_token(run_id: str, seat: int) -> dict[str, str]:
    """Mint a single-use constrained ephemeral Gemini Live token for a judge twin seat."""
    room = _get_room(run_id)
    role = _get_seat_role(room, seat)
    evidence = build_evidence(room.log.events)
    ev_text = evidence_text(evidence)
    system_instruction = _twin_system_instruction(seat, role, ev_text)

    now = datetime.now(timezone.utc)
    tok = _alpha_client().auth_tokens.create(
        config=types.CreateAuthTokenConfig(
            uses=1,
            expire_time=(now + timedelta(minutes=30)).isoformat(),
            new_session_expire_time=(now + timedelta(minutes=2)).isoformat(),
            live_connect_constraints=types.LiveConnectConstraints(
                model=MODEL_IDS["live_voice"],
                config=types.LiveConnectConfig(
                    response_modalities=["AUDIO"],
                    system_instruction=system_instruction,
                    tools=[CHALLENGE_TOOL],
                    output_audio_transcription={},
                ),
            ),
        )
    )

    token_name = getattr(tok, "name", None)
    if not token_name:
        raise RuntimeError("Auth token response missing token name")

    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and token_name == api_key:
        raise RuntimeError("Refusing to return API key as ephemeral token")

    return {
        "ephemeral_token": str(token_name),
        "model": MODEL_IDS["live_voice"],
        "system_instruction": system_instruction,
    }


# ---------- 5 & 6. Challenge posting & server fallback ----------


def _clean_challenge_text(text: str) -> str:
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    cleaned = re.sub(r"^\s*[-*•]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = " ".join(cleaned.split()).strip().strip('"').strip("'")
    return cleaned


async def post_challenge(
    run_id: str,
    seat: int,
    text: str,
    utterance_id: str | None,
    source: str = "live",
    audio_url: str | None = None,
    challenge_id: str | None = None,
) -> None:
    """Record a twin challenge, cancel any pending fallback, emit twin_challenge, and build founder_brief."""
    room = _get_room(run_id)
    await _ensure_room_stage(room)

    cleaned = _clean_challenge_text(text)
    if not cleaned:
        return

    t_start = time.monotonic()
    if utterance_id:
        pending = room.pending.pop(utterance_id, None)
        if pending is None and source == "server":
            # Already answered by a live twin before fallback finished.
            return
        if pending is not None:
            t_start = pending.t_start
            if pending.task is not None and pending.task is not asyncio.current_task():
                pending.task.cancel()

    now = time.monotonic()
    room.recent_challenges = [
        (ts, ch_text) for ts, ch_text in room.recent_challenges if now - ts <= ECHO_WINDOW_S
    ]
    # Duplicate guard: a Live twin sometimes calls challenge_founder twice with the same text
    # (seen in the 3:14 PM hotspot test). Drop near-identical challenges within 20 s.
    if any(
        now - ts <= 20 and difflib.SequenceMatcher(None, cleaned.lower(), ch_text.lower()).ratio() >= 0.85
        for ts, ch_text in room.recent_challenges
    ):
        return
    room.recent_challenges.append((now, cleaned))

    cid = challenge_id or f"c_{secrets.token_hex(4)}"
    role = _get_seat_role(room, seat)

    await room.log.emit(
        "twin_challenge",
        "room",
        {
            "challenge_id": cid,
            "utterance_id": utterance_id,
            "seat": seat,
            "role": role,
            "text": cleaned,
            "audio_url": audio_url,
            "source": source,
        },
    )

    await founder_brief(run_id, cid, cleaned, t_start)


async def _server_fallback_after(
    run_id: str,
    utterance_id: str,
    text: str,
    delay: float = FALLBACK_DELAY_S,
) -> None:
    """If no Live twin answered within `delay` seconds, generate the challenge + TTS server-side."""
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        return

    room = ROOMS.get(run_id)
    if room is None:
        return
    pending = room.pending.get(utterance_id)
    if pending is None:
        return

    seat = _pick_next_seat(room, preferred_seat=pending.preferred_seat)
    role = _get_seat_role(room, seat)
    evidence = build_evidence(room.log.events)
    ev_text = evidence_text(evidence)

    prompt = f"""{_twin_system_instruction(seat, role, ev_text)}

Respond with ONLY the spoken challenge itself (max 2 sentences, plain spoken words, no markdown, no quotes, no speaker prefix).

Judge said out loud: {text!r}"""

    try:
        raw_challenge = await asyncio.to_thread(
            generate_text,
            MODEL_IDS["room_twin"],
            prompt,
            "low",
        )
        challenge_text = _clean_challenge_text(raw_challenge) or text
    except Exception as exc:  # noqa: BLE001
        await room.log.emit(
            "error",
            "room",
            {"message": f"Server twin fallback failed ({type(exc).__name__})", "recoverable": True},
        )
        challenge_text = text

    if utterance_id not in room.pending:
        return

    challenge_id = f"c_{secrets.token_hex(4)}"
    wav_path = room.ctx.run_dir / "room" / f"{challenge_id}.wav"
    audio_url: str | None = None
    try:
        ok = await asyncio.to_thread(_synthesize_wav, challenge_text, FALLBACK_VOICE, wav_path)
        if ok:
            audio_url = room.ctx.artifact_url(wav_path)
    except Exception:  # noqa: BLE001
        audio_url = None

    if utterance_id not in room.pending:
        return

    await post_challenge(
        run_id=run_id,
        seat=seat,
        text=challenge_text,
        utterance_id=utterance_id,
        source="server",
        audio_url=audio_url,
        challenge_id=challenge_id,
    )


# ---------- 7. Founder brief & code-based number checker ----------


def _extract_numbers_with_raw(text: str) -> list[tuple[str, float]]:
    results: list[tuple[str, float]] = []
    for match in _NUM_RE.findall(text):
        cleaned = match.replace("$", "").replace(",", "").replace("%", "")
        try:
            results.append((match, float(cleaned)))
        except ValueError:
            continue
    return results


def _extract_numbers(text: str) -> list[float]:
    return [val for _, val in _extract_numbers_with_raw(text)]


def _build_evidence_numbers(evidence: dict[str, Any], ev_text: str) -> set[float]:
    nums: set[float] = set()

    def _add(v: Any) -> None:
        fv = _as_float(v)
        if fv is not None:
            nums.add(fv)

    pitch = evidence.get("pitch") or {}
    _add(pitch.get("price_usd"))

    spec = evidence.get("spec") or {}
    _add(spec.get("price_usd"))

    for c in evidence.get("competitors") or []:
        _add(c.get("price_usd"))

    lab = evidence.get("lab") or {}
    _add(lab.get("total"))
    _add(lab.get("converted"))
    _add(lab.get("quit"))

    swarm = evidence.get("swarm") or {}
    _add(swarm.get("personas"))
    _add(swarm.get("intent_mean"))
    for v in (swarm.get("rubrics") or {}).values():
        _add(v)

    verdict = evidence.get("verdict") or {}
    _add(verdict.get("launch_probability"))
    _add(verdict.get("market_intent"))
    _add(verdict.get("confidence"))

    for raw, val in _extract_numbers_with_raw(ev_text):
        nums.add(val)
        if raw.endswith("%") and 0.0 <= val <= 100.0:
            nums.add(val / 100.0)

    return nums


def _number_in_evidence(num: float, ev_numbers: set[float], tol: float = 0.005) -> bool:
    for ev in ev_numbers:
        if abs(num - ev) <= tol:
            return True
        if 0.0 <= ev <= 1.0 and 0.0 <= num <= 100.0 and abs((num / 100.0) - ev) <= tol:
            return True
    return False


def _fallback_proof_pill(evidence: dict[str, Any]) -> dict[str, str]:
    rubrics = (evidence.get("swarm") or {}).get("rubrics") or {}
    if rubrics:
        lowest_key, lowest_val = min(rubrics.items(), key=lambda kv: kv[1])
        return {
            "label": "Lowest buyer score",
            "value": f"{lowest_key} {lowest_val:.2f}",
            "source": "swarm",
        }

    verdict = evidence.get("verdict") or {}
    if verdict.get("launch_probability") is not None:
        lp = verdict["launch_probability"]
        return {
            "label": "Launch probability",
            "value": _fmt_prob(lp),
            "source": "analyst",
        }

    lab = evidence.get("lab") or {}
    if lab.get("total"):
        return {
            "label": "Usability lab",
            "value": f"{lab.get('quit', 0)}/{lab.get('total', 0)} quit",
            "source": "lab",
        }

    spec = evidence.get("spec") or {}
    if spec.get("price_usd") is not None:
        return {
            "label": "Target price",
            "value": _fmt_price(spec["price_usd"]),
            "source": "boardroom",
        }

    return {
        "label": "Analysis",
        "value": "Evidence pending",
        "source": "analyst",
    }


def _check_proof_pills(
    raw_proof: Any,
    evidence: dict[str, Any],
    ev_numbers: set[float],
    run_id: str,
    challenge_id: str,
) -> list[dict[str, str]]:
    kept: list[dict[str, str]] = []
    checked_here = 0
    dropped_here = 0

    if isinstance(raw_proof, list):
        for item in raw_proof:
            if not isinstance(item, dict):
                continue
            label = " ".join(str(item.get("label") or "").split()).strip()
            value = " ".join(str(item.get("value") or "").split()).strip()
            source = str(item.get("source") or "analyst").strip().lower()
            if source not in VALID_PROOF_SOURCES:
                source = "analyst"
            if not label or not value:
                continue

            checked_here += 1
            CHECKER_STATS["pills"] += 1

            nums = _extract_numbers(value)
            if all(_number_in_evidence(n, ev_numbers) for n in nums):
                kept.append({"label": label, "value": value, "source": source})
            else:
                dropped_here += 1
                CHECKER_STATS["dropped"] += 1

    print(
        f"[room] number checker run={run_id} challenge={challenge_id} "
        f"checked={checked_here} dropped={dropped_here} totals={CHECKER_STATS}",
        flush=True,
    )

    if not kept:
        kept = [_fallback_proof_pill(evidence)]
    return kept[:2]


def _trim_founder_line(line: str, max_words: int = MAX_FOUNDER_LINE_WORDS) -> str:
    cleaned = _clean_challenge_text(line)
    words = cleaned.split()
    if len(words) <= max_words:
        return cleaned
    trimmed = " ".join(words[:max_words]).rstrip(",;:-")
    if trimmed and trimmed[-1] not in ".!?":
        trimmed += "."
    return trimmed


def _support_badge_sync(ev_text: str, challenge_text: str) -> tuple[str, float]:
    support_input = f"""OUR ANALYSIS EVIDENCE:
{ev_text}

JUDGE CHALLENGE:
{challenge_text}"""
    resp = beta().decisions.create(
        model=MODEL_IDS["decisions"],
        input=[text_part(support_input)],
        questions=SUPPORT_QUESTIONS,
    )
    answers = getattr(resp, "answers", None)
    if answers is None:
        raise ValueError("Decisions API response missing 'answers'")

    ans = _get_answer(answers, "support")
    raw_choice = str(_get_answer_field(ans, "choice") or "partial").strip().lower()
    badge_map = {
        "verified": "VERIFIED",
        "partial": "PARTIAL",
        "push_back": "PUSH_BACK",
    }
    badge = badge_map.get(raw_choice, "PARTIAL")

    raw_conf = _get_answer_field(ans, "confidence")
    conf = _coerce_prob(raw_conf)
    if conf is None:
        conf = 0.5
    return badge, conf


def _generate_founder_brief_sync(
    ev_text: str,
    challenge_text: str,
    prep_hint: dict[str, Any] | None = None,
) -> dict[str, Any]:
    hint_section = ""
    if isinstance(prep_hint, dict) and (prep_hint.get("line") or prep_hint.get("points")):
        pts = "; ".join(str(p) for p in (prep_hint.get("points") or []) if p)
        hint_section = f"""
Prepared answer hint for a closely matching question (adapt tightly to what the judge actually asked, keeping <= 14 words):
- Suggested line: {prep_hint.get("line") or ""}
- Points: {pts}
- Evidence: {prep_hint.get("evidence") or ""}
"""

    prompt = f"""You are a live teleprompter coaching a startup founder answering a judge on stage.

Judge challenge:
{challenge_text}

Evidence from our analysis (ONLY use facts and exact numbers from here):
{ev_text}
{hint_section}
Return ONLY JSON matching the schema:
- "line": the headline of the answer: ONE sharp first-person sentence ("We ...", "Our ..."), 14 words or fewer.
- "answer": the FULL answer the founder will read out loud word for word: one natural spoken paragraph of 60-90 words, first person, confident and honest. Answer exactly what the judge asked; name what we are building and why it wins; use concrete names and numbers from the evidence; if the evidence is against us, concede briefly and give the specific plan. No bullet points, no markdown, no quotes.
- "proof": 1 to 2 short proof pills backed by the evidence above:
  - "label": concise 2-4 word label
  - "value": concise value with EXACT numbers copied verbatim from the evidence above (never invent or alter numbers)
  - "source": one of "swarm", "lab", "analyst", "competitors", "boardroom"
"""
    raw = generate_json(
        model=MODEL_IDS["room_founder"],
        parts=[text_part(prompt)],
        schema=FOUNDER_BRIEF_SCHEMA,
        thinking="low",
    )
    return raw if isinstance(raw, dict) else {}


async def founder_brief(
    run_id: str,
    challenge_id: str,
    challenge_text: str,
    t_start: float,
    matched_question_id: str | None = None,
    prep_hint: dict[str, Any] | None = None,
) -> None:
    """Compute evidence-support badge + 14-word teleprompter line + code-verified proof pills."""
    room = _get_room(run_id)
    evidence = build_evidence(room.log.events)
    ev_text = evidence_text(evidence)
    ev_numbers = _build_evidence_numbers(evidence, ev_text)

    async def _get_badge() -> tuple[str, float]:
        try:
            return await asyncio.to_thread(_support_badge_sync, ev_text, challenge_text)
        except Exception as exc:  # noqa: BLE001
            await room.log.emit(
                "error",
                "room",
                {"message": f"Founder badge check failed ({type(exc).__name__})", "recoverable": True},
            )
            return "PARTIAL", 0.5

    async def _get_copy() -> dict[str, Any]:
        try:
            return await asyncio.to_thread(_generate_founder_brief_sync, ev_text, challenge_text, prep_hint)
        except Exception as exc:  # noqa: BLE001
            await room.log.emit(
                "error",
                "room",
                {"message": f"Founder brief copy failed ({type(exc).__name__})", "recoverable": True},
            )
            return {}

    (badge, badge_confidence), copy_data = await asyncio.gather(_get_badge(), _get_copy())

    line = _trim_founder_line(str(copy_data.get("line") or ""))
    if not line:
        line = "Fair concern; our test data flagged this exact risk and we're fixing it."

    proof = _check_proof_pills(copy_data.get("proof"), evidence, ev_numbers, run_id, challenge_id)

    latency_ms = int(round(max(0.0, time.monotonic() - t_start) * 1000))
    _BRIEF_LATENCIES_MS.append(latency_ms)

    payload: dict[str, Any] = {
        "challenge_id": challenge_id,
        "badge": badge,
        "badge_confidence": round(badge_confidence, 4),
        "line": line,
        "answer": " ".join(str(copy_data.get("answer") or "").split()) or line,
        "proof": proof,
        "latency_ms": latency_ms,
    }
    if room.is_session:
        payload["matched_question_id"] = matched_question_id

    await room.log.emit("founder_brief", "room", payload)

    # Live sessions: research THIS question on the web and push an updated card ~15-20 s later.
    if room.is_session:
        from pipeline import session as _session  # local import avoids a cycle

        task = asyncio.create_task(
            _session.web_check_answer(run_id, challenge_id, challenge_text, line, badge, room.log)
        )
        _session._track_task(task, f"web_check:{challenge_id}")
