"""Market swarm stage: 200 buyer personas x 5 Decisions API rubrics."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from pipeline.context import Emit, RunContext
from pipeline.llm import MODEL_IDS, beta, generate_json, image_part, text_part

TARGET_PERSONA_COUNT = 200
MIN_PERSONA_COUNT = 50
CHUNK_SIZE_QUESTIONS = 250

RUBRICS: list[tuple[str, str, float]] = [
    (
        "value_clarity",
        "Within 3 seconds of seeing this page, do you understand what the product is, what problem it solves and who it is for?",
        0.15,
    ),
    (
        "pain_urgency",
        "Does this solve a recurring problem you already spend time or money on, rather than a nice-to-have?",
        0.20,
    ),
    (
        "price_value_fit",
        "Given your budget and the competing products listed, does the price feel fair?",
        0.25,
    ),
    (
        "credibility_trust",
        "Does this feel legitimate and deliverable enough to enter your card details today?",
        0.20,
    ),
    (
        "beat_competitors",
        "With a checkout link right now, would you buy this over the listed alternatives and over doing nothing?",
        0.20,
    ),
]

PERSONA_LIST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "personas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["id", "summary"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["personas"],
    "additionalProperties": False,
}


def _extract_persona_items(raw: Any) -> list[dict[str, str]]:
    if isinstance(raw, dict):
        items = raw.get("personas")
        if not isinstance(items, list):
            for val in raw.values():
                if isinstance(val, list):
                    items = val
                    break
    elif isinstance(raw, list):
        items = raw
    else:
        items = []

    cleaned: list[dict[str, str]] = []
    if not isinstance(items, list):
        return cleaned

    for item in items:
        if not isinstance(item, dict):
            continue
        summary = " ".join(str(item.get("summary") or "").split())
        if not summary:
            continue
        words = summary.split()
        if len(words) > 25:
            summary = " ".join(words[:25])
        cleaned.append({"id": f"p{len(cleaned) + 1:03d}", "summary": summary})
        if len(cleaned) >= TARGET_PERSONA_COUNT:
            break

    return cleaned


def _generate_personas_sync(pitch: dict[str, Any], count: int) -> list[dict[str, str]]:
    target_user = pitch.get("target_user") or "general consumers"
    in_target = int(round(count * 0.7))
    outside_target = count - in_target

    prompt = f"""Generate {count} compact, realistic, diverse buyer personas to evaluate this product:
Title: {pitch.get("title") or "Product"}
One-liner: {pitch.get("one_liner") or ""}
Target user: {target_user}
Price (USD): {pitch.get("price_usd")}

Composition:
- {in_target} personas realistically drawn from the target user segment (varied ages, jobs, budgets, skepticism levels).
- {outside_target} personas OUTSIDE the target user segment (adjacent shoppers, bargain hunters, skeptics, people without the core pain).

Format rules:
- Return JSON object {{"personas": [{{"id": "p001", "summary": "..."}}]}} with {count} entries (p001..p{count:03d}).
- Each summary MUST be <= 25 words: include age, job, budget, attitude, and why they would or wouldn't buy.
- Be concrete and realistic, not sycophantic."""

    raw = generate_json(
        model=MODEL_IDS["strategist"],
        parts=[text_part(prompt)],
        schema=PERSONA_LIST_SCHEMA,
        thinking="low",
    )
    return _extract_persona_items(raw)


def _build_evaluation_text(ctx: RunContext) -> str:
    pitch = ctx.pitch or {}
    spec = ctx.spec or {}

    comp_lines: list[str] = []
    for item in ctx.competitors:
        title = item.get("title") or "Competitor"
        price = item.get("price_usd")
        price_str = f"${price}" if price is not None else "price unknown"
        comp_lines.append(f"- {title} ({price_str})")
    comp_block = "\n".join(comp_lines) if comp_lines else "- None found"

    total_lab = len(ctx.lab_results)
    quitters = [r for r in ctx.lab_results if r.get("outcome") == "quit"]
    lab_lines = [f"{len(quitters)} of {total_lab} usability testers quit before checkout."]
    for r in quitters:
        pid = r.get("persona_id", "tester")
        reason = r.get("quit_reason") or "no reason given"
        lab_lines.append(f"- {pid} quit: {reason}")
    lab_block = "\n".join(lab_lines) if total_lab else "No usability lab data."

    return f"""PRODUCT PITCH
