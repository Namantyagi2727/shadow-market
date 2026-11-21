"""V2 fix-and-prove stage: plan <= 3 honest fixes, patch MVP, and prove with held-out A/B + swarm re-score."""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any, Literal

from pipeline import build, lab, swarm
from pipeline.context import BACKEND_DIR, Emit, RunContext
from pipeline.llm import MODEL_IDS, beta, generate_json, generate_text, image_part, output_text, text_part

HOLDOUT_PERSONAS_PATH = BACKEND_DIR / "personas_holdout.json"
MANAGED_AGENT_TIMEOUT_S = 240.0
PROGRESS_INTERVAL_S = 10.0

# run_id -> real-world items only the founder can provide (photos, identity, address); never faked on the page.
FOUNDER_TODO: dict[str, list[str]] = {}

HONESTY_RULE = (
    "Never invent facts: no fake reviews, testimonials, ratings, addresses, certifications, "
    "press logos or photos. Do NOT put placeholders like [Founder name] or [Photo] on the page: "
    "tested 2:00 PM, visible placeholders made held-out buyers and the swarm trust the page LESS "
    "(credibility 0.35 -> 0.25). Only make changes that need no unknown facts."
)

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "fixes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string"},
                    "change": {"type": "string"},
                    "evidence": {"type": "string"},
                },
                "required": ["issue", "change", "evidence"],
                "additionalProperties": False,
            },
            "minItems": 1,
            "maxItems": 3,
        },
        "founder_todo": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
    },
    "required": ["fixes"],
    "additionalProperties": False,
}

# Track currently running iterate jobs so concurrent triggers for the same run_id don't collide.
ACTIVE_RUNS: set[str] = set()


