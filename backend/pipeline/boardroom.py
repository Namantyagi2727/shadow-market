"""Boardroom stage: 4-turn strategist vs. skeptic debate with best-effort TTS, followed by V1 spec."""

from __future__ import annotations

import asyncio
import base64
import json
import re
import wave
from pathlib import Path
from typing import Any

from google.genai import types

from pipeline.context import Emit, RunContext
from pipeline.llm import MODEL_IDS, beta, client, generate_json, generate_text

SPEC_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "price_usd": {"type": "number"},
        "pages": {
            "type": "array",
            "items": {"type": "string"},
        },
        "risks": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["headline", "price_usd", "pages", "risks"],
    "additionalProperties": False,
}

VOICES: dict[str, str] = {
    "strategist": "Kore",
    "skeptic": "Fenrir",
}


def _format_competitors(competitors: list[dict[str, Any]]) -> str:
    if not competitors:
        return "None retrieved yet."
    lines: list[str] = []
    for item in competitors:
        title = item.get("title") or "Unknown"
        price = item.get("price_usd")
        price_str = f"${price}" if price is not None else "price unknown"
        lines.append(f"- {title} ({price_str})")
    return chr(10).join(lines)


def _format_transcript(turns: list[dict[str, Any]]) -> str:
    if not turns:
        return "(No prior turns)"
    return chr(10).join(f"{t['speaker'].upper()}: {t['text']}" for t in turns)


