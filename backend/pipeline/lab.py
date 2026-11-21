"""Usability lab stage: run 6 persona browser agents concurrently against the MVP."""

from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, Page, async_playwright

from pipeline.context import BACKEND_DIR, Emit, RunContext
from pipeline.llm import MODEL_IDS, generate_json, image_part, text_part

PERSONAS_PATH = BACKEND_DIR / "personas.json"
MAX_STEPS = 12
ALLOWED_ACTIONS = {"click", "type", "scroll", "wait", "quit"}

CHECKOUT_SUCCESS_RE = re.compile(
    r"(order\s+confirmed|thank\s+you\s+for\s+your\s+(order|purchase)|"
    r"checkout\s+complete|purchase\s+complete|order\s+placed)",
    re.IGNORECASE,
)

ACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "enum": ["click", "type", "scroll", "wait", "quit"],
        },
        "target_index": {"type": ["integer", "null"]},
        "text": {"type": ["string", "null"]},
        "thought": {"type": "string"},
    },
    "required": ["action", "target_index", "text", "thought"],
    "additionalProperties": False,
}

COLLECT_ELEMENTS_JS = r"""() => {
  document.querySelectorAll('[data-agent-idx]').forEach(el => el.removeAttribute('data-agent-idx'));
  const selector = 'a, button, input, textarea, select, [role="button"], [role="link"], [onclick]';
  const nodes = Array.from(document.querySelectorAll(selector));
  const results = [];
  let idx = 0;

  for (const el of nodes) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      continue;
    }
    if (el.disabled) {
      continue;
    }
    el.setAttribute('data-agent-idx', String(idx));
    const inViewport = rect.bottom >= 0 && rect.top <= window.innerHeight &&
                       rect.right >= 0 && rect.left <= window.innerWidth;
    const rawText = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim();
    results.push({
      index: idx,
      tag: el.tagName.toLowerCase(),
      input_type: el.tagName.toLowerCase() === 'input' ? (el.getAttribute('type') || 'text') : null,
      text: rawText.replace(/\s+/g, ' ').slice(0, 80),
      in_viewport: inViewport
    });
    idx += 1;
    if (idx >= 60) break;
  }
  return results;
}"""


def _normalize_decision(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "action": "wait",
            "target_index": None,
            "text": None,
            "thought": "Paused to inspect the page.",
        }

    action = str(raw.get("action", "wait")).strip().lower()
    if action not in ALLOWED_ACTIONS:
        action = "wait"

    target_raw = raw.get("target_index")
    target_index = (
        target_raw if isinstance(target_raw, int) and not isinstance(target_raw, bool) else None
    )
    text_raw = raw.get("text")
    text_str = str(text_raw) if text_raw is not None else None
    thought = str(raw.get("thought") or "").strip()

    return {
        "action": action,
        "target_index": target_index,
        "text": text_str,
        "thought": thought,
    }


def _pick_next_action_sync(
    persona: dict[str, Any],
    screenshot_bytes: bytes,
    elements: list[dict[str, Any]],
    history: list[dict[str, Any]],
    step: int,
) -> dict[str, Any]:
    recent = [
        {
            "step": h["step"],
            "action": h["action"],
            "target": h["target"],
            "thought": h["thought"],
            "executed_ok": h["executed_ok"],
        }
        for h in history[-5:]
    ]
    prompt = f"""You are roleplaying the following website visitor evaluating a product page.
Persona JSON:
{json.dumps(persona, indent=2)}

Current step: {step} of {MAX_STEPS}.
Recent actions:
{json.dumps(recent, indent=2)}

Visible interactive elements (use `index` for target_index):
{json.dumps(elements, indent=2)}

Decide your next single browser action strictly in character. If one of your quit_triggers fires or you decide not to buy, choose action "quit". Otherwise interact realistically (scroll to inspect, click buttons, type into forms).
Return ONLY a JSON object with keys:
{{"action": "click"|"type"|"scroll"|"wait"|"quit", "target_index": int|null, "text": str|null, "thought": str}}
For scroll, set text to "down" or "up". For type, set target_index and text. For click, set target_index. For wait or quit, target_index and text may be null."""

    raw = generate_json(
        model=MODEL_IDS["persona_driver"],
        parts=[image_part(screenshot_bytes, "image/png"), text_part(prompt)],
        schema=ACTION_SCHEMA,
        thinking="low",
    )
    return _normalize_decision(raw)