def _load_json_file(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _load_events(run_dir: Path) -> list[dict[str, Any]]:
    events_path = run_dir / "events.jsonl"
    if not events_path.is_file():
        return []
    events: list[dict[str, Any]] = []
    for line in events_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def _normalize_rubrics(raw: Any) -> dict[str, float]:
    out: dict[str, float] = {}
    src = raw if isinstance(raw, dict) else {}
    for rid, _, _ in swarm.RUBRICS:
        val = src.get(rid)
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            out[rid] = round(max(0.0, min(1.0, float(val))), 4)
        else:
            out[rid] = 0.5
    return out


def _hydrate_missing_inputs(ctx: RunContext) -> tuple[dict[str, float], list[dict[str, str]]]:
    """Ensure ctx has all V1 inputs even when loaded from disk; return (rubrics_v1, v1_personas)."""
    events = _load_events(ctx.run_dir)
    actions_by_persona: dict[str, list[dict[str, Any]]] = {}
    event_lab_results: list[dict[str, Any]] = []
    event_quit_markers: dict[str, list[dict[str, Any]]] = {}
    event_swarm_rubrics: dict[str, Any] | None = None

    for ev in events:
        etype = ev.get("type")
        data = ev.get("data") or {}
        if not isinstance(data, dict):
            continue
        if etype == "pitch_parsed" and ctx.pitch is None:
            ctx.pitch = data
        elif etype == "spec_ready" and ctx.spec is None:
            ctx.spec = data
        elif etype == "competitors" and not ctx.competitors:
            ctx.competitors = list(data.get("items") or [])
        elif etype == "persona_action":
            pid = data.get("persona_id")
            if pid:
                actions_by_persona.setdefault(str(pid), []).append(data)
        elif etype == "persona_finished":
            pid = data.get("persona_id")
            entry = dict(data)
            if pid:
                entry["actions"] = actions_by_persona.get(str(pid), [])
            event_lab_results.append(entry)
        elif etype == "quit_markers":
            pid = data.get("persona_id")
            if pid:
                event_quit_markers[str(pid)] = list(data.get("markers") or [])
        elif etype == "swarm_result":
            if isinstance(data.get("rubrics"), dict):
                event_swarm_rubrics = data["rubrics"]
            if ctx.swarm is None:
                ctx.swarm = dict(data)
        elif etype == "verdict" and ctx.verdict is None:
            ctx.verdict = data

    if not ctx.lab_results and event_lab_results:
        ctx.lab_results = event_lab_results
    if not ctx.quit_markers and event_quit_markers:
        ctx.quit_markers = event_quit_markers
    if not ctx.quit_markers:
        disk_markers = _load_json_file(ctx.run_dir / "lab" / "quit_markers.json")
        if isinstance(disk_markers, dict):
            ctx.quit_markers = {str(k): list(v) for k, v in disk_markers.items() if isinstance(v, list)}

    if ctx.verdict is None:
        disk_verdict = _load_json_file(ctx.run_dir / "verdict.json")
        if isinstance(disk_verdict, dict):
            ctx.verdict = disk_verdict

    disk_swarm = _load_json_file(ctx.run_dir / "swarm.json")
    if ctx.swarm is None and isinstance(disk_swarm, dict):
        ctx.swarm = dict(disk_swarm)

    # rubrics_v1 comes from the swarm_result event first, then ctx.swarm / swarm.json.
    raw_rubrics = event_swarm_rubrics
    if raw_rubrics is None and isinstance(ctx.swarm, dict):
        raw_rubrics = ctx.swarm.get("rubrics")
    if raw_rubrics is None and isinstance(disk_swarm, dict):
        raw_rubrics = disk_swarm.get("rubrics")
    rubrics_v1 = _normalize_rubrics(raw_rubrics)

    raw_personas: Any = None
    if isinstance(ctx.swarm, dict) and isinstance(ctx.swarm.get("per_persona"), list):
        raw_personas = ctx.swarm.get("per_persona")
    elif isinstance(disk_swarm, dict) and isinstance(disk_swarm.get("per_persona"), list):
        raw_personas = disk_swarm.get("per_persona")

    personas_v1: list[dict[str, str]] = []
    if isinstance(raw_personas, list):
        for idx, item in enumerate(raw_personas, start=1):
            if not isinstance(item, dict):
                continue
            summary = " ".join(str(item.get("summary") or "").split())
            if not summary:
                continue
            pid = str(item.get("id") or f"p{idx:03d}")
            personas_v1.append({"id": pid, "summary": summary})

    return rubrics_v1, personas_v1


def _plan_fixes_sync(
    ctx: RunContext,
    rubrics_v1: dict[str, float],
    v1_html: str,
) -> list[dict[str, str]]:
    verdict_data = ctx.verdict or {}
    failure_modes = verdict_data.get("failure_modes") or []
    lowest_two = sorted(rubrics_v1.items(), key=lambda kv: kv[1])[:2]

    lab_findings: list[dict[str, Any]] = []
    seen_pids: set[str] = set()
    for r in ctx.lab_results:
        pid = str(r.get("persona_id") or "")
        seen_pids.add(pid)
        lab_findings.append(
            {
                "persona_id": pid,
                "outcome": r.get("outcome"),
                "quit_reason": r.get("quit_reason"),
                "quit_markers": ctx.quit_markers.get(pid, []),
            }
        )
    for pid, markers in ctx.quit_markers.items():
        if pid not in seen_pids:
            lab_findings.append({"persona_id": pid, "outcome": "quit", "quit_reason": None, "quit_markers": markers})

    html_excerpt = v1_html if len(v1_html) <= 60000 else v1_html[:60000] + chr(10) + "<!-- truncated -->"

    prompt = f"""You are a conversion and product-page engineer planning a targeted V2 patch for a single-file MVP landing page.

Honesty rule (MUST be strictly obeyed in every proposed change):
{HONESTY_RULE}

Propose between 1 and 3 concrete, high-impact page changes to V1's `index.html` that directly address the evidence below.
Focus ONLY on changes that can honestly be made on the landing page (clarity of the offer, structure and visual hierarchy, showing price/shipping/returns upfront, fewer checkout steps and fields, mobile layout fixes, plain honest wording). Anything that needs a real fact we don't have (real photos, founder identity, address, certifications, materials) is NOT a page change: list it in founder_todo instead.

Product Pitch:
{json.dumps(ctx.pitch or {}, indent=2)}

V1 Spec:
{json.dumps(ctx.spec or {}, indent=2)}

Verdict Failure Modes:
{json.dumps(failure_modes, indent=2)}

Usability Lab Quit Reasons & Video Quit Markers:
{json.dumps(lab_findings, indent=2)}

Two Lowest Swarm Rubrics:
{json.dumps([{"rubric": rid, "mean_score": score} for rid, score in lowest_two], indent=2)}

All V1 Swarm Rubric Means:
{json.dumps(rubrics_v1, indent=2)}

Current V1 index.html:
```html
{html_excerpt}
```

Return ONLY JSON matching the schema:
{{"fixes": [{{"issue": string, "change": string, "evidence": string}}], "founder_todo": [string]}} (1 to 3 fixes, max 3; founder_todo = up to 3 real-world things only the founder can provide, e.g. "Shoot 3 real photos of the cap on a kid's bottle").
Each fix must specify:
- "issue": the concrete page problem hurt by V1.
- "change": the exact HTML/copy/UX change to apply to V1 while obeying the honesty rule.
- "evidence": the specific verdict failure mode, lab quit reason/marker, or lowest rubric score justifying it."""

    raw = generate_json(
        model=MODEL_IDS["verdict"],
        parts=[text_part(prompt)],
        schema=PLAN_SCHEMA,
        thinking="medium",
    )
    items = raw.get("fixes") if isinstance(raw, dict) else None
    todo = raw.get("founder_todo") if isinstance(raw, dict) else None
    FOUNDER_TODO[ctx.run_id] = [str(t).strip() for t in (todo or []) if str(t).strip()][:3]
    cleaned: list[dict[str, str]] = []
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            issue = " ".join(str(item.get("issue") or "").split())
            change = " ".join(str(item.get("change") or "").split())
            evidence = " ".join(str(item.get("evidence") or "").split())
            if issue and change:
                cleaned.append(
                    {
                        "issue": issue,
                        "change": change,
                        "evidence": evidence or "Derived from V1 verdict, lab, and swarm diagnostics.",
                    }
                )
            if len(cleaned) >= 3:
                break
    return cleaned


def _fallback_fixes(ctx: RunContext, rubrics_v1: dict[str, float]) -> list[dict[str, str]]:
    fixes: list[dict[str, str]] = []
    lowest_two = sorted(rubrics_v1.items(), key=lambda kv: kv[1])[:2]
    for rid, score in lowest_two:
        label = rid.replace("_", " ")
        fixes.append(
            {
                "issue": f"Low {label} score ({score * 100:.0f}%).",
                "change": (
                    f"Add a clear, scannable section above the fold addressing {label} with transparent pricing, "
                    "shipping and return terms, using only facts already on the page."
                ),
                "evidence": f"V1 swarm rubric {rid} scored {score:.2f}.",
            }
        )

    for r in ctx.lab_results:
        if len(fixes) >= 3:
            break
        if r.get("outcome") == "quit" and r.get("quit_reason"):
            fixes.append(
                {
                    "issue": "Usability tester quit before completing checkout.",
                    "change": (
                        "Streamline the page hierarchy and make the 2-step demo checkout immediately reachable "
                        "with clear step indicators, upfront totals, and readable contrast on mobile and desktop."
                    ),
                    "evidence": f"{r.get('persona_id')} quit: {str(r['quit_reason'])[:140]}",
                }
            )
            break

    if not fixes:
        fixes.append(
            {
                "issue": "Page clarity and buyer trust need strengthening.",
                "change": (
                    "Surface upfront pricing, key specs, shipping/returns, and clearly marked square-bracket "
                    "placeholders for unknown company details without inventing facts."
                ),
                "evidence": "V1 verdict and lab diagnostics.",
            }
        )
    return fixes[:3]


def _build_patch_prompt(fixes: list[dict[str, str]], v1_html: str | None) -> str:
    fixes_json = json.dumps(fixes, indent=2)
    source_block = (
        f"""
V1 `index.html` to patch:
```html
{v1_html}
```
"""
        if v1_html is not None
        else """
Modify the existing V1 `index.html` already in your workspace.
"""
    )

    return f"""Apply ONLY these exact fixes to the V1 `index.html` and keep everything else intact:
{fixes_json}

Strict rules:
1. {HONESTY_RULE}
2. Keep everything else from V1 intact (existing structure, working features, responsive layout, inline SVG/assets).
3. Keep it a single self-contained `index.html` file (inline CSS inside <style> and inline JS inside <script>; NO external assets, fonts, CDNs, scripts, or external images).
4. Keep the 2-step fake checkout working cleanly and ending in a visible confirmation state containing the exact phrase "Order confirmed".
5. Verify there are no HTML/JS syntax errors and no broken buttons or layout overlap on mobile or desktop.
{source_block}
In your final reply, print the COMPLETE final `index.html` verbatim wrapped between these exact markers on their own lines:
<<<HTML
...full index.html content...
HTML>>>
"""


def _run_reuse_agent_sync(prompt: str, session: dict[str, str]) -> str:
    resp = beta().interactions.create(
        agent=MODEL_IDS["builder_agent"],
        previous_interaction_id=session["interaction_id"],
        environment=session["environment_id"],
        agent_config={
            "type": "antigravity",
            "model": MODEL_IDS["persona_driver"],
            "max_total_tokens": 100000,
        },
        input=prompt,
    )
    return output_text(resp)


def _run_fresh_agent_sync(prompt: str) -> str:
    resp = beta().interactions.create(
        agent=MODEL_IDS["builder_agent"],
        environment="remote",
        agent_config={
            "type": "antigravity",
            "model": MODEL_IDS["persona_driver"],
            "max_total_tokens": 100000,
        },
        input=prompt,
    )
    return output_text(resp)


def _swallow_task_exception(task: asyncio.Task[str]) -> None:
    if not task.cancelled():
        task.exception()


async def _await_managed_patch(
    fn: Any,
    args: tuple[Any, ...],
    start_message: str,
    waiting_prefix: str,
    start: float,
    deadline: float,
    emit: Emit,
) -> tuple[str | None, str | None, bool]:
    """Run a managed-agent call with 10s progress updates until deadline.

    Returns (html_or_none, failure_reason_or_none, timed_out).
    """
    await emit("v2_build_progress", "iterate", {"message": start_message})
    task: asyncio.Task[str] = asyncio.create_task(asyncio.to_thread(fn, *args))

    while not task.done():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            task.add_done_callback(_swallow_task_exception)
            return None, f"timed out after {int(MANAGED_AGENT_TIMEOUT_S)}s", True

        done, _ = await asyncio.wait({task}, timeout=min(PROGRESS_INTERVAL_S, remaining))
        if task in done:
            break

        elapsed = int(time.monotonic() - start)
        await emit("v2_build_progress", "iterate", {"message": f"{waiting_prefix} {elapsed}s"})

    try:
        raw_output = task.result()
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}", False

    html = build._extract_html(raw_output, require_markers=True)
    if not html:
        return None, "no <<<HTML ... HTML>>> output markers found", False
    return html, None, False