Title: {pitch.get("title")}
One-liner: {pitch.get("one_liner")}
Target user: {pitch.get("target_user")}
Price (USD): {pitch.get("price_usd")}
Features: {", ".join(str(f) for f in (pitch.get("features") or []))}
Sketch notes: {pitch.get("sketch_notes") or ""}

V1 SPEC
Headline: {spec.get("headline")}
Price (USD): {spec.get("price_usd")}
Pages: {", ".join(str(p) for p in (spec.get("pages") or []))}
Known risks: {"; ".join(str(r) for r in (spec.get("risks") or []))}

COMPETING PRODUCTS
{comp_block}

USABILITY LAB SUMMARY
{lab_block}"""


def _call_decisions_sync(
    input_parts: list[dict[str, Any]],
    questions: dict[str, dict[str, Any]],
) -> dict[str, tuple[float, float | None]]:
    resp = beta().decisions.create(
        model=MODEL_IDS["decisions"],
        input=input_parts,
        questions=questions,
    )
    answers = getattr(resp, "answers", None)
    if answers is None:
        raise ValueError("Decisions API response missing 'answers'")

    parsed: dict[str, tuple[float, float | None]] = {}
    for key in questions:
        ans = answers.get(key) if isinstance(answers, dict) else getattr(answers, key, None)
        if ans is None:
            continue

        raw_val = ans.get("noul") if isinstance(ans, dict) else getattr(ans, "noul", None)
        raw_conf = ans.get("confidence") if isinstance(ans, dict) else getattr(ans, "confidence", None)

        prob = _coerce_probability(raw_val)
        if prob is None:
            continue

        conf: float | None = None
        if isinstance(raw_conf, (int, float)) and not isinstance(raw_conf, bool):
            conf = max(0.0, min(1.0, float(raw_conf)))
        parsed[key] = (prob, conf)

    return parsed


def _coerce_probability(val: Any) -> float | None:
    if isinstance(val, bool):
        return 1.0 if val else 0.0
    if isinstance(val, (int, float)):
        return max(0.0, min(1.0, float(val)))
    if isinstance(val, dict) and "probability" in val:
        return _coerce_probability(val["probability"])
    if hasattr(val, "probability"):
        return _coerce_probability(getattr(val, "probability"))
    try:
        return max(0.0, min(1.0, float(val)))
    except (TypeError, ValueError):
        return None


async def run(ctx: RunContext, emit: Emit) -> None:
    pitch = ctx.pitch or {}

    # 1. Generate 200 compact buyer personas (accept what we get, min 50).
    personas: list[dict[str, str]] = []
    try:
        personas = await asyncio.to_thread(_generate_personas_sync, pitch, TARGET_PERSONA_COUNT)
    except Exception as exc:
        await emit(
            "error",
            "swarm",
            {
                "message": f"Persona generation failed ({type(exc).__name__}); retrying smaller batch.",
                "recoverable": True,
            },
        )

    if len(personas) < MIN_PERSONA_COUNT:
        needed = max(MIN_PERSONA_COUNT - len(personas), 60)
        try:
            extra = await asyncio.to_thread(_generate_personas_sync, pitch, needed)
            offset = len(personas)
            for item in extra:
                personas.append({"id": f"p{offset + 1:03d}", "summary": item["summary"]})
                offset += 1
                if len(personas) >= TARGET_PERSONA_COUNT:
                    break
        except Exception as exc:
            await emit(
                "error",
                "swarm",
                {
                    "message": f"Persona retry failed ({type(exc).__name__}).",
                    "recoverable": True,
                },
            )

    if not personas:
        await emit(
            "error",
            "swarm",
            {"message": "No buyer personas could be generated for swarm.", "recoverable": True},
        )
        empty_rubrics = {rid: 0.5 for rid, _, _ in RUBRICS}
        ctx.swarm = {
            "personas": 0,
            "rubrics": empty_rubrics,
            "intent_mean": 0.5,
            "mean_confidence": 0.0,
            "per_persona": [],
        }
        await emit(
            "swarm_result",
            "swarm",
            {"personas": 0, "rubrics": empty_rubrics, "intent_mean": 0.5},
        )
        return

    # 2. Build input parts and Decisions API questions (5 per persona).
    input_parts: list[dict[str, Any]] = []
    if ctx.screenshot_path and ctx.screenshot_path.exists():
        input_parts.append(image_part(ctx.screenshot_path, "image/png"))
    input_parts.append(text_part(_build_evaluation_text(ctx)))

    questions: dict[str, dict[str, Any]] = {}
    for persona in personas:
        pid = persona["id"]
        summary = persona["summary"]
        for rubric_id, rubric_q, _ in RUBRICS:
            questions[f"{pid}_{rubric_id}"] = {
                "type": "noul",
                "instructions": f"You are this buyer: {summary}. {rubric_q}",
            }

    total_questions = len(questions)
    await emit("swarm_progress", "swarm", {"done": 0, "total": total_questions})

    all_answers: dict[str, tuple[float, float | None]] = {}
    try:
        all_answers = await asyncio.to_thread(_call_decisions_sync, input_parts, questions)
        if not all_answers:
            raise ValueError("Decisions API returned no parseable answers")
        await emit("swarm_progress", "swarm", {"done": total_questions, "total": total_questions})
    except Exception:
        # Split into chunks of 250 questions and run concurrently.
        items = list(questions.items())
        chunks = [
            dict(items[i : i + CHUNK_SIZE_QUESTIONS])
            for i in range(0, len(items), CHUNK_SIZE_QUESTIONS)
        ]
        done = 0

        async def _run_chunk(chunk: dict[str, dict[str, Any]]) -> dict[str, tuple[float, float | None]]:
            nonlocal done
            try:
                res = await asyncio.to_thread(_call_decisions_sync, input_parts, chunk)
            except Exception as chunk_exc:
                await emit(
                    "error",
                    "swarm",
                    {
                        "message": f"Decisions chunk failed: {type(chunk_exc).__name__}",
                        "recoverable": True,
                    },
                )
                res = {}
            done += len(chunk)
            await emit("swarm_progress", "swarm", {"done": done, "total": total_questions})
            return res

        chunk_results = await asyncio.gather(*[_run_chunk(chunk) for chunk in chunks])
        for res in chunk_results:
            all_answers.update(res)

    # 3. Aggregate per-persona intent and rubric means.
    rubric_totals: dict[str, list[float]] = {rid: [] for rid, _, _ in RUBRICS}
    confidences: list[float] = []
    per_persona: list[dict[str, Any]] = []

    for persona in personas:
        pid = persona["id"]
        scores: dict[str, float] = {}
        answered_any = False

        for rubric_id, _, _ in RUBRICS:
            ans = all_answers.get(f"{pid}_{rubric_id}")
            if ans is not None:
                prob, conf = ans
                scores[rubric_id] = prob
                rubric_totals[rubric_id].append(prob)
                if conf is not None:
                    confidences.append(conf)
                answered_any = True

        if not answered_any:
            continue

        v = scores.get("value_clarity", 0.5)
        p = scores.get("pain_urgency", 0.5)
        pr = scores.get("price_value_fit", 0.5)
        c = scores.get("credibility_trust", 0.5)
        b = scores.get("beat_competitors", 0.5)

        intent = (v**0.15) * (p**0.20) * (pr**0.25) * (c**0.20) * (b**0.20)
        per_persona.append(
            {
                "id": pid,
                "summary": persona["summary"],
                "intent": round(intent, 4),
            }
        )

    rubrics_mean = {
        rid: round(sum(vals) / len(vals), 4) if vals else 0.5
        for rid, vals in rubric_totals.items()
    }
    intent_mean = (
        round(sum(p["intent"] for p in per_persona) / len(per_persona), 4)
        if per_persona
        else 0.5
    )
    mean_confidence = (
        round(sum(confidences) / len(confidences), 4) if confidences else 0.5
    )

    ctx.swarm = {
        "personas": len(per_persona),
        "rubrics": rubrics_mean,
        "intent_mean": intent_mean,
        "mean_confidence": mean_confidence,
        "per_persona": per_persona,
    }

    (ctx.run_dir / "swarm.json").write_text(json.dumps(ctx.swarm, indent=2), encoding="utf-8")

    await emit(
        "swarm_result",
        "swarm",
        {
            "personas": len(per_persona),
            "rubrics": rubrics_mean,
            "intent_mean": intent_mean,
        },
    )
