"""Verdict stage: calibrated launch probability + Carbon failure modes & summary."""

from __future__ import annotations

import asyncio
import json
import math
from typing import Any

from pipeline.context import BACKEND_DIR, Emit, RunContext
from pipeline import analyst
from pipeline.llm import MODEL_IDS, generate_json, text_part

CALIBRATION_PATH = BACKEND_DIR / "calibration.json"

VERDICT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "failure_modes": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "maxItems": 5,
        },
        "summary": {"type": "string"},
    },
    "required": ["failure_modes", "summary"],
    "additionalProperties": False,
}


def _load_calibration() -> tuple[float, float]:
    if not CALIBRATION_PATH.exists():
        return 0.0, 1.0
    try:
        data = json.loads(CALIBRATION_PATH.read_text(encoding="utf-8"))
        alpha = float(data.get("alpha", 0.0))
        beta_param = float(data.get("beta", 1.0))
        return alpha, beta_param
    except Exception:
        return 0.0, 1.0


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _logit(p: float) -> float:
    return math.log(p / (1.0 - p))


def _sigmoid(x: float) -> float:
    x_safe = _clamp(x, -60.0, 60.0)
    return 1.0 / (1.0 + math.exp(-x_safe))


def _compute_launch_probability(intent_mean: float) -> float:
    alpha, beta_param = _load_calibration()
    p = _clamp(float(intent_mean), 0.01, 0.99)
    return round(_sigmoid(alpha + beta_param * _logit(p)), 4)


def _generate_verdict_copy_sync(
    ctx: RunContext,
    launch_probability: float,
    confidence: float,
) -> dict[str, Any]:
    swarm = ctx.swarm or {}
    lab_summary = [
        {
            "persona_id": r.get("persona_id"),
            "outcome": r.get("outcome"),
            "quit_reason": r.get("quit_reason"),
            "markers": ctx.quit_markers.get(str(r.get("persona_id")), []),
        }
        for r in ctx.lab_results
    ]

    prompt = f"""You are a blunt launch-viability analyst delivering a final verdict.
The launch probability has ALREADY been computed by our backtested analyst model
(validated on 120 real 2026 Kickstarter campaigns):
- launch_probability: {launch_probability:.4f} ({launch_probability * 100:.1f}%)
- analyst reasoning: {(ctx.verdict or {}).get("analyst_reason", "")}
Your job is to explain WHY using the evidence below (buyer swarm rubrics, usability lab quits, boardroom risks, competitors)
and what to fix first.

DO NOT change, dispute, or replace this probability number. Be direct, specific, and blunt—no cheerleading.

Evidence:
Pitch: {json.dumps(ctx.pitch or {}, indent=2)}
Spec: {json.dumps(ctx.spec or {}, indent=2)}
Competitors: {json.dumps(ctx.competitors, indent=2)}
Usability Lab (quitters, reasons, timestamps): {json.dumps(lab_summary, indent=2)}
Swarm Rubric Means ({swarm.get("personas", 0)} personas, intent_mean={swarm.get("intent_mean")}):
{json.dumps(swarm.get("rubrics", {}), indent=2)}

Return ONLY JSON matching the schema:
- "failure_modes": 3 to 5 short, sharp strings identifying the concrete reasons this launch fails or stalls.
- "summary": <= 60 words summarizing the blunt verdict consistent with {launch_probability * 100:.1f}% launch probability."""

    return generate_json(
        model=MODEL_IDS["verdict"],
        parts=[text_part(prompt)],
        schema=VERDICT_SCHEMA,
        thinking="medium",
    )


def _fallback_verdict_copy(ctx: RunContext, launch_probability: float) -> tuple[list[str], str]:
    modes: list[str] = []
    rubrics = (ctx.swarm or {}).get("rubrics") or {}
    for rid, score in sorted(rubrics.items(), key=lambda kv: kv[1])[:3]:
        modes.append(f"Weak {rid.replace('_', ' ')} ({score * 100:.0f}% positive)")

    for r in ctx.lab_results:
        if r.get("outcome") == "quit" and r.get("quit_reason") and len(modes) < 5:
            modes.append(f"Lab quitter ({r.get('persona_id')}): {str(r['quit_reason'])[:90]}")

    while len(modes) < 3:
        modes.append("Insufficient purchase urgency against existing alternatives")

    summary = (
        f"Calibrated launch probability is {launch_probability * 100:.1f}%. "
        f"Address the lowest-scoring swarm rubrics and usability lab drop-offs before launching."
    )
    return modes[:5], summary


async def run(ctx: RunContext, emit: Emit) -> None:
    swarm = ctx.swarm or {}
    raw_intent = swarm.get("intent_mean")
    intent_mean = float(raw_intent) if raw_intent is not None else 0.5
    # The number comes from the analyst (backtest winner: AUC 0.88 vs swarm 0.70). The swarm explains.
    analysis = await analyst.get(ctx)
    launch_probability = round(float(analysis["probability"]), 4)
    ctx.verdict = {"analyst_reason": analysis["reason"]}
    market_intent = round(_compute_launch_probability(intent_mean), 4)

    raw_conf = swarm.get("mean_confidence")
    confidence = round(_clamp(float(raw_conf) if raw_conf is not None else 0.5, 0.0, 1.0), 4)

    failure_modes: list[str] = []
    summary = ""
    try:
        parsed = await asyncio.to_thread(
            _generate_verdict_copy_sync, ctx, launch_probability, confidence
        )
        if isinstance(parsed, dict):
            raw_modes = parsed.get("failure_modes")
            if isinstance(raw_modes, list):
                failure_modes = [str(m).strip() for m in raw_modes if str(m).strip()][:5]
            summary = " ".join(str(parsed.get("summary") or "").split())
    except Exception as exc:
        await emit(
            "error",
            "verdict",
            {
                "message": f"Verdict narrative generation failed ({type(exc).__name__}); using fallback summary.",
                "recoverable": True,
            },
        )

    if len(failure_modes) < 3 or not summary:
        fb_modes, fb_summary = _fallback_verdict_copy(ctx, launch_probability)
        if len(failure_modes) < 3:
            failure_modes = fb_modes
        if not summary:
            summary = fb_summary

    words = summary.split()
    if len(words) > 60:
        summary = " ".join(words[:60])

    verdict_data: dict[str, Any] = {
        "launch_probability": launch_probability,
        "confidence": confidence,
        "failure_modes": failure_modes,
        "summary": summary,
        "analyst_reason": analysis["reason"],
        # Transparency: the analyst frames the pitch as a campaign (category + assumed goal) before scoring.
        "analyst_framing": analysis.get("campaign_text", ""),
        "market_intent": market_intent,
        "probability_source": "analyst",
    }

    ctx.verdict = verdict_data
    (ctx.run_dir / "verdict.json").write_text(json.dumps(verdict_data, indent=2), encoding="utf-8")
    await emit("verdict", "verdict", verdict_data)