def _make_panel_emitter(
    emit: Emit,
    version: Literal["v1", "v2"],
    names_by_id: dict[str, str],
) -> Emit:
    """Wrap lab.run_panel emit: drop persona_started/action, map persona_finished -> v2_panel_finished."""

    async def _wrapped(type_: str, _stage: Any, data: dict[str, Any]) -> None:
        if type_ in ("persona_started", "persona_action"):
            return
        if type_ == "persona_finished":
            pid = str(data.get("persona_id") or "")
            await emit(
                "v2_panel_finished",
                "iterate",
                {
                    "persona_id": pid,
                    "name": names_by_id.get(pid, pid),
                    "version": version,
                    "outcome": data.get("outcome", "quit"),
                    "quit_reason": data.get("quit_reason"),
                    "video_url": str(data.get("video_url") or ""),
                },
            )
            return
        if type_ == "error":
            await emit("error", "iterate", data)

    return _wrapped


async def _rescore_swarm(
    ctx: RunContext,
    v2_screenshot_path: Path,
    personas_v1: list[dict[str, str]],
    emit: Emit,
) -> dict[str, float]:
    if not personas_v1:
        await emit(
            "error",
            "iterate",
            {"message": "No V1 swarm personas found for V2 re-scoring.", "recoverable": True},
        )
        return {rid: 0.5 for rid, _, _ in swarm.RUBRICS}

    input_parts: list[dict[str, Any]] = []
    if v2_screenshot_path.is_file():
        input_parts.append(image_part(v2_screenshot_path, "image/png"))
    input_parts.append(text_part(swarm._build_evaluation_text(ctx)))

    questions: dict[str, dict[str, Any]] = {}
    for persona in personas_v1:
        pid = persona["id"]
        summary = persona["summary"]
        for rubric_id, rubric_q, _ in swarm.RUBRICS:
            questions[f"{pid}_{rubric_id}"] = {
                "type": "noul",
                "instructions": f"You are this buyer: {summary}. {rubric_q}",
            }

    all_answers: dict[str, tuple[float, float | None]] = {}
    try:
        all_answers = await asyncio.to_thread(swarm._call_decisions_sync, input_parts, questions)
        if not all_answers:
            raise ValueError("Decisions API returned no parseable answers")
    except Exception:
        items = list(questions.items())
        chunks = [
            dict(items[i : i + swarm.CHUNK_SIZE_QUESTIONS])
            for i in range(0, len(items), swarm.CHUNK_SIZE_QUESTIONS)
        ]

        async def _run_chunk(chunk: dict[str, dict[str, Any]]) -> dict[str, tuple[float, float | None]]:
            try:
                return await asyncio.to_thread(swarm._call_decisions_sync, input_parts, chunk)
            except Exception as chunk_exc:  # noqa: BLE001
                await emit(
                    "error",
                    "iterate",
                    {
                        "message": f"V2 Decisions chunk failed: {type(chunk_exc).__name__}",
                        "recoverable": True,
                    },
                )
                return {}

        chunk_results = await asyncio.gather(*[_run_chunk(chunk) for chunk in chunks])
        for res in chunk_results:
            all_answers.update(res)

    rubric_totals: dict[str, list[float]] = {rid: [] for rid, _, _ in swarm.RUBRICS}
    for persona in personas_v1:
        pid = persona["id"]
        scores: dict[str, float] = {}
        answered_any = False
        for rubric_id, _, _ in swarm.RUBRICS:
            ans = all_answers.get(f"{pid}_{rubric_id}")
            if ans is not None:
                prob, _conf = ans
                scores[rubric_id] = prob
                rubric_totals[rubric_id].append(prob)
                answered_any = True
        if not answered_any:
            continue
        v = scores.get("value_clarity", 0.5)
        p = scores.get("pain_urgency", 0.5)
        pr = scores.get("price_value_fit", 0.5)
        c = scores.get("credibility_trust", 0.5)
        b = scores.get("beat_competitors", 0.5)
        _ = (v**0.15) * (p**0.20) * (pr**0.25) * (c**0.20) * (b**0.20)

    return {
        rid: round(sum(vals) / len(vals), 4) if vals else 0.5
        for rid, vals in rubric_totals.items()
    }