def _resolve_target(decision: dict[str, Any], elements: list[dict[str, Any]]) -> str:
    action = decision["action"]
    target_index = decision["target_index"]
    if target_index is not None:
        for el in elements:
            if el.get("index") == target_index:
                label = str(el.get("text") or "").strip()
                if label:
                    return label
                return f"<{el.get('tag', 'element')}>"
    if action == "scroll":
        text = decision.get("text") or ""
        return "up" if "up" in text.lower() else "down"
    return ""


async def _execute_action(page: Page, decision: dict[str, Any]) -> tuple[bool, str | None]:
    action = decision["action"]
    target_index = decision["target_index"]
    text = decision["text"]

    try:
        if action == "click":
            if target_index is None:
                return False, "click action missing target_index"
            loc = page.locator(f'[data-agent-idx="{target_index}"]').first
            await loc.scroll_into_view_if_needed(timeout=3000)
            await loc.click(timeout=3000)
            return True, None

        if action == "type":
            if target_index is None or text is None:
                return False, "type action missing target_index or text"
            loc = page.locator(f'[data-agent-idx="{target_index}"]').first
            await loc.scroll_into_view_if_needed(timeout=3000)
            try:
                await loc.fill(text, timeout=3000)
            except Exception:
                await loc.click(timeout=3000)
                await page.keyboard.type(text)
            return True, None

        if action == "scroll":
            delta = -450 if (text and "up" in text.lower()) else 450
            await page.evaluate("(y) => window.scrollBy({ top: y, behavior: 'smooth' })", delta)
            return True, None

        if action == "wait":
            await page.wait_for_timeout(800)
            return True, None

        if action == "quit":
            return True, None

        return False, f"unexpected action {action!r}"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


async def _has_checkout_success(page: Page) -> bool:
    try:
        body_text = await page.inner_text("body", timeout=2000)
    except Exception:
        return False
    return bool(CHECKOUT_SUCCESS_RE.search(body_text))


