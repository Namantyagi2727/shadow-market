"""Pitch extraction stage: converts webcam pitch video or raw text into structured Pitch JSON."""

from __future__ import annotations

import asyncio
import re
from typing import Any

from pipeline.context import Emit, RunContext
from pipeline.llm import MODEL_IDS, generate_json, text_part, video_part

PITCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "one_liner": {"type": "string"},
        "target_user": {"type": "string"},
        "price_usd": {"type": ["number", "null"]},
        "features": {
            "type": "array",
            "items": {"type": "string"},
        },
        "sketch_notes": {"type": "string"},
    },
    "required": [
        "title",
        "one_liner",
        "target_user",
        "price_usd",
        "features",
        "sketch_notes",
    ],
    "additionalProperties": False,
}

VIDEO_INSTRUCTIONS = """Watch and listen to this founder pitch video carefully and extract a structured product pitch.
Return ONLY valid JSON matching the schema with these fields:
- title: concise product name (2-5 words).
- one_liner: clear one-sentence description of what the product is and what problem it solves.
- target_user: specific description of the intended buyer or user.
- price_usd: numeric price in USD if mentioned or shown, otherwise null.
- features: list of 3-6 concrete product features or claims mentioned or shown.
- sketch_notes: detailed description of any sketch, whiteboard drawing, physical prototype, or prop held up to the camera; empty string "" if none is shown."""

TEXT_INSTRUCTIONS = """Read this founder pitch carefully and extract a structured product pitch.
Return ONLY valid JSON matching the schema with these fields:
- title: concise product name (2-5 words).
- one_liner: clear one-sentence description of what the product is and what problem it solves.
- target_user: specific description of the intended buyer or user.
- price_usd: numeric price in USD if mentioned, otherwise null.
- features: list of 3-6 concrete product features or claims mentioned.
- sketch_notes: description of any sketch or prototype details described; empty string "" if none."""


def _parse_price(value: Any) -> float | int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value if value >= 0 else None
    if isinstance(value, str):
        cleaned = re.sub(r"[^0-9.]", "", value)
        if not cleaned:
            return None
        try:
            num = float(cleaned)
            return int(num) if num.is_integer() else round(num, 2)
        except ValueError:
            return None
    return None


def _normalize_pitch(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("Pitch extraction returned non-object JSON")

    raw_features = raw.get("features")
    if isinstance(raw_features, list):
        features = [str(item).strip() for item in raw_features if str(item).strip()]
    else:
        features = []

    title = str(raw.get("title") or "").strip() or "Untitled Product"
    one_liner = str(raw.get("one_liner") or "").strip() or title
    target_user = str(raw.get("target_user") or "").strip() or "Everyday consumers"
    sketch_notes = str(raw.get("sketch_notes") or "").strip()

    return {
        "title": title,
        "one_liner": one_liner,
        "target_user": target_user,
        "price_usd": _parse_price(raw.get("price_usd")),
        "features": features,
        "sketch_notes": sketch_notes,
    }


async def run(ctx: RunContext, emit: Emit) -> None:
    if ctx.pitch_video is not None:
        v_part = await asyncio.to_thread(video_part, ctx.pitch_video, False)
        parts: list[dict[str, Any]] = [v_part, text_part(VIDEO_INSTRUCTIONS)]
    else:
        raw_text = str((ctx.pitch or {}).get("raw_text") or "").strip()
        if not raw_text:
            raise ValueError("Pitch stage requires either ctx.pitch_video or ctx.pitch['raw_text']")
        parts = [text_part(f"""{TEXT_INSTRUCTIONS}

Founder pitch:
{raw_text}""")]

    raw_result = await asyncio.to_thread(
        generate_json,
        MODEL_IDS["pitch_extract"],
        parts,
        PITCH_SCHEMA,
        "low",
    )

    pitch_data = _normalize_pitch(raw_result)
    ctx.pitch = pitch_data
    await emit("pitch_parsed", "pitch", pitch_data)