def _fallback_summary(
    n: int,
    v1_converted: int,
    v2_converted: int,
    rubrics_v1: dict[str, float],
    rubrics_v2: dict[str, float],
) -> str:
    deltas = [
        (rid, rubrics_v2.get(rid, 0.5) - rubrics_v1.get(rid, 0.5))
        for rid, _, _ in swarm.RUBRICS
    ]
    top_rid, top_delta = max(deltas, key=lambda kv: abs(kv[1]))
    top_name = top_rid.replace("_", " ")
    r1 = rubrics_v1.get(top_rid, 0.5) * 100
    r2 = rubrics_v2.get(top_rid, 0.5) * 100

    if v2_converted > v1_converted:
        text = (
            f"Held-out buyers rose from {v1_converted}/{n} to {v2_converted}/{n}. "
            f"Biggest rubric move: {top_name} ({r1:.0f}% to {r2:.0f}%, {top_delta * 100:+.0f}pp)."
        )
    elif v2_converted < v1_converted:
        text = (
            f"V2 regressed on held-out buyers ({v1_converted}/{n} down to {v2_converted}/{n}). "
            f"Biggest rubric move: {top_name} ({r1:.0f}% to {r2:.0f}%, {top_delta * 100:+.0f}pp)."
        )
    elif top_delta > 0.02:
        text = (
            f"Held-out conversions stayed flat at {v2_converted}/{n}, though {top_name} "
            f"improved from {r1:.0f}% to {r2:.0f}% ({top_delta * 100:+.0f}pp)."
        )
    else:
        text = (
            f"V2 did not meaningfully improve results: held-out conversions stayed at {v2_converted}/{n} "
            f"and {top_name} shifted from {r1:.0f}% to {r2:.0f}%."
        )
    return " ".join(text.split()[:40])


