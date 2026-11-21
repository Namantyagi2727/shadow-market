"""Spike 3: Drive a local MVP page in headless Chromium as persona_02, recording video and actions."""

from __future__ import annotations

import base64
import inspect
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
load_dotenv(REPO_ROOT / ".env")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from google import genai  # noqa: E402
from playwright.sync_api import Page, sync_playwright  # noqa: E402

from models import MODEL_IDS  # noqa: E402

MVP_HTML_PATH = BACKEND_DIR / "runs" / "spikes" / "mvp" / "index.html"
PERSONAS_PATH = BACKEND_DIR / "personas.json"
OUT_DIR = BACKEND_DIR / "runs" / "spikes" / "persona"

TARGET_PERSONA_ID = "persona_02"
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

FALLBACK_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pocket Espresso Maker</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #faf7f2; color: #1c1917; line-height: 1.5; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }
    .card { background: #fff; border-radius: 14px; padding: 20px; margin-bottom: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .price { font-size: 36px; font-weight: 800; margin: 12px 0; }
    button { background: #b45309; color: #fff; border: none; border-radius: 10px; padding: 12px 18px; font-size: 16px; font-weight: 700; width: 100%; cursor: pointer; }
    button.secondary { background: #e7e5e4; color: #1c1917; margin-top: 8px; }
    input, select { width: 100%; padding: 11px 12px; border: 1px solid #d6d3d1; border-radius: 8px; font-size: 16px; margin: 6px 0 12px; }
    .hidden { display: none; }
    .ok { background: #ecfdf5; border: 1px solid #10b981; color: #065f46; padding: 12px; border-radius: 8px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>Pocket Espresso Maker</h1>
      <p>Hand-powered 9-bar espresso anywhere. No batteries, no pods.</p>
      <div class="price">$49</div>
      <button id="hero-buy" type="button">Buy now</button>
    </section>

    <section class="card">
      <h2>Get 10% off your first order</h2>
      <form id="signup-form">
        <label for="signup-email">Email</label>
        <input id="signup-email" type="email" placeholder="you@example.com" required />
        <button type="submit">Claim 10% code</button>
      </form>
      <div id="signup-msg" class="ok hidden">You are on the list! Use code ESPRESSO10.</div>
    </section>

    <section class="card" id="checkout">
      <h2>Quick Checkout (Demo)</h2>
      <div id="step-1">
        <label for="qty">Quantity</label>
        <select id="qty"><option value="1">1 ($49)</option><option value="2">2 ($98)</option></select>
        <label for="buyer-name">Full name</label>
        <input id="buyer-name" type="text" placeholder="Priya Nair" />
        <label for="buyer-email">Email for receipt</label>
        <input id="buyer-email" type="email" placeholder="priya@example.com" />
        <button id="to-step-2" type="button">Continue to review</button>
      </div>
      <div id="step-2" class="hidden">
        <p id="summary"></p>
        <button id="complete-order" type="button">Complete order</button>
        <button id="back-step-1" class="secondary" type="button">Back</button>
      </div>
      <div id="step-done" class="ok hidden">
        Order confirmed! Thank you for your purchase. Order #PEM-2026.
      </div>
    </section>
  </div>
  <script>
    document.getElementById("hero-buy").addEventListener("click", () => {
      document.getElementById("checkout").scrollIntoView({ behavior: "smooth" });
    });
    document.getElementById("signup-form").addEventListener("submit", (e) => {
      e.preventDefault();
      document.getElementById("signup-msg").classList.remove("hidden");
    });
    document.getElementById("to-step-2").addEventListener("click", () => {
      const qty = Number(document.getElementById("qty").value || 1);
      const name = document.getElementById("buyer-name").value || "Guest";
      const email = document.getElementById("buyer-email").value || "guest@example.com";
      document.getElementById("summary").textContent =
        `Review: ${qty}x Pocket Espresso Maker ($${qty * 49}) for ${name} (${email})`;
      document.getElementById("step-1").classList.add("hidden");
      document.getElementById("step-2").classList.remove("hidden");
    });
    document.getElementById("back-step-1").addEventListener("click", () => {
      document.getElementById("step-2").classList.add("hidden");
      document.getElementById("step-1").classList.remove("hidden");
    });
    document.getElementById("complete-order").addEventListener("click", () => {
      document.getElementById("step-2").classList.add("hidden");
      document.getElementById("step-done").classList.remove("hidden");
    });
  </script>
</body>
</html>
"""

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


def _sanitize_text(text: str) -> str:
    """Redact any API key values before printing diagnostics."""
    for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "API_KEY"):
        secret = os.environ.get(env_name)
        if secret and len(secret) >= 8:
            text = text.replace(secret, "[REDACTED]")
    return text


def _dump_object(label: str, obj: Any) -> None:
    print(f"[debug] {label} type={type(obj).__name__}")
    print(f"[debug] {label} dir={dir(obj)}")
    print(f"[debug] {label} raw={_sanitize_text(repr(obj))}")


def _load_persona(persona_id: str) -> dict[str, Any]:
    personas = json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))
    for persona in personas:
        if persona.get("id") == persona_id:
            return persona
    raise ValueError(f"Persona {persona_id!r} not found in {PERSONAS_PATH}")


def _start_html_server(html_bytes: bytes) -> tuple[ThreadingHTTPServer, str]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path in ("/", "/index.html") or self.path.startswith("/?"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html_bytes)))
                self.end_headers()
                self.wfile.write(html_bytes)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{port}/"


def _extract_output_text(resp: Any) -> str:
    if hasattr(resp, "output_text") and resp.output_text:
        return str(resp.output_text)

    _dump_object("persona_driver_response", resp)
    outputs = getattr(resp, "outputs", None)
    if isinstance(outputs, list):
        parts: list[str] = []
        for item in outputs:
            text = item.get("text") if isinstance(item, dict) else getattr(item, "text", None)
            if text:
                parts.append(str(text))
        if parts:
            return chr(10).join(parts)

    for attr in ("text", "content"):
        val = getattr(resp, attr, None)
        if isinstance(val, str) and val.strip():
            return val
    return ""


def _parse_action_json(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()

    parsed: dict[str, Any] | None = None
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            parsed = obj
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if match:
            try:
                obj = json.loads(match.group(0))
                if isinstance(obj, dict):
                    parsed = obj
            except json.JSONDecodeError:
                parsed = None

    if not parsed:
        return {
            "action": "wait",
            "target_index": None,
            "text": None,
            "thought": f"Could not parse JSON action from model output: {text[:120]}",
        }

    action = str(parsed.get("action", "wait")).strip().lower()
    if action not in ALLOWED_ACTIONS:
        action = "wait"

    target_raw = parsed.get("target_index")
    target_index = target_raw if isinstance(target_raw, int) and not isinstance(target_raw, bool) else None
    text_val = parsed.get("text")
    text_str = str(text_val) if text_val is not None else None
    thought = str(parsed.get("thought") or "").strip()

    return {
        "action": action,
        "target_index": target_index,
        "text": text_str,
        "thought": thought,
    }


def _detect_schema_kwarg(client: genai.Client) -> str | None:
    try:
        params = inspect.signature(client.interactions.create).parameters
    except (TypeError, ValueError):
        return None
    if "response_format" in params:
        return "response_format"
    if "response_schema" in params:
        return "response_schema"
    return None


def _pick_next_action(
    client: genai.Client,
    persona: dict[str, Any],
    screenshot_b64: str,
    elements: list[dict[str, Any]],
    history: list[dict[str, Any]],
    step: int,
    schema_kwarg: str | None,
) -> tuple[dict[str, Any], str | None]:
    prompt = f"""You are roleplaying the following website visitor evaluating a product page.
Persona JSON:
{json.dumps(persona, indent=2)}

Current step: {step} of {MAX_STEPS}.
Recent actions:
{json.dumps(history[-5:], indent=2)}

Visible interactive elements (use `index` for target_index):
{json.dumps(elements, indent=2)}

Decide your next single browser action strictly in character. If one of your quit_triggers fires or you decide not to buy, choose action "quit". Otherwise interact realistically (scroll to inspect, click buttons, type into forms).
Return ONLY a JSON object with keys:
{{"action": "click"|"type"|"scroll"|"wait"|"quit", "target_index": int|null, "text": str|null, "thought": str}}
For scroll, set text to "down" or "up". For type, set target_index and text. For click, set target_index. For wait or quit, target_index and text may be null."""

    kwargs: dict[str, Any] = {
        "model": MODEL_IDS["persona_driver"],
        "input": [
            {"type": "image", "data": screenshot_b64, "mime_type": "image/png"},
            {"type": "text", "text": prompt},
        ],
        "generation_config": {"thinking_level": "low"},
    }
    if schema_kwarg:
        kwargs[schema_kwarg] = ACTION_SCHEMA

    try:
        resp = client.interactions.create(**kwargs)
    except Exception as exc:  # noqa: BLE001
        if schema_kwarg:
            print(f"[warn] {schema_kwarg} not accepted ({type(exc).__name__}); falling back to JSON text parsing")
            kwargs.pop(schema_kwarg, None)
            schema_kwarg = None
            resp = client.interactions.create(**kwargs)
        else:
            raise

    raw_text = _extract_output_text(resp)
    return _parse_action_json(raw_text), schema_kwarg


def _execute_action(page: Page, decision: dict[str, Any]) -> tuple[bool, str | None]:
    action = decision["action"]
    target_index = decision["target_index"]
    text = decision["text"]

    try:
        if action == "click":
            if target_index is None:
                return False, "click action missing target_index"
            loc = page.locator(f'[data-agent-idx="{target_index}"]').first
            loc.scroll_into_view_if_needed(timeout=3000)
            loc.click(timeout=3000)
            return True, None

        if action == "type":
            if target_index is None or text is None:
                return False, "type action missing target_index or text"
            loc = page.locator(f'[data-agent-idx="{target_index}"]').first
            loc.scroll_into_view_if_needed(timeout=3000)
            try:
                loc.fill(text, timeout=3000)
            except Exception:  # noqa: BLE001
                loc.click(timeout=3000)
                page.keyboard.type(text)
            return True, None

        if action == "scroll":
            delta = -450 if (text and "up" in text.lower()) else 450
            page.evaluate("(y) => window.scrollBy({ top: y, behavior: 'smooth' })", delta)
            return True, None

        if action == "wait":
            page.wait_for_timeout(800)
            return True, None

        if action == "quit":
            return True, None

        return False, f"unexpected action {action!r}"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


def _has_checkout_success(page: Page) -> bool:
    try:
        body_text = page.inner_text("body", timeout=2000)
    except Exception:  # noqa: BLE001
        return False
    return bool(CHECKOUT_SUCCESS_RE.search(body_text))


def main() -> int:
    start = time.monotonic()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    actions_path = OUT_DIR / "actions.json"
    final_video_path = OUT_DIR / f"{TARGET_PERSONA_ID}.webm"

    server: ThreadingHTTPServer | None = None
    try:
        persona = _load_persona(TARGET_PERSONA_ID)
        viewport = persona["viewport"]

        if MVP_HTML_PATH.exists() and MVP_HTML_PATH.stat().st_size > 0:
            html_bytes = MVP_HTML_PATH.read_bytes()
            source = str(MVP_HTML_PATH)
        else:
            html_bytes = FALLBACK_HTML.encode("utf-8")
            source = "fallback_inline_html"

        server, url = _start_html_server(html_bytes)
        print(f"serving={source} url={url} persona={persona['id']} ({persona['name']})")

        client = genai.Client()
        schema_kwarg = _detect_schema_kwarg(client)
        step_logs: list[dict[str, Any]] = []
        outcome = "max_steps"
        recorded_video_raw: Path | None = None

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport=viewport,
                record_video_dir=str(OUT_DIR),
                record_video_size=viewport,
            )
            page = context.new_page()
            video = page.video

            try:
                page.goto(url, wait_until="load", timeout=10000)
                page.wait_for_timeout(300)

                for step in range(1, MAX_STEPS + 1):
                    elements = page.evaluate(COLLECT_ELEMENTS_JS)
                    screenshot_bytes = page.screenshot(type="png")
                    screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")

                    decision, schema_kwarg = _pick_next_action(
                        client=client,
                        persona=persona,
                        screenshot_b64=screenshot_b64,
                        elements=elements,
                        history=step_logs,
                        step=step,
                        schema_kwarg=schema_kwarg,
                    )

                    executed_ok, err = _execute_action(page, decision)
                    if decision["action"] != "quit":
                        page.wait_for_timeout(450)

                    step_elapsed = round(time.monotonic() - start, 2)
                    entry = {
                        "step": step,
                        "seconds": step_elapsed,
                        "action": decision["action"],
                        "target_index": decision["target_index"],
                        "text": decision["text"],
                        "thought": decision["thought"],
                        "executed_ok": executed_ok,
                        "error": err,
                    }
                    step_logs.append(entry)
                    print(
                        f"  [{step_elapsed:5.2f}s] step {step:2d}: {entry['action']:6s} "
                        f"idx={entry['target_index']} | {entry['thought']}"
                    )

                    if decision["action"] == "quit":
                        outcome = "quit"
                        break
                    if _has_checkout_success(page):
                        outcome = "checkout_success"
                        break
            finally:
                context.close()
                if video is not None:
                    recorded_video_raw = Path(video.path())
                browser.close()

        saved_video: Path | None = None
        if recorded_video_raw and recorded_video_raw.exists():
            recorded_video_raw.replace(final_video_path)
            saved_video = final_video_path

        total_elapsed = time.monotonic() - start
        actions_path.write_text(
            json.dumps(
                {
                    "persona_id": persona["id"],
                    "persona_name": persona["name"],
                    "viewport": viewport,
                    "model": MODEL_IDS["persona_driver"],
                    "source": source,
                    "outcome": outcome,
                    "steps_taken": len(step_logs),
                    "elapsed_seconds": round(total_elapsed, 2),
                    "video": str(saved_video) if saved_video else None,
                    "actions": step_logs,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        print(f"outcome={outcome} steps={len(step_logs)} video={saved_video} log={actions_path}")
        if saved_video and saved_video.exists() and saved_video.stat().st_size > 0:
            print(f"PASS ({total_elapsed:.2f}s)")
            return 0

        print(f"FAIL: video file missing or empty ({total_elapsed:.2f}s)")
        return 1

    except Exception as exc:  # noqa: BLE001
        elapsed = time.monotonic() - start
        print(f"FAIL: {type(exc).__name__}: {_sanitize_text(str(exc))} ({elapsed:.2f}s)")
        return 1
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    raise SystemExit(main())
