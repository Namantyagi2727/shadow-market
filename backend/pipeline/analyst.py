"""Launch-probability analyst: the number on the verdict.

Uses the exact prompt and input format that won the backtest (eval/RESULTS.md: single gemini-4-neon,
text only, test ROC-AUC 0.88, Brier 0.146, mean prediction 0.49 vs 0.50 actual). The swarm, browser
lab and boardroom explain *why*; they do not set the number.
"""

from __future__ import annotations

import asyncio
from typing import Any

from pipeline.context import RunContext
from pipeline.llm import MODEL_IDS, generate_json

# Same wording as eval/run_eval.py SINGLE_PROMPT_INSTRUCTION. Keep them identical.
ANALYST_PROMPT = (
    "You are an expert venture analyst. Estimate the calibrated probability (0 to 1) "
    "that this crowdfunding campaign reaches 100% of its funding goal."
)
ANALYST_SCHEMA = {
    "type": "object",
    "properties": {"probability": {"type": "number"}, "reason": {"type": "string"}},
    "required": ["probability", "reason"],
}
FRAMING_SCHEMA = {
    "type": "object",
    "properties": {
        "category_slug": {"type": "string"},
        "goal_usd": {"type": "number"},
    },
    "required": ["category_slug", "goal_usd"],
}

_PREFETCH: dict[str, asyncio.Task] = {}


def _campaign_text(pitch: dict[str, Any], category_slug: str, goal_usd: float) -> str:
    # Same layout as eval/run_eval.py _format_campaign_text.
    top = category_slug.split("/")[0]
    return (
        f"Campaign Name: {pitch.get('title', '')}\n"
        f"Blurb: {pitch.get('one_liner', '')}\n"
        f"Category: {category_slug} (top-level: {top})\n"
        f"Funding Goal: ${goal_usd:,.0f} USD"
    )


def _analyse_sync(pitch: dict[str, Any]) -> dict[str, Any]:
    # A live pitch has no Kickstarter category or goal, so frame it as one first.
    framing = generate_json(
        MODEL_IDS["pitch_extract"],
        "Frame this product pitch as a Kickstarter campaign. Pick the Kickstarter category slug "
        "(e.g. technology/gadgets, design/product design, food/drinks, games/tabletop games) and the "
        "funding goal in USD a first-time founder would realistically set for a first production run. "
        f"If the pitch states a goal, use it.\n\nPitch: {pitch}",
        FRAMING_SCHEMA,
        thinking="low",
    )
    text = _campaign_text(pitch, str(framing["category_slug"]), float(framing["goal_usd"]))
    out = generate_json(MODEL_IDS["strategist"], f"{ANALYST_PROMPT}\n\n{text}", ANALYST_SCHEMA, thinking="medium")
    p = max(0.0, min(1.0, float(out["probability"])))
    return {"probability": p, "reason": str(out["reason"]), "campaign_text": text}


def prefetch(ctx: RunContext) -> None:
    """Start right after the pitch; it only needs ctx.pitch (like the backtest, which saw only the campaign)."""
    _PREFETCH[ctx.run_id] = asyncio.create_task(asyncio.to_thread(_analyse_sync, dict(ctx.pitch or {})))


async def get(ctx: RunContext) -> dict[str, Any]:
    task = _PREFETCH.pop(ctx.run_id, None)
    return await (task if task else asyncio.to_thread(_analyse_sync, dict(ctx.pitch or {})))