def _summarize_result_sync(
    fixes: list[dict[str, str]],
    n: int,
    v1_converted: int,
    v2_converted: int,
    rubrics_v1: dict[str, float],
    rubrics_v2: dict[str, float],
) -> str:
    rubric_deltas = {
        rid: {
            "v1": rubrics_v1.get(rid, 0.5),
            "v2": rubrics_v2.get(rid, 0.5),
            "delta": round(rubrics_v2.get(rid, 0.5) - rubrics_v1.get(rid, 0.5), 4),
        }
        for rid, _, _ in swarm.RUBRICS
    }
    prompt = f"""Write a plain, honest summary (strictly <= 40 words, 1-2 sentences, no markdown or bullets) comparing V1 vs V2 results.
If V2 did not improve or regressed, say so bluntly. Mention the held-out buyer conversions and the most notable rubric change(s). Do not claim the analyst launch probability changed.

Fixes attempted:
{json.dumps([f["issue"] for f in fixes], indent=2)}

Held-out panel conversions: V1 = {v1_converted}/{n}, V2 = {v2_converted}/{n}
Swarm rubrics V1 vs V2:
{json.dumps(rubric_deltas, indent=2)}"""

    raw = generate_text(MODEL_IDS["persona_driver"], prompt, "low")
    cleaned = " ".join(raw.replace("*", "").replace("#", "").split())
    words = cleaned.split()
    if len(words) > 40:
        cleaned = " ".join(words[:40])
    return cleaned


