"""Quit analysis stage: locate confusion and quit timestamps for personas that quit."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from pipeline.context import Emit, RunContext
from pipeline.llm import MODEL_IDS, generate_json, text_part, video_part

PER_VIDEO_TIMEOUT_S = 75.0
VALID_KINDS = {"confusion", "quit"}

MARKERS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "markers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "t": {"type": "number"},
                    "kind": {"type": "string", "enum": ["confusion", "quit"]},
                    "note": {"type": "string"},
                },
                "required": ["t", "kind", "note"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["markers"],
    "additionalProperties": False,
}


def _fallback_markers(result: dict[str, Any]) -> list[dict[str, Any]]:
    actions = result.get("actions") or []
    markers: list[dict[str, Any]] = []
    prev_action: str | None = None
    has_quit = False

    for entry in actions:
        action = str(entry.get("action") or "").lower()
        t = round(max(0.0, float(entry.get("t", 0.0))), 2)
        thought = str(entry.get("thought") or "").strip()

        if action == "quit":
            has_quit = True
            markers.append(
                {
                    "t": t,
                    "kind": "quit",
                    "note": thought or str(result.get("quit_reason") or "Quit the page"),
                }
            )
        elif action == "wait":
            markers.append(
                {
                    "t": t,
                    "kind": "confusion",
                    "note": thought or "Paused and hesitated on the page",
                }
            )
        elif action == "scroll" and prev_action == "scroll":
            markers.append(
                {
                    "t": t,
                    "kind": "confusion",
                    "note": thought or "Scrolled repeatedly looking for missing information",
                }
            )

        prev_action = action

    if not has_quit:
        last_t = (
            float(actions[-1].get("t", 0.0))
            if actions
            else float(result.get("duration_s") or 0.0)
        )
        note = (
            str(result.get("quit_reason") or "").strip()
            or (str(actions[-1].get("thought") or "").strip() if actions else "")
            or "Abandoned page without converting"
        )
        markers.append({"t": round(max(0.0, last_t), 2), "kind": "quit", "note": note})

    markers.sort(key=lambda m: m["t"])
    return markers


def _normalize_markers(raw: Any, duration_s: float) -> list[dict[str, Any]]:
    items = raw.get("markers") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return []

    markers: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            t = float(item.get("t"))
        except (TypeError, ValueError):
            continue
        if t < 0:
            t = 0.0
        if duration_s > 0 and t > duration_s:
            t = duration_s

        kind = str(item.get("kind") or "confusion").strip().lower()
        if kind not in VALID_KINDS:
            kind = "confusion"

        note = str(item.get("note") or "").strip()
        if not note:
            continue

        markers.append({"t": round(t, 2), "kind": kind, "note": note[:180]})

    markers.sort(key=lambda m: m["t"])
    return markers


def _analyze_video_sync(video_path: Path, result: dict[str, Any]) -> list[dict[str, Any]]:
    actions_summary = [
        {
            "t": a.get("t"),
            "action": a.get("action"),
            "target": a.get("target"),
            "thought": a.get("thought"),
        }
        for a in (result.get("actions") or [])
    ]
    prompt = f"""Watch this usability-test recording of a website visitor who quit without buying.
Identify key timestamps (in seconds from the start of the video) where the visitor shows:
- "confusion": hesitation, dead clicks, repeated scrolling, layout trouble, or distrust
- "quit": the moment the visitor decides to give up and leave

Session duration: {result.get("duration_s")}s
Final quit reason: {result.get("quit_reason")}
Recorded action log:
{json.dumps(actions_summary, indent=2)}

Return ONLY JSON matching the schema: {{"markers": [{{"t": seconds, "kind": "confusion"|"quit", "note": "short concise note"}}]}}."""

    vpart = video_part(video_path, agentic=False)
    raw = generate_json(
        model=MODEL_IDS["quit_analyzer"],
        parts=[vpart, text_part(prompt)],
        schema=MARKERS_SCHEMA,
        thinking="low",
    )
    return _normalize_markers(raw, float(result.get("duration_s") or 0.0))


async def _analyze_persona(
    result: dict[str, Any],
    ctx: RunContext,
    emit: Emit,
) -> tuple[str, list[dict[str, Any]]]:
    persona_id = str(result["persona_id"])
    video_path = ctx.run_dir / "lab" / f"{persona_id}.webm"

    markers: list[dict[str, Any]] = []
    if video_path.exists() and video_path.stat().st_size > 0:
        try:
            markers = await asyncio.wait_for(
                asyncio.to_thread(_analyze_video_sync, video_path, result),
                timeout=PER_VIDEO_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            await emit(
                "error",
                "lab",
                {
                    "message": f"Quit video analysis timed out for {persona_id}; using action-log markers.",
                    "recoverable": True,
                },
            )
        except Exception as exc:
            await emit(
                "error",
                "lab",
                {
                    "message": f"Quit video analysis failed for {persona_id} ({type(exc).__name__}); using action-log markers.",
                    "recoverable": True,
                },
            )
    else:
        await emit(
            "error",
            "lab",
            {
                "message": f"Recording missing for {persona_id}; using action-log markers.",
                "recoverable": True,
            },
        )

    if not markers:
        markers = _fallback_markers(result)

    ctx.quit_markers[persona_id] = markers
    await emit(
        "quit_markers",
        "lab",
        {
            "persona_id": persona_id,
            "markers": markers,
        },
    )
    return persona_id, markers


async def run(ctx: RunContext, emit: Emit) -> None:
    quitters = [r for r in ctx.lab_results if r.get("outcome") == "quit"]
    if not quitters:
        return

    await asyncio.gather(*[_analyze_persona(result, ctx, emit) for result in quitters])

    out_path = ctx.run_dir / "lab" / "quit_markers.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(ctx.quit_markers, indent=2), encoding="utf-8")