def _clean_spoken_text(text: str) -> str:
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    cleaned = re.sub(r"^\s*[-*•]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _synthesize_wav(text: str, voice_name: str, wav_path: Path) -> bool:
    """Best-effort TTS via Gemini Flash TTS. Writes a 24 kHz 16-bit mono WAV file."""
    # Gemini 3.8 TTS: v1beta Interactions API; returns a ready WAV in output_audio.data (base64).
    resp = beta().interactions.create(
        model=MODEL_IDS["tts"],
        input=text,
        response_modalities=["audio"],
        generation_config={"speech_config": [{"voice": voice_name}]},
    )

    audio_bytes: bytes | None = None
    out = getattr(resp, "output_audio", None)
    raw_data = getattr(out, "data", None) if out is not None else None
    if raw_data:
        audio_bytes = raw_data if isinstance(raw_data, bytes) else base64.b64decode(raw_data)

    if not audio_bytes:
        return False

    wav_path.parent.mkdir(parents=True, exist_ok=True)
    if audio_bytes[:4] == b"RIFF":
        wav_path.write_bytes(audio_bytes)
    else:
        with wave.open(str(wav_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(audio_bytes)

    return wav_path.exists() and wav_path.stat().st_size > 44


def _normalize_spec(raw: Any, pitch: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}

    fallback_price = pitch.get("price_usd")
    if not isinstance(fallback_price, (int, float)) or isinstance(fallback_price, bool):
        fallback_price = 29

    raw_price = raw.get("price_usd")
    if isinstance(raw_price, (int, float)) and not isinstance(raw_price, bool) and raw_price > 0:
        price_usd: float | int = raw_price
    else:
        price_usd = fallback_price

    raw_pages = raw.get("pages")
    pages = (
        [str(p).strip() for p in raw_pages if str(p).strip()]
        if isinstance(raw_pages, list)
        else []
    )
    if not pages:
        pages = ["Hero & Offer", "How It Works", "Shipping & Returns", "2-Step Checkout"]

    raw_risks = raw.get("risks")
    risks = (
        [str(r).strip() for r in raw_risks if str(r).strip()]
        if isinstance(raw_risks, list)
        else []
    )
    if not risks:
        risks = ["Unproven brand trust", "Price sensitivity versus established alternatives"]

    headline = str(raw.get("headline") or "").strip() or str(
        pitch.get("one_liner") or pitch.get("title") or "Launch Offer"
    )

    return {
        "headline": headline,
        "price_usd": price_usd,
        "pages": pages,
        "risks": risks,
    }


async def run(ctx: RunContext, emit: Emit) -> None:
    pitch = ctx.pitch or {}
    pitch_json = json.dumps(pitch, indent=2)
    boardroom_dir = ctx.run_dir / "boardroom"
    boardroom_dir.mkdir(parents=True, exist_ok=True)

    turn_plan: list[tuple[str, str, str]] = [
        (
            "strategist",
            MODEL_IDS["strategist"],
            "Propose a sharp, concrete V1 product positioning, price point, and single-page landing-page plan to validate demand today.",
        ),
        (
            "skeptic",
            MODEL_IDS["skeptic"],
            "Attack the strategist's plan hard and concretely. Tear into the price, buyer trust, competing alternatives, and landing-page/checkout UX friction.",
        ),
        (
            "strategist",
            MODEL_IDS["strategist"],
            "Revise your V1 product, pricing, and landing-page plan to directly answer the skeptic's toughest objections with concrete changes.",
        ),
        (
            "skeptic",
            MODEL_IDS["skeptic"],
            "Give your final blunt objections and the top remaining risks that could still sink this launch.",
        ),
    ]

    prev_emit: asyncio.Task | None = None
    for turn_idx, (speaker, model_id, directive) in enumerate(turn_plan, start=1):
        competitors_block = _format_competitors(ctx.competitors)
        transcript_block = _format_transcript(ctx.boardroom)

        prompt = f"""You are the {speaker} in a fast-paced product launch boardroom.
Style rules: natural spoken dialogue (this will be read aloud), direct and concrete, NO markdown, NO bullet points, NO speaker label prefix, strictly 90 words or fewer.

Product pitch:
{pitch_json}

Real Shopify competitors found:
{competitors_block}

Boardroom transcript so far:
{transcript_block}

Your task for turn {turn_idx}: {directive}"""

        try:
            raw_text = await asyncio.to_thread(generate_text, model_id, prompt, "medium")
            text = _clean_spoken_text(raw_text)
        except Exception as exc:  # noqa: BLE001
            await emit(
                "error",
                "boardroom",
                {"message": f"Boardroom turn {turn_idx} failed ({type(exc).__name__})", "recoverable": True},
            )
            text = (
                f"Focus V1 on {pitch.get('title', 'the product')} with clear pricing and transparent shipping."
                if speaker == "strategist"
                else "Buyers will still question price, delivery reliability, and why this beats existing options."
            )

        # Voice is generated in the background while the next turn is written; events still go out in order.
        wav_path = boardroom_dir / f"turn_{turn_idx}.wav"
        turn_data: dict[str, Any] = {
            "speaker": speaker,
            "model": model_id,
            "text": text,
            "audio_url": None,
        }
        ctx.boardroom.append(turn_data)
        tts_task = asyncio.create_task(asyncio.to_thread(_synthesize_wav, text, VOICES[speaker], wav_path))

        async def _emit_in_order(prev, tts_task=tts_task, turn_data=turn_data, wav_path=wav_path):
            if prev is not None:
                await prev
            try:
                if await tts_task:
                    turn_data["audio_url"] = ctx.artifact_url(wav_path)
            except Exception:  # noqa: BLE001
                turn_data["audio_url"] = None
            await emit("boardroom_turn", "boardroom", turn_data)

        prev_emit = asyncio.create_task(_emit_in_order(prev_emit))

    spec_prompt = f"""You are the strategist finalizing the V1 landing-page launch spec after the boardroom debate.
Return ONLY valid JSON matching the schema:
- headline: punchy hero headline addressing the real value proposition.
- price_usd: final agreed V1 numeric price in USD.
- pages: 3-6 concise section/page names to include in the single-page MVP.
- risks: 3-5 concrete launch risks raised by the skeptic.

Product pitch:
{pitch_json}

Real Shopify competitors found:
{_format_competitors(ctx.competitors)}

Boardroom transcript:
{_format_transcript(ctx.boardroom)}"""

    try:
        raw_spec = await asyncio.to_thread(
            generate_json,
            MODEL_IDS["strategist"],
            spec_prompt,
            SPEC_SCHEMA,
            "medium",
        )
    except Exception as exc:  # noqa: BLE001
        await emit(
            "error",
            "boardroom",
            {"message": f"Spec generation failed ({type(exc).__name__}); using fallback spec", "recoverable": True},
        )
        raw_spec = {}

    spec = _normalize_spec(raw_spec, pitch)
    ctx.spec = spec
    if prev_emit is not None:
        await prev_emit  # all turns emitted before the spec
    await emit("spec_ready", "boardroom", spec)