async def run(ctx: RunContext, emit: Emit) -> None:
    if ctx.run_id in ACTIVE_RUNS:
        return
    ACTIVE_RUNS.add(ctx.run_id)
    try:
        rubrics_v1, personas_v1 = _hydrate_missing_inputs(ctx)

        v1_index_path = ctx.run_dir / "mvp" / "index.html"
        if not v1_index_path.is_file() and ctx.mvp_dir is not None:
            candidate = ctx.mvp_dir / "index.html"
            if candidate.is_file():
                v1_index_path = candidate

        if not v1_index_path.is_file():
            await emit(
                "error",
                "iterate",
                {"message": "Skipping V2 iterate: V1 index.html not found.", "recoverable": True},
            )
            return

        v1_html = v1_index_path.read_text(encoding="utf-8")
        v1_screenshot_path = ctx.run_dir / "mvp" / "screenshot.png"
        if not v1_screenshot_path.is_file() and ctx.screenshot_path and ctx.screenshot_path.is_file():
            v1_screenshot_path = ctx.screenshot_path
        v1_screenshot_url = ctx.artifact_url(v1_screenshot_path) if v1_screenshot_path.is_file() else ""

        v2_dir = ctx.run_dir / "v2"
        v2_dir.mkdir(parents=True, exist_ok=True)
        v2_index_path = v2_dir / "index.html"
        v2_screenshot_path = v2_dir / "screenshot.png"

        # 1. Plan (<= 3 honest fixes via Carbon)
        fixes: list[dict[str, str]] = []
        try:
            fixes = await asyncio.to_thread(_plan_fixes_sync, ctx, rubrics_v1, v1_html)
        except Exception as exc:  # noqa: BLE001
            await emit(
                "error",
                "iterate",
                {
                    "message": f"V2 plan generation failed ({type(exc).__name__}); using fallback fixes.",
                    "recoverable": True,
                },
            )
        if not fixes:
            fixes = _fallback_fixes(ctx, rubrics_v1)

        await emit("v2_plan", "iterate", {"fixes": fixes, "founder_todo": FOUNDER_TODO.get(ctx.run_id, [])})

        # 2. Patch (continue V1 sandbox if available, else fresh managed agent, fallback Hydrogen)
        reuse_prompt = _build_patch_prompt(fixes, v1_html=None)
        fresh_prompt = _build_patch_prompt(fixes, v1_html=v1_html)

        session = build.AGENT_SESSIONS.get(str(ctx.run_dir)) or build.AGENT_SESSIONS.get(
            str(ctx.run_dir.resolve())
        )
        has_session = bool(
            session and session.get("interaction_id") and session.get("environment_id")
        )

        html: str | None = None
        reused_sandbox = False
        fallback_reason: str | None = None

        start = time.monotonic()
        deadline = start + MANAGED_AGENT_TIMEOUT_S
        timed_out = False

        if has_session and session is not None:
            html, err, timed_out = await _await_managed_patch(
                _run_reuse_agent_sync,
                (reuse_prompt, session),
                "Patching V1 in existing Google sandbox…",
                "Managed agent patching V1 in existing sandbox…",
                start,
                deadline,
                emit,
            )
            if html:
                reused_sandbox = True
            else:
                fallback_reason = err
                if not timed_out:
                    await emit(
                        "v2_build_progress",
                        "iterate",
                        {
                            "message": (
                                f"Existing sandbox session failed ({err}); "
                                "falling through to fresh Google sandbox…"
                            )
                        },
                    )

        if not html and not timed_out and time.monotonic() < deadline:
            html, err, timed_out = await _await_managed_patch(
                _run_fresh_agent_sync,
                (fresh_prompt,),
                "Starting fresh managed agent patch in Google sandbox…",
                "Managed agent patching V2 in Google sandbox…",
                start,
                deadline,
                emit,
            )
            if html:
                reused_sandbox = False
            else:
                fallback_reason = err

        if not html:
            await emit(
                "v2_build_progress",
                "iterate",
                {
                    "message": (
                        f"Managed agent fallback triggered ({fallback_reason}); "
                        "patching V2 HTML directly with Hydrogen…"
                    )
                },
            )
            fallback_raw = await asyncio.to_thread(
                generate_text,
                MODEL_IDS["persona_driver"],
                fresh_prompt,
                "low",
            )
            html = build._extract_html(fallback_raw, require_markers=False)
            reused_sandbox = False
            if not html:
                raise RuntimeError("Fallback V2 HTML generation did not return a valid HTML document")

        v2_index_path.write_text(html, encoding="utf-8")

        await emit("v2_build_progress", "iterate", {"message": "Capturing V2 screenshot…"})
        v2_screenshot_url = ""
        try:
            await build._capture_screenshot(v2_index_path, v2_screenshot_path)
            v2_screenshot_url = ctx.artifact_url(v2_screenshot_path)
        except Exception as exc:  # noqa: BLE001
            await emit(
                "error",
                "iterate",
                {
                    "message": f"V2 screenshot failed ({type(exc).__name__})",
                    "recoverable": True,
                },
            )

        base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
        v1_url = base_url + ctx.artifact_url(v1_index_path)
        v2_url = base_url + ctx.artifact_url(v2_index_path)

        await emit(
            "v2_ready",
            "iterate",
            {
                "url": ctx.artifact_url(v2_index_path),
                "screenshot_url": v2_screenshot_url,
                "v1_screenshot_url": v1_screenshot_url,
                "reused_sandbox": reused_sandbox,
            },
        )

        # 3. Prove concurrently: held-out A/B panel (V1 vs V2) + 200-persona swarm re-score
        holdout: list[dict[str, Any]] = json.loads(HOLDOUT_PERSONAS_PATH.read_text(encoding="utf-8"))
        names_by_id = {str(p["id"]): str(p.get("name") or p["id"]) for p in holdout}

        emit_v1 = _make_panel_emitter(emit, "v1", names_by_id)
        emit_v2 = _make_panel_emitter(emit, "v2", names_by_id)

        async def _safe_panel(
            panel_emit: Emit,
            url: str,
            lab_dir: Path,
            label: str,
        ) -> list[dict[str, Any]]:
            try:
                return await lab.run_panel(ctx, panel_emit, holdout, url, lab_dir)
            except Exception as exc:  # noqa: BLE001
                await emit(
                    "error",
                    "iterate",
                    {
                        "message": f"Held-out panel ({label}) failed: {type(exc).__name__}",
                        "recoverable": True,
                    },
                )
                return []

        async def _safe_rescore() -> dict[str, float]:
            try:
                return await _rescore_swarm(ctx, v2_screenshot_path, personas_v1, emit)
            except Exception as exc:  # noqa: BLE001
                await emit(
                    "error",
                    "iterate",
                    {
                        "message": f"V2 swarm re-score failed: {type(exc).__name__}",
                        "recoverable": True,
                    },
                )
                return {rid: 0.5 for rid, _, _ in swarm.RUBRICS}

        v1_panel_results, v2_panel_results, rubrics_v2 = await asyncio.gather(
            _safe_panel(emit_v1, v1_url, v2_dir / "lab_v1", "v1"),
            _safe_panel(emit_v2, v2_url, v2_dir / "lab_v2", "v2"),
            _safe_rescore(),
        )

        # 4. Result
        n_holdout = len(holdout)
        v1_converted = sum(1 for r in v1_panel_results if r.get("outcome") == "converted")
        v2_converted = sum(1 for r in v2_panel_results if r.get("outcome") == "converted")

        summary = ""
        try:
            summary = await asyncio.to_thread(
                _summarize_result_sync,
                fixes,
                n_holdout,
                v1_converted,
                v2_converted,
                rubrics_v1,
                rubrics_v2,
            )
        except Exception:  # noqa: BLE001
            summary = ""

        if not summary:
            summary = _fallback_summary(n_holdout, v1_converted, v2_converted, rubrics_v1, rubrics_v2)

        result_data: dict[str, Any] = {
            "holdout": {
                "n": n_holdout,
                "v1_converted": v1_converted,
                "v2_converted": v2_converted,
            },
            "rubrics_v1": rubrics_v1,
            "rubrics_v2": rubrics_v2,
            "summary": summary,
        }

        (v2_dir / "result.json").write_text(json.dumps(result_data, indent=2), encoding="utf-8")
        await emit("v2_result", "iterate", result_data)
    finally:
        ACTIVE_RUNS.discard(ctx.run_id)
