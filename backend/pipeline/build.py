"""Build stage: builds a self-contained single-file MVP landing page and captures a screenshot."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright

from pipeline.context import Emit, RunContext
from pipeline.llm import MODEL_IDS, beta, generate_text, output_text

MANAGED_AGENT_TIMEOUT_S = 240.0
PROGRESS_INTERVAL_S = 10.0


def _build_prompt(pitch: dict[str, Any], spec: dict[str, Any], competitors: list[dict[str, Any]]) -> str:
    price = spec.get("price_usd", pitch.get("price_usd", 29))
    headline = spec.get("headline") or pitch.get("one_liner") or pitch.get("title") or "Product Launch"

    competitor_lines = ""
    if competitors:
        formatted = chr(10).join(
            f"- {c.get('title')} (${c['price_usd']})" if c.get("price_usd") is not None else f"- {c.get('title')}"
            for c in competitors
        )
        competitor_lines = f"""
Known market alternatives (for positioning context only; do not copy brands):
{formatted}
"""

    return f"""Create a single self-contained `index.html` file (inline CSS inside <style> and inline JS inside <script>, NO external assets, NO external fonts, CDNs, scripts, or external images — inline SVG illustrations are encouraged) for this product MVP landing page.

Product pitch:
{json.dumps(pitch, indent=2)}

Agreed V1 launch spec:
{json.dumps(spec, indent=2)}
{competitor_lines}
Required sections & interactive behavior:
1. Hero section: bold headline ("{headline}"), concise value proposition tailored to the target user, a clean inline SVG product illustration (reflecting any sketch_notes if present), clear price (${price}), and a prominent "Buy now" CTA button that scrolls smoothly to or opens checkout.
2. Product sections matching the spec pages ({json.dumps(spec.get("pages", []))}): concise benefits, specs, and clear answers to the risks raised in the boardroom ({json.dumps(spec.get("risks", []))}).
3. Honest details section: transparent shipping timeline & cost, straightforward return policy, and a real-looking support contact email/FAQ so buyers know what to expect.
4. Signup form: email waitlist / launch updates signup with an email input, submit button, basic validation, and a visible inline confirmation message on submit.
5. 2-step fake checkout (clearly labeled as a demo/pre-order checkout; NO real payment processing or real card collection):
   - Step 1: Select quantity (default 1), enter full name and shipping email, and click "Continue to review".
   - Step 2: Show order summary (product title, quantity, total price = quantity * ${price}, customer name/email) with a "Back" button and a "Complete order" button.
   - Confirmation state: Clicking "Complete order" displays a clear visible confirmation message containing the exact phrase "Order confirmed" (e.g. "Order confirmed! Thank you for your purchase.") along with a generated fake order number.
6. Responsive mobile-friendly styling: clean, modern visual hierarchy with readable contrast and zero horizontal overflow on both a 390x844 mobile viewport and a 1280x800 desktop viewport.

Write `index.html`, check that all interactive JS flows work cleanly with no syntax errors, and in your final reply print the COMPLETE contents of `index.html` verbatim wrapped between these exact markers on their own lines:
<<<HTML
...full index.html content...
HTML>>>
"""


def _extract_html(raw_text: str, require_markers: bool) -> str | None:
    matches = re.findall(r"<<<HTML\s*(.*?)\s*HTML>>>", raw_text, flags=re.DOTALL)
    candidate = matches[-1].strip() if matches else None

    if candidate:
        candidate = re.sub(r"^```(?:html)?\s*", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s*```$", "", candidate).strip()

    if not candidate and not require_markers:
        fence_matches = re.findall(r"```html\s*(.*?)\s*```", raw_text, flags=re.DOTALL | re.IGNORECASE)
        if fence_matches:
            candidate = fence_matches[-1].strip()

    if not candidate and not require_markers:
        doc_match = re.search(
            r"(<!DOCTYPE html>.*?</html>|<html\b.*?</html>)",
            raw_text,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if doc_match:
            candidate = doc_match.group(1).strip()

    if candidate and ("<html" in candidate.lower() or "<!doctype html" in candidate.lower()):
        return candidate
    return None


def _run_managed_agent(prompt: str) -> str:
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


async def _capture_screenshot(index_path: Path, screenshot_path: Path) -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(index_path.resolve().as_uri(), wait_until="load", timeout=15000)
            await page.wait_for_timeout(300)
            await page.screenshot(path=str(screenshot_path), full_page=True)
        finally:
            await browser.close()


async def run(ctx: RunContext, emit: Emit) -> None:
    pitch = ctx.pitch or {}
    spec = ctx.spec or {}
    prompt = _build_prompt(pitch, spec, ctx.competitors)

    mvp_dir = ctx.run_dir / "mvp"
    mvp_dir.mkdir(parents=True, exist_ok=True)
    index_path = mvp_dir / "index.html"
    screenshot_path = mvp_dir / "screenshot.png"

    html: str | None = None
    fallback_reason: str | None = None

    await emit("build_progress", "build", {"message": "Starting managed agent build in Google sandbox…"})
    start = time.monotonic()
    deadline = start + MANAGED_AGENT_TIMEOUT_S

    agent_task: asyncio.Task[str] = asyncio.create_task(asyncio.to_thread(_run_managed_agent, prompt))
    while not agent_task.done():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            fallback_reason = f"timed out after {int(MANAGED_AGENT_TIMEOUT_S)}s"
            agent_task.add_done_callback(_swallow_task_exception)
            break

        done, _ = await asyncio.wait({agent_task}, timeout=min(PROGRESS_INTERVAL_S, remaining))
        if agent_task in done:
            break

        elapsed = int(time.monotonic() - start)
        await emit(
            "build_progress",
            "build",
            {"message": f"Managed agent building in Google sandbox… {elapsed}s"},
        )

    if fallback_reason is None:
        try:
            raw_output = agent_task.result()
            html = _extract_html(raw_output, require_markers=True)
            if not html:
                fallback_reason = "no <<<HTML ... HTML>>> output markers found"
        except Exception as exc:  # noqa: BLE001
            fallback_reason = f"{type(exc).__name__}"

    if not html:
        await emit(
            "build_progress",
            "build",
            {
                "message": (
                    f"Managed agent fallback triggered ({fallback_reason}); "
                    "generating self-contained MVP directly with Hydrogen…"
                )
            },
        )
        fallback_raw = await asyncio.to_thread(
            generate_text,
            MODEL_IDS["persona_driver"],
            prompt,
            "low",
        )
        html = _extract_html(fallback_raw, require_markers=False)
        if not html:
            raise RuntimeError("Fallback HTML generation did not return a valid HTML document")

    index_path.write_text(html, encoding="utf-8")
    ctx.mvp_dir = mvp_dir
    base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
    ctx.mvp_url = base_url + ctx.artifact_url(index_path)

    await emit("build_progress", "build", {"message": "Capturing MVP screenshot…"})
    screenshot_url = ""
    try:
        await _capture_screenshot(index_path, screenshot_path)
        ctx.screenshot_path = screenshot_path
        screenshot_url = ctx.artifact_url(screenshot_path)
    except Exception as exc:  # noqa: BLE001
        ctx.screenshot_path = None
        await emit(
            "error",
            "build",
            {
                "message": f"MVP screenshot failed ({type(exc).__name__})",
                "recoverable": True,
            },
        )

    await emit(
        "mvp_ready",
        "build",
        {
            "url": ctx.artifact_url(index_path),
            "screenshot_url": screenshot_url,
            "hero_image_url": None,
        },
    )