async def _run_persona(
    browser: Browser,
    persona: dict[str, Any],
    ctx: RunContext,
    emit: Emit,
    lab_dir: Path,
    model_sem: asyncio.Semaphore,
) -> dict[str, Any]:
    persona_id = str(persona["id"])
    viewport = persona["viewport"]
    persona_video_dir = lab_dir / persona_id
    persona_video_dir.mkdir(parents=True, exist_ok=True)
    final_video_path = lab_dir / f"{persona_id}.webm"
    actions_path = lab_dir / f"{persona_id}.json"

    actions: list[dict[str, Any]] = []
    outcome = "quit"
    fallback_quit_reason: str | None = None

    context = await browser.new_context(
        viewport=viewport,
        record_video_dir=str(persona_video_dir),
        record_video_size=viewport,
    )
    page = await context.new_page()
    video = page.video
    t0 = time.monotonic()

    await emit(
        "persona_started",
        "lab",
        {
            "persona_id": persona_id,
            "name": persona["name"],
            "role": persona["role"],
            "device": persona["device"],
        },
    )

    recorded_video_raw: Path | None = None
    try:
        await page.goto(str(ctx.mvp_url), wait_until="load", timeout=15000)
        await page.wait_for_timeout(300)

        consecutive_errors = 0
        for step in range(1, MAX_STEPS + 1):
            elements = await page.evaluate(COLLECT_ELEMENTS_JS)
            screenshot_bytes = await page.screenshot(type="png")

            try:
                async with model_sem:
                    decision = await asyncio.to_thread(
                        _pick_next_action_sync,
                        persona,
                        screenshot_bytes,
                        elements,
                        actions,
                        step,
                    )
                consecutive_errors = 0
            except Exception as exc:
                consecutive_errors += 1
                await emit(
                    "error",
                    "lab",
                    {
                        "message": f"{persona_id} step {step} model error: {type(exc).__name__}",
                        "recoverable": True,
                    },
                )
                if consecutive_errors >= 2:
                    decision = {
                        "action": "quit",
                        "target_index": None,
                        "text": None,
                        "thought": "Stopped interacting after repeated errors.",
                    }
                else:
                    decision = {
                        "action": "wait",
                        "target_index": None,
                        "text": None,
                        "thought": "Pausing briefly while evaluating the page.",
                    }

            target = _resolve_target(decision, elements)
            executed_ok, err = await _execute_action(page, decision)
            if decision["action"] != "quit":
                await page.wait_for_timeout(450)

            step_t = round(time.monotonic() - t0, 2)
            action_entry = {
                "step": step,
                "t": step_t,
                "action": decision["action"],
                "target": target,
                "target_index": decision["target_index"],
                "text": decision["text"],
                "thought": decision["thought"],
                "executed_ok": executed_ok,
                "error": err,
            }
            actions.append(action_entry)

            await emit(
                "persona_action",
                "lab",
                {
                    "persona_id": persona_id,
                    "t": step_t,
                    "action": decision["action"],
                    "target": target,
                    "thought": decision["thought"],
                },
            )

            if decision["action"] == "quit":
                outcome = "quit"
                break
            if await _has_checkout_success(page):
                outcome = "converted"
                break
        else:
            if await _has_checkout_success(page):
                outcome = "converted"
            else:
                outcome = "quit"
    except Exception as exc:
        outcome = "quit"
        fallback_quit_reason = f"Failed to complete visit: {type(exc).__name__}"
        await emit(
            "error",
            "lab",
            {
                "message": f"{persona_id} browser session failed: {type(exc).__name__}",
                "recoverable": True,
            },
        )
    finally:
        await context.close()
        if video is not None:
            try:
                raw_path = await video.path()
                if raw_path:
                    recorded_video_raw = Path(raw_path)
            except Exception:
                recorded_video_raw = None

    if recorded_video_raw is None or not recorded_video_raw.exists():
        webms = sorted(persona_video_dir.glob("*.webm"))
        if webms:
            recorded_video_raw = webms[0]

    if recorded_video_raw is not None and recorded_video_raw.exists():
        recorded_video_raw.replace(final_video_path)

    try:
        persona_video_dir.rmdir()
    except OSError:
        pass

    duration_s = round(time.monotonic() - t0, 2)
    video_url = ctx.artifact_url(final_video_path) if final_video_path.exists() else ""

    quit_reason: str | None = None
    if outcome == "quit":
        last_thought = ""
        for item in reversed(actions):
            if item.get("thought"):
                last_thought = str(item["thought"]).strip()
                break
        quit_reason = (
            last_thought or fallback_quit_reason or "Left the page without completing checkout."
        )
        # Hit the step limit without choosing "quit": say so instead of showing a mid-task thought.
        if actions and actions[-1].get("action") != "quit" and not fallback_quit_reason:
            quit_reason = f"Ran out of patience after {len(actions)} steps without finishing checkout. Last thought: {last_thought}"

    finished_data: dict[str, Any] = {
        "persona_id": persona_id,
        "outcome": outcome,
        "quit_reason": quit_reason,
        "video_url": video_url,
        "duration_s": duration_s,
    }

    actions_path.write_text(
        json.dumps(
            {
                **finished_data,
                "name": persona["name"],
                "role": persona["role"],
                "device": persona["device"],
                "viewport": viewport,
                "actions": actions,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    await emit("persona_finished", "lab", finished_data)
    return {**finished_data, "actions": actions}


async def run(ctx: RunContext, emit: Emit) -> None:
    if not ctx.mvp_url:
        await emit(
            "error",
            "lab",
            {"message": "Skipping usability lab: no MVP URL available.", "recoverable": True},
        )
        return

    personas = json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))
    lab_dir = ctx.run_dir / "lab"
    lab_dir.mkdir(parents=True, exist_ok=True)
    model_sem = asyncio.Semaphore(6)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            results = await asyncio.gather(
                *[
                    _run_persona(browser, persona, ctx, emit, lab_dir, model_sem)
                    for persona in personas
                ]
            )
        finally:
            await browser.close()

    ctx.lab_results.extend(results)
