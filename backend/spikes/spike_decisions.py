"""Spike 1: Render a tiny product landing page with Playwright and evaluate it via the Decisions API."""

from __future__ import annotations

import base64
import json
import os
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
from playwright.sync_api import sync_playwright  # noqa: E402

from models import MODEL_IDS  # noqa: E402

OUT_DIR = BACKEND_DIR / "runs" / "spikes" / "decisions"

LANDING_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pocket Espresso Maker</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f0ea;
      color: #1c1917;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border-radius: 18px;
      box-shadow: 0 14px 36px rgba(28, 25, 23, 0.08);
      max-width: 480px;
      width: 100%;
      padding: 40px 36px;
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      font-size: 13px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 999px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 32px;
      margin: 0 0 10px;
      letter-spacing: -0.02em;
    }
    p {
      color: #57534e;
      font-size: 16px;
      line-height: 1.5;
      margin: 0 0 24px;
    }
    .price {
      font-size: 44px;
      font-weight: 800;
      color: #1c1917;
      margin: 0 0 24px;
    }
    .cta {
      display: inline-block;
      background: #b45309;
      color: #ffffff;
      font-size: 18px;
      font-weight: 700;
      padding: 14px 36px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
    }
    .footnote {
      margin-top: 18px;
      font-size: 13px;
      color: #78716c;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Hand-powered &middot; No batteries needed</div>
    <h1>Pocket espresso maker</h1>
    <p>Pull rich 9-bar espresso anywhere with hot water and your favorite ground coffee.</p>
    <div class="price">$49</div>
    <button class="cta" type="button">Buy now</button>
    <div class="footnote">30-day returns &middot; Ships in 3 business days</div>
  </main>
</body>
</html>
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


def _render_landing_png(png_path: Path) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 800, "height": 600})
            page.set_content(LANDING_HTML, wait_until="load")
            page.screenshot(path=str(png_path), full_page=True)
        finally:
            browser.close()


def _extract_answer(ans: Any, field: str, q_name: str) -> tuple[Any, Any, bool]:
    """Return (value, confidence, ok). Prints debug info if attributes differ."""
    if isinstance(ans, dict):
        val = ans.get(field)
        conf = ans.get("confidence")
        if val is None:
            _dump_object(f"answers[{q_name!r}]", ans)
            return val, conf, False
        return val, conf, True

    if not hasattr(ans, field):
        _dump_object(f"answers[{q_name!r}]", ans)
        return None, getattr(ans, "confidence", None), False

    return getattr(ans, field), getattr(ans, "confidence", None), True


def main() -> int:
    start = time.monotonic()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png_path = OUT_DIR / "landing.png"
    result_path = OUT_DIR / "result.json"

    try:
        _render_landing_png(png_path)
        img_b64 = base64.b64encode(png_path.read_bytes()).decode("ascii")

        beta = genai.Client(http_options={"api_version": "v1beta"})
        response = beta.decisions.create(
            model=MODEL_IDS["decisions"],
            input=[
                {"type": "image", "data": img_b64, "mime_type": "image/png"},
                {
                    "type": "text",
                    "text": (
                        "Evaluate this product landing page for a Pocket espresso maker "
                        "priced at $49."
                    ),
                },
            ],
            questions={
                "price_visible": {
                    "type": "noul",
                    "instructions": "Is the price clearly visible?",
                },
                "buyer_action": {
                    "type": "choice",
                    "instructions": "What is a shopper most likely to do on this landing page?",
                    "criteria": {
                        "buy": "Click Buy now to purchase the product",
                        "compare": "Look elsewhere to compare alternatives and prices first",
                        "leave": "Leave the page without engaging further",
                        "other": "Take another action not listed above",
                    },
                },
                "trust": {
                    "type": "score",
                    "instructions": "How trustworthy does this product landing page appear?",
                    "criteria": ["low", "medium", "high"],
                },
            },
        )

        answers = getattr(response, "answers", None)
        if answers is None:
            _dump_object("decisions_response", response)
            elapsed = time.monotonic() - start
            print(f"FAIL: response missing 'answers' attribute ({elapsed:.2f}s)")
            return 1

        spec = [
            ("price_visible", "noul"),
            ("buyer_action", "choice"),
            ("trust", "score"),
        ]
        parsed: dict[str, dict[str, Any]] = {}
        all_ok = True

        for q_name, field in spec:
            ans = answers.get(q_name) if isinstance(answers, dict) else getattr(answers, q_name, None)
            if ans is None:
                _dump_object("decisions_response", response)
                print(f"  {q_name}: MISSING")
                all_ok = False
                continue

            val, conf, ok = _extract_answer(ans, field, q_name)
            if not ok:
                all_ok = False
            parsed[q_name] = {"field": field, "value": val, "confidence": conf}
            print(f"  {q_name} ({field}): {val!r} | confidence={conf!r}")

        result_path.write_text(
            json.dumps(
                {
                    "model": MODEL_IDS["decisions"],
                    "screenshot": str(png_path),
                    "answers": parsed,
                },
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )

        elapsed = time.monotonic() - start
        if all_ok:
            print(f"PASS ({elapsed:.2f}s)")
            return 0
        print(f"FAIL: one or more answer fields differed from expected schema ({elapsed:.2f}s)")
        return 1

    except Exception as exc:  # noqa: BLE001
        elapsed = time.monotonic() - start
        print(f"FAIL: {type(exc).__name__}: {_sanitize_text(str(exc))} ({elapsed:.2f}s)")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
