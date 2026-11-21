"""Spike 2: Use the Managed Agent (Antigravity remote sandbox) to build a single-file MVP landing page."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
load_dotenv(REPO_ROOT / ".env")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from google import genai  # noqa: E402

from models import MODEL_IDS  # noqa: E402

OUT_DIR = BACKEND_DIR / "runs" / "spikes" / "mvp"
HTML_PATH = OUT_DIR / "index.html"
META_PATH = OUT_DIR / "build_meta.json"

BUILD_PROMPT = """Create a single self-contained `index.html` file (inline CSS in <style> and inline JS in <script>, NO external assets, NO external fonts/CDNs/scripts/images — inline SVG is fine) for a product landing page:

Product: Pocket Espresso Maker — $49 ("Hand-powered 9-bar espresso anywhere").

Required sections & interactive behavior:
1. Hero section: bold headline, concise value proposition, simple inline SVG product visual, clear price ($49), and a prominent "Buy now" CTA button that opens/scrolls to checkout.
2. Signup form: email waitlist / 10% launch discount signup with an email input, submit button, basic validation, and a clear inline confirmation message on submit.
3. 2-step fake checkout (demo only, NO real payment processing or real card collection):
   - Step 1: Select quantity (default 1), enter full name and shipping email, and click "Continue to review".
   - Step 2: Show the order summary (item, quantity, total price, customer name/email) with a "Back" button and a "Complete order" button.
   - Confirmation state: Clicking "Complete order" displays a clear visible confirmation message containing the exact phrase "Order confirmed! Thank you for your purchase." and a generated fake order number.
4. Responsive mobile-first styling so it renders cleanly with no horizontal overflow on a 390x844 mobile viewport as well as desktop.

Write `index.html` in the workspace, verify there are no syntax errors, and in your final reply print the COMPLETE contents of `index.html` verbatim wrapped between these exact markers on their own lines:
<<<HTML
...full index.html content...
HTML>>>
"""


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


def _extract_output_text(run: Any) -> tuple[str | None, bool]:
    """Read run.output_text, falling back to other common attributes while dumping dir() if needed."""
    if hasattr(run, "output_text") and run.output_text:
        return str(run.output_text), True

    _dump_object("managed_agent_run", run)

    outputs = getattr(run, "outputs", None)
    if isinstance(outputs, list):
        parts: list[str] = []
        for item in outputs:
            text = item.get("text") if isinstance(item, dict) else getattr(item, "text", None)
            if text:
                parts.append(str(text))
        if parts:
            return chr(10).join(parts), False

    for attr in ("text", "result", "content"):
        val = getattr(run, attr, None)
        if isinstance(val, str) and val.strip():
            return val, False

    return None, False


def _extract_html(raw_text: str) -> str | None:
    """Extract HTML between <<<HTML and HTML>>> markers, with fallbacks for fenced or raw HTML."""
    matches = re.findall(r"<<<HTML\s*(.*?)\s*HTML>>>", raw_text, flags=re.DOTALL)
    candidate = matches[-1].strip() if matches else None

    if candidate:
        candidate = re.sub(r"^```(?:html)?\s*", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s*```$", "", candidate)
        candidate = candidate.strip()

    if not candidate:
        fence_matches = re.findall(r"```html\s*(.*?)\s*```", raw_text, flags=re.DOTALL | re.IGNORECASE)
        if fence_matches:
            candidate = fence_matches[-1].strip()

    if not candidate:
        doc_match = re.search(r"(<!DOCTYPE html>.*?</html>|<html\b.*?</html>)", raw_text, flags=re.DOTALL | re.IGNORECASE)
        if doc_match:
            candidate = doc_match.group(1).strip()

    if candidate and ("<html" in candidate.lower() or "<!doctype html" in candidate.lower()):
        return candidate
    return None


def main() -> int:
    start = time.monotonic()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    try:
        beta = genai.Client(http_options={"api_version": "v1beta"})
        run = beta.interactions.create(
            agent=MODEL_IDS["builder_agent"],
            environment="remote",
            agent_config={
                "type": "antigravity",
                "model": MODEL_IDS["persona_driver"],
                "max_total_tokens": 100000,
            },
            input=BUILD_PROMPT,
        )

        env_id = getattr(run, "environment_id", None)
        if env_id is None:
            _dump_object("managed_agent_run_missing_env_id", run)
            env_id = getattr(run, "environment", None)

        output_text, exact_attr = _extract_output_text(run)
        if not output_text:
            elapsed = time.monotonic() - start
            print(f"environment_id={env_id!r}")
            print(f"FAIL: could not extract output text from managed agent response ({elapsed:.2f}s)")
            return 1

        html = _extract_html(output_text)
        META_PATH.write_text(
            json.dumps(
                {
                    "agent": MODEL_IDS["builder_agent"],
                    "model": MODEL_IDS["persona_driver"],
                    "environment_id": env_id,
                    "output_text_attr_present": exact_attr,
                    "raw_output_length": len(output_text),
                    "html_extracted": html is not None,
                },
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )

        if not html:
            (OUT_DIR / "raw_output.txt").write_text(_sanitize_text(output_text), encoding="utf-8")
            elapsed = time.monotonic() - start
            print(f"environment_id={env_id!r}")
            print(f"FAIL: no HTML found between <<<HTML and HTML>>> markers ({elapsed:.2f}s)")
            return 1

        HTML_PATH.write_text(html, encoding="utf-8")
        file_size = HTML_PATH.stat().st_size
        print(f"environment_id={env_id}")
        print(f"saved={HTML_PATH} ({file_size} bytes)")

        elapsed = time.monotonic() - start
        print(f"PASS ({elapsed:.2f}s)")
        return 0

    except Exception as exc:  # noqa: BLE001
        elapsed = time.monotonic() - start
        print(f"FAIL: {type(exc).__name__}: {_sanitize_text(str(exc))} ({elapsed:.2f}s)")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
