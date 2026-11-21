"""Browser-lab UX-trap evaluation: 3-persona Chromium panel vs static-screenshot baseline.

Run from repo root:
    uv run --project backend python eval/lab/run_lab_eval.py
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import functools
import json
import os
import re
import shutil
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from playwright.async_api import async_playwright  # noqa: E402

from pipeline import lab  # noqa: E402
from pipeline.context import RunContext  # noqa: E402
from pipeline.llm import MODEL_IDS, beta, client, generate_text, image_part, text_part  # noqa: E402

EVAL_LAB_DIR = REPO_ROOT / "eval" / "lab"
PAGES_DIR = EVAL_LAB_DIR / "pages"
RUNS_DIR = EVAL_LAB_DIR / "runs"
RESULTS_DIR = EVAL_LAB_DIR / "results"
LAB_RESULTS_JSON_PATH = EVAL_LAB_DIR / "lab_results.json"
LAB_RESULTS_MD_PATH = EVAL_LAB_DIR / "LAB_RESULTS.md"

PERSONAS_PATH = BACKEND_DIR / "personas.json"
PANEL_PERSONA_IDS = ("persona_01", "persona_02", "persona_03")

PAGE_SOURCES: list[tuple[str, Path]] = [
    ("r_066ae675", BACKEND_DIR / "runs" / "r_066ae675" / "mvp" / "index.html"),
    ("r_35bf7899", BACKEND_DIR / "runs" / "r_35bf7899" / "mvp" / "index.html"),
    ("r_9828b9cf", BACKEND_DIR / "runs" / "r_9828b9cf" / "mvp" / "index.html"),
    ("r_c5da68f4", BACKEND_DIR / "runs" / "r_c5da68f4" / "mvp" / "index.html"),
    ("spikes", BACKEND_DIR / "runs" / "spikes" / "mvp" / "index.html"),
]

TRAPS: tuple[str, ...] = (
    "hidden_fee",
    "dead_cta",
    "tiny_targets",
    "price_hidden",
    "forced_signup",
)
VARIANTS: tuple[str, ...] = ("clean",) + TRAPS
METHODS: tuple[str, ...] = ("panel", "baseline")

BASELINE_PROMPT = (
    "List every usability, trust or checkout problem a real shopper would hit on this product page."
)

TRAP_DESCRIPTIONS: dict[str, str] = {
    "hidden_fee": (
        "An unexpected or hidden extra handling fee (such as a non-refundable $14.99 handling fee) "
        "tacked onto the order total, summary, or order confirmation"
    ),
    "dead_cta": (
        "A broken or unresponsive call-to-action button or link (such as Buy, Order, Reserve, "
        "Pre-order, Checkout, or Continue) that does nothing when clicked"
    ),
    "tiny_targets": (
        "Extremely tiny, shrunk, or barely visible low-contrast call-to-action buttons that are "
        "hard to see or tap because of their tiny size and faded color"
    ),
    "price_hidden": (
        "Product prices are hidden or withheld on the page (for example replaced with 'Price shown "
        "at checkout' instead of showing the dollar price upfront)"
    ),
    "forced_signup": (
        "A blocking full-screen account-creation or signup modal/wall on load that prevents viewing "
        "the product without signing up, has no close button, or traps the user at email verification"
    ),
}

TRAP_KEYWORDS: dict[str, tuple[str, ...]] = {
    "hidden_fee": ("14.99", "handling fee", "non-refundable", "hidden fee", "extra fee", "fee"),
    "dead_cta": ("nothing happened", "does nothing", "unresponsive", "doesn't work", "broken", "dead", "click"),
    "tiny_targets": ("tiny", "small", "9px", "contrast", "faded", "opacity", "hard to see", "barely visible"),
    "price_hidden": ("price shown at checkout", "hidden", "no price", "price", "checkout"),
    "forced_signup": ("account", "sign up", "signup", "verify your email", "modal", "wall", "close button"),
}

TRAP_SCRIPTS: dict[str, str] = {
    "hidden_fee": r"""(function () {
  var MATCH_RE = /total|order summary|confirm/i;
  var CONFIRM_BTN_RE = /confirm|place order|complete/i;
  var CONFIRM_BOX_RE = /order\s+confirmed|thank\s+you|purchase\s+complete|order\s+placed|confirmation|order\s*#/i;
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TITLE: 1, META: 1, LINK: 1, HEAD: 1,
    SVG: 1, PATH: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1,
    BUTTON: 1, A: 1, IMG: 1, BR: 1, HR: 1
  };
  var FEE_TEXT = '+ $14.99 handling fee (non-refundable)';

  function makeFeeLine() {
    var div = document.createElement('div');
    div.setAttribute('data-trap-fee', '1');
    div.style.cssText = 'font-size:11px;line-height:1.35;color:#8a94a6;font-weight:400;margin-top:3px;';
    div.textContent = FEE_TEXT;
    return div;
  }

  function directText(el) {
    var out = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) {
        out += el.childNodes[i].nodeValue || '';
      }
    }
    return out.trim();
  }

  function hasMatchingDescendant(el) {
    var children = el.querySelectorAll('*');
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (SKIP_TAGS[c.tagName] || c.hasAttribute('data-trap-fee')) continue;
      if (MATCH_RE.test(directText(c))) return true;
    }
    return false;
  }

  function alreadyHasFee(container) {
    if (!container) return true;
    if (container.querySelector('[data-trap-fee]')) return true;
    if ((container.textContent || '').indexOf('$14.99 handling fee') !== -1) return true;
    return false;
  }

  function attachFees() {
    if (!document.body) return;
    var all = Array.prototype.slice.call(document.body.querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP_TAGS[el.tagName]) continue;
      if (el.hasAttribute('data-trap-fee') || el.closest('[data-trap-fee]')) continue;
      var dText = directText(el);
      var fullText = (el.textContent || '').trim();
      var matched = MATCH_RE.test(dText) || (
        fullText.length <= 140 && MATCH_RE.test(fullText) && !hasMatchingDescendant(el)
      );
      if (!matched) continue;

      if (el.tagName === 'SPAN' || el.tagName === 'STRONG' || el.tagName === 'B' || el.tagName === 'LABEL') {
        var parent = el.parentElement;
        if (!parent || alreadyHasFee(parent)) continue;
        var parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'flex' && parent.parentElement && !alreadyHasFee(parent.parentElement)) {
          parent.insertAdjacentElement('afterend', makeFeeLine());
        } else {
          el.insertAdjacentElement('afterend', makeFeeLine());
        }
      } else {
        if (alreadyHasFee(el)) continue;
        el.appendChild(makeFeeLine());
      }
    }
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function showFeeInConfirmation(clickedBtn) {
    attachFees();
    var all = Array.prototype.slice.call(document.body.querySelectorAll('div, section, p, article, main'));
    var best = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.hasAttribute('data-trap-fee') || el.closest('[data-trap-fee]')) continue;
      if (!isVisible(el)) continue;
      var txt = (el.innerText || el.textContent || '').trim();
      if (!CONFIRM_BOX_RE.test(txt)) continue;
      if (!best || txt.length < (best.innerText || best.textContent || '').trim().length) {
        best = el;
      }
    }
    if (best && !alreadyHasFee(best)) {
      best.appendChild(makeFeeLine());
      return;
    }
    if (!best && clickedBtn && clickedBtn.parentElement && !alreadyHasFee(clickedBtn.parentElement)) {
      clickedBtn.parentElement.appendChild(makeFeeLine());
    }
  }

  function applyTrap() {
    attachFees();
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest
        ? e.target.closest('button, input[type="submit"], input[type="button"], [role="button"], a')
        : null;
      if (!btn) return;
      var label = (btn.innerText || btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim();
      if (CONFIRM_BTN_RE.test(label)) {
        window.setTimeout(function () { showFeeInConfirmation(btn); }, 60);
      } else if (/continue|review|next|checkout/i.test(label)) {
        window.setTimeout(attachFees, 60);
      }
    }, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTrap);
  } else {
    applyTrap();
  }
})();""",
    "dead_cta": r"""(function () {
  var CTA_RE = /buy|order|reserve|pre-?order|checkout|get it|add to cart|continue/i;
  var CTA_SEL = 'a, button, input[type="submit"], input[type="button"], [role="button"], [role="link"]';

  function elementLabel(el) {
    return (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
  }

  function applyTrap() {
    document.addEventListener('click', function (e) {
      var target = e.target && e.target.closest ? e.target.closest(CTA_SEL) : null;
      if (!target) return;
      if (CTA_RE.test(elementLabel(target))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
      }
    }, true);

    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || !form.querySelectorAll) return;
      if (e.submitter && CTA_RE.test(elementLabel(e.submitter))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        return;
      }
      var submits = form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]');
      for (var i = 0; i < submits.length; i++) {
        if (CTA_RE.test(elementLabel(submits[i]))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
          return;
        }
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTrap);
  } else {
    applyTrap();
  }
})();""",
    "tiny_targets": r"""(function () {
  var CTA_RE = /buy|order|reserve|pre-?order|checkout|get it|add to cart|continue/i;
  var CTA_SEL = 'a, button, input[type="submit"], input[type="button"], [role="button"], [role="link"]';

  function resolveBg(el) {
    var cur = el.parentElement;
    while (cur && cur !== document.documentElement) {
      var bg = window.getComputedStyle(cur).backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        return bg;
      }
      cur = cur.parentElement;
    }
    var bodyBg = document.body ? window.getComputedStyle(document.body).backgroundColor : '';
    if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
      return bodyBg;
    }
    return '#ffffff';
  }

  function applyTrap() {
    var bodyColor = document.body ? (window.getComputedStyle(document.body).color || '#334155') : '#334155';
    var nodes = document.querySelectorAll(CTA_SEL);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var label = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
      if (!CTA_RE.test(label)) continue;
      var bg = resolveBg(el);
      var fg = bodyColor === bg ? '#64748b' : bodyColor;
      el.style.setProperty('font-size', '9px', 'important');
      el.style.setProperty('padding', '1px 2px', 'important');
      el.style.setProperty('min-height', '0', 'important');
      el.style.setProperty('min-width', '0', 'important');
      el.style.setProperty('line-height', '1', 'important');
      el.style.setProperty('width', 'auto', 'important');
      el.style.setProperty('flex', '0 0 auto', 'important');
      el.style.setProperty('background', bg, 'important');
      el.style.setProperty('background-color', bg, 'important');
      el.style.setProperty('border-color', bg, 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
      el.style.setProperty('color', fg, 'important');
      el.style.setProperty('opacity', '0.3', 'important');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTrap);
  } else {
    applyTrap();
  }
})();""",
    "price_hidden": r"""(function () {
  var PRICE_TEST_RE = /\$\d/;
  var PRICE_REPLACE_RE = /\$\d[\d,]*(?:\.\d{1,2})?/g;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, TITLE: 1 };

  function applyTrap() {
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var toUpdate = [];
    var node;
    while ((node = walker.nextNode())) {
      var val = node.nodeValue || '';
      if (!PRICE_TEST_RE.test(val)) continue;
      var parent = node.parentElement;
      if (!parent || SKIP_TAGS[parent.tagName]) continue;
      if (parent.closest && parent.closest('form')) continue;
      toUpdate.push(node);
    }
    for (var i = 0; i < toUpdate.length; i++) {
      var n = toUpdate[i];
      var trimmed = (n.nodeValue || '').trim();
      if (trimmed.length <= 28) {
        n.nodeValue = 'Price shown at checkout';
      } else {
        n.nodeValue = (n.nodeValue || '').replace(PRICE_REPLACE_RE, 'Price shown at checkout');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTrap);
  } else {
    applyTrap();
  }
})();""",
    "forced_signup": r"""(function () {
  function applyTrap() {
    if (!document.body || document.getElementById('lab-forced-signup-overlay')) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    var overlay = document.createElement('div');
    overlay.id = 'lab-forced-signup-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'background:rgba(15,23,42,0.94)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:20px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'
    ].join(';');

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#ffffff',
      'color:#0f172a',
      'max-width:420px',
      'width:100%',
      'border-radius:16px',
      'padding:28px',
      'box-shadow:0 24px 60px rgba(0,0,0,0.4)'
    ].join(';');

    card.innerHTML = ''
      + '<h2 style="margin:0 0 8px;font-size:1.35rem;line-height:1.25;">Create an account to see this product</h2>'
      + '<p style="margin:0 0 18px;font-size:0.92rem;color:#475569;">Sign up to continue viewing product details and pricing.</p>'
      + '<form id="labForcedSignupForm" novalidate>'
      + '  <div style="margin-bottom:12px;">'
      + '    <label for="labSignupEmail" style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;">Email</label>'
      + '    <input id="labSignupEmail" type="email" placeholder="you@example.com" required '
      + '      style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />'
      + '  </div>'
      + '  <div style="margin-bottom:16px;">'
      + '    <label for="labSignupPassword" style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;">Password</label>'
      + '    <input id="labSignupPassword" type="password" placeholder="Create a password" required '
      + '      style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />'
      + '  </div>'
      + '  <button type="submit" id="labSignupBtn" '
      + '    style="width:100%;padding:12px 16px;background:#0f172a;color:#ffffff;border:none;border-radius:8px;font-size:0.98rem;font-weight:700;cursor:pointer;">Sign up</button>'
      + '  <div id="labSignupStatus" role="status" '
      + '    style="display:none;margin-top:14px;padding:10px 12px;border-radius:8px;background:#fef3c7;color:#92400e;font-size:0.9rem;font-weight:600;"></div>'
      + '</form>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var form = document.getElementById('labForcedSignupForm');
    var status = document.getElementById('labSignupStatus');
    function showVerify(e) {
      e.preventDefault();
      e.stopPropagation();
      status.textContent = 'Please verify your email';
      status.style.display = 'block';
    }
    form.addEventListener('submit', showVerify);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTrap);
  } else {
    applyTrap();
  }
})();""",
}


def _sanitize_error(text: str) -> str:
    for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "API_KEY"):
        secret = os.environ.get(env_name)
        if secret and len(secret) >= 8:
            text = text.replace(secret, "[REDACTED]")
    return text


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + chr(10), encoding="utf-8")
    tmp.replace(path)


def _inject_script(html: str, script_body: str) -> str:
    nl = chr(10)
    tag = f'{nl}<script data-lab-trap="1">{nl}{script_body}{nl}</script>{nl}'
    match = re.search(r"</body\s*>", html, flags=re.IGNORECASE)
    if match:
        return html[: match.start()] + tag + html[match.start() :]
    return html + tag


def prepare_pages(selected_pages: list[str], selected_traps: list[str]) -> dict[tuple[str, str], Path]:
    """Copy the 5 clean MVP pages and write injected trap variants under eval/lab/pages/."""
    source_map = dict(PAGE_SOURCES)
    variant_paths: dict[tuple[str, str], Path] = {}

    for page_id in selected_pages:
        if page_id not in source_map:
            raise ValueError(f"Unknown page_id: {page_id!r}")
        src_path = source_map[page_id]
        clean_dir = PAGES_DIR / page_id / "clean"
        clean_dir.mkdir(parents=True, exist_ok=True)
        clean_index = clean_dir / "index.html"

        if src_path.is_file():
            shutil.copyfile(src_path, clean_index)
        else:
            demo_fallback = BACKEND_DIR / "demo_runs" / page_id / "mvp" / "index.html"
            if demo_fallback.is_file():
                shutil.copyfile(demo_fallback, clean_index)
            elif not clean_index.is_file():
                raise FileNotFoundError(
                    f"Missing source MVP page for {page_id}: expected {src_path}"
                )

        clean_html = clean_index.read_text(encoding="utf-8")
        if "clean" in selected_traps:
            variant_paths[(page_id, "clean")] = clean_index

        for trap in selected_traps:
            if trap == "clean":
                continue
            if trap not in TRAP_SCRIPTS:
                raise ValueError(f"Unknown trap: {trap!r}")
            trap_dir = PAGES_DIR / page_id / trap
            trap_dir.mkdir(parents=True, exist_ok=True)
            trap_index = trap_dir / "index.html"
            trap_html = _inject_script(clean_html, TRAP_SCRIPTS[trap])
            trap_index.write_text(trap_html, encoding="utf-8")
            variant_paths[(page_id, trap)] = trap_index

    return variant_paths


def load_panel_personas() -> list[dict[str, Any]]:
    raw: list[dict[str, Any]] = json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))
    by_id = {str(p["id"]): p for p in raw}
    selected: list[dict[str, Any]] = []
    for pid in PANEL_PERSONA_IDS:
        if pid not in by_id:
            raise RuntimeError(f"Missing required persona {pid!r} in {PERSONAS_PATH}")
        selected.append(by_id[pid])
    return selected


class _QuietHTTPHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        return None


@contextlib.contextmanager
def _serve_directory(directory: Path) -> Iterator[str]:
    handler = functools.partial(_QuietHTTPHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    server.daemon_threads = True
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}/index.html"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5.0)


async def _noop_emit(_type: str, _stage: Any, _data: dict[str, Any]) -> None:
    return None


def _format_panel_findings(
    persona_results: list[dict[str, Any]],
    persona_meta: dict[str, dict[str, Any]],
) -> str:
    blocks: list[str] = []
    for res in persona_results:
        pid = str(res.get("persona_id") or "unknown")
        meta = persona_meta.get(pid, {})
        name = meta.get("name", pid)
        device = meta.get("device", "")
        outcome = str(res.get("outcome") or "unknown")
        quit_reason = res.get("quit_reason")
        lines = [f"Tester {pid} ({name}, {device}) — outcome: {outcome}"]
        if quit_reason:
            lines.append(f"Quit reason: {quit_reason}")
        for act in res.get("actions") or []:
            step = act.get("step")
            action = act.get("action")
            target = str(act.get("target") or "").strip()
            thought = " ".join(str(act.get("thought") or "").split())
            ok = act.get("executed_ok")
            err = act.get("error")
            target_part = f" on '{target}'" if target else ""
            err_part = f" [error: {err}]" if ok is False and err else ""
            lines.append(f"  Step {step} ({action}{target_part}{err_part}): {thought}")
        blocks.append(chr(10).join(lines))
    return (chr(10) * 2).join(blocks)


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


def _grade_findings_sync(findings_text: str) -> dict[str, dict[str, Any]]:
    """Batch all 5 trap-detection questions into a single Decisions API call."""
    questions = {
        trap_name: {
            "type": "noul",
            "instructions": f"Does this text identify the following problem: {desc}?",
        }
        for trap_name, desc in TRAP_DESCRIPTIONS.items()
    }
    text = findings_text.strip() or "(no findings reported)"

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            resp = beta().decisions.create(
                model=MODEL_IDS["decisions"],
                input=[text_part(text)],
                questions=questions,
            )
            answers = getattr(resp, "answers", None)
            if answers is None:
                raise ValueError("Decisions API response missing 'answers'")

            grades: dict[str, dict[str, Any]] = {}
            for trap_name in TRAPS:
                ans = (
                    answers.get(trap_name)
                    if isinstance(answers, dict)
                    else getattr(answers, trap_name, None)
                )
                if ans is None:
                    raise ValueError(f"Decisions API response missing answer for {trap_name!r}")
                raw_noul = ans.get("noul") if isinstance(ans, dict) else getattr(ans, "noul", None)
                raw_conf = (
                    ans.get("confidence") if isinstance(ans, dict) else getattr(ans, "confidence", None)
                )
                prob = _coerce_probability(raw_noul)
                if prob is None:
                    raise ValueError(f"Non-numeric noul for {trap_name!r}: {raw_noul!r}")
                conf: float | None = None
                if isinstance(raw_conf, (int, float)) and not isinstance(raw_conf, bool):
                    conf = round(max(0.0, min(1.0, float(raw_conf))), 4)
                grades[trap_name] = {
                    "noul": round(prob, 4),
                    "confidence": conf,
                    "found": prob >= 0.5,
                }
            return grades
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))

    raise RuntimeError(
        f"Decisions grading failed after 3 attempts: {type(last_exc).__name__}: "
        f"{_sanitize_error(str(last_exc))}"
    )


def _baseline_generate_sync(desktop_bytes: bytes, mobile_bytes: bytes) -> str:
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            return generate_text(
                MODEL_IDS["quit_analyzer"],
                [
                    image_part(desktop_bytes, "image/png"),
                    image_part(mobile_bytes, "image/png"),
                    text_part(BASELINE_PROMPT),
                ],
                thinking="medium",
            )
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(
        f"Baseline generate_text failed after 3 attempts: {type(last_exc).__name__}: "
        f"{_sanitize_error(str(last_exc))}"
    )


async def _capture_baseline_screenshots(url: str, out_dir: Path) -> tuple[bytes, bytes]:
    out_dir.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            desktop_ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
            desktop_page = await desktop_ctx.new_page()
            await desktop_page.goto(url, wait_until="load", timeout=15000)
            await desktop_page.wait_for_timeout(300)
            desktop_bytes = await desktop_page.screenshot(type="png", full_page=True)
            await desktop_ctx.close()

            mobile_ctx = await browser.new_context(viewport={"width": 390, "height": 844})
            mobile_page = await mobile_ctx.new_page()
            await mobile_page.goto(url, wait_until="load", timeout=15000)
            await mobile_page.wait_for_timeout(300)
            mobile_bytes = await mobile_page.screenshot(type="png", full_page=True)
            await mobile_ctx.close()
        finally:
            await browser.close()

    (out_dir / "baseline_desktop.png").write_bytes(desktop_bytes)
    (out_dir / "baseline_mobile.png").write_bytes(mobile_bytes)
    return desktop_bytes, mobile_bytes


def _cache_path(page_id: str, trap: str, method: str) -> Path:
    return RESULTS_DIR / f"{page_id}__{trap}__{method}.json"


def _load_cache(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:  # noqa: BLE001
        return None


def _is_fully_graded(record: dict[str, Any] | None) -> bool:
    if not isinstance(record, dict):
        return False
    if record.get("status") != "ok":
        return False
    if not isinstance(record.get("findings_text"), str) or not record["findings_text"].strip():
        return False
    grades = record.get("grades")
    if not isinstance(grades, dict):
        return False
    for trap_name in TRAPS:
        entry = grades.get(trap_name)
        if not isinstance(entry, dict):
            return False
        if not isinstance(entry.get("noul"), (int, float)) or not isinstance(entry.get("found"), bool):
            return False
    return True


async def _run_panel_variant(
    page_id: str,
    trap: str,
    variant_index: Path,
    personas: list[dict[str, Any]],
    persona_meta: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    run_dir = RUNS_DIR / page_id / trap
    run_dir.mkdir(parents=True, exist_ok=True)
    out_dir = run_dir / "lab"
    ctx = RunContext(run_id=f"labeval_{page_id}_{trap}", run_dir=run_dir)

    t0 = time.monotonic()
    with _serve_directory(variant_index.parent) as url:
        persona_results = await lab.run_panel(ctx, _noop_emit, personas, url, out_dir)
    elapsed_s = round(time.monotonic() - t0, 2)

    compact_personas: list[dict[str, Any]] = []
    for res in persona_results:
        pid = str(res.get("persona_id") or "")
        meta = persona_meta.get(pid, {})
        compact_personas.append(
            {
                "persona_id": pid,
                "name": meta.get("name", pid),
                "device": meta.get("device", ""),
                "outcome": res.get("outcome", "quit"),
                "quit_reason": res.get("quit_reason"),
                "duration_s": res.get("duration_s"),
                "num_steps": len(res.get("actions") or []),
                "actions": [
                    {
                        "step": a.get("step"),
                        "action": a.get("action"),
                        "target": a.get("target"),
                        "thought": a.get("thought"),
                        "executed_ok": a.get("executed_ok"),
                        "error": a.get("error"),
                    }
                    for a in (res.get("actions") or [])
                ],
            }
        )

    findings_text = _format_panel_findings(persona_results, persona_meta)
    converted_count = sum(1 for p in compact_personas if p["outcome"] == "converted")

    return {
        "page": page_id,
        "trap": trap,
        "method": "panel",
        "status": "ungraded",
        "model": MODEL_IDS["persona_driver"],
        "grader_model": MODEL_IDS["decisions"],
        "elapsed_s": elapsed_s,
        "converted_count": converted_count,
        "persona_count": len(compact_personas),
        "personas": compact_personas,
        "findings_text": findings_text,
    }


async def _run_baseline_variant(
    page_id: str,
    trap: str,
    variant_index: Path,
) -> dict[str, Any]:
    run_dir = RUNS_DIR / page_id / trap
    t0 = time.monotonic()
    with _serve_directory(variant_index.parent) as url:
        desktop_bytes, mobile_bytes = await _capture_baseline_screenshots(url, run_dir)
    findings_text = await asyncio.to_thread(_baseline_generate_sync, desktop_bytes, mobile_bytes)
    elapsed_s = round(time.monotonic() - t0, 2)

    return {
        "page": page_id,
        "trap": trap,
        "method": "baseline",
        "status": "ungraded",
        "model": MODEL_IDS["quit_analyzer"],
        "grader_model": MODEL_IDS["decisions"],
        "elapsed_s": elapsed_s,
        "findings_text": findings_text,
    }


async def run_method(
    method: str,
    variants: list[tuple[str, str, Path]],
    concurrency: int,
    personas: list[dict[str, Any]],
    persona_meta: dict[str, dict[str, Any]],
) -> None:
    total = len(variants)
    sem = asyncio.Semaphore(max(1, concurrency))
    print_lock = asyncio.Lock()
    start = time.monotonic()

    completed = 0
    cached_count = 0
    new_ok = 0
    failed = 0

    async def _worker(page_id: str, trap: str, index_path: Path) -> None:
        nonlocal completed, cached_count, new_ok, failed
        cpath = _cache_path(page_id, trap, method)
        existing = _load_cache(cpath)

        if _is_fully_graded(existing):
            async with print_lock:
                completed += 1
                cached_count += 1
                print(
                    f"[{method}] {completed}/{total} {page_id}/{trap} (cached)",
                    flush=True,
                )
            return

        async with sem:
            try:
                if (
                    isinstance(existing, dict)
                    and isinstance(existing.get("findings_text"), str)
                    and existing["findings_text"].strip()
                ):
                    record = dict(existing)
                elif method == "panel":
                    record = await _run_panel_variant(
                        page_id, trap, index_path, personas, persona_meta
                    )
                    _atomic_write_json(cpath, record)
                elif method == "baseline":
                    record = await _run_baseline_variant(page_id, trap, index_path)
                    _atomic_write_json(cpath, record)
                else:
                    raise ValueError(f"Unsupported method: {method!r}")

                grades = await asyncio.to_thread(_grade_findings_sync, record["findings_text"])
                record["grades"] = grades
                record["status"] = "ok"
                _atomic_write_json(cpath, record)

                async with print_lock:
                    completed += 1
                    new_ok += 1
                    if trap == "clean":
                        fp_count = sum(1 for t in TRAPS if grades[t]["found"])
                        detail = f"clean_fp={fp_count}/5"
                    else:
                        g = grades[trap]
                        detail = f"target_found={g['found']} (noul={g['noul']:.2f})"
                    conv_part = ""
                    if method == "panel":
                        conv_part = f" conv={record.get('converted_count', 0)}/{record.get('persona_count', 3)}"
                    print(
                        f"[{method}] {completed}/{total} {page_id}/{trap}{conv_part} "
                        f"{detail} elapsed={time.monotonic() - start:.1f}s",
                        flush=True,
                    )
            except Exception as exc:  # noqa: BLE001
                async with print_lock:
                    completed += 1
                    failed += 1
                    print(
                        f"[{method}] ERROR {completed}/{total} {page_id}/{trap}: "
                        f"{type(exc).__name__}: {_sanitize_error(str(exc))} "
                        f"elapsed={time.monotonic() - start:.1f}s",
                        flush=True,
                    )

    await asyncio.gather(*[_worker(p, t, path) for p, t, path in variants])
    print(
        f"[{method}] DONE: total={total}, new={new_ok}, cached={cached_count}, "
        f"failed={failed}, elapsed={time.monotonic() - start:.1f}s",
        flush=True,
    )


# ---------- Aggregation & Reporting ----------

def _load_all_graded_results(
    selected_pages: list[str],
    selected_traps: list[str],
) -> dict[str, list[dict[str, Any]]]:
    by_method: dict[str, list[dict[str, Any]]] = {m: [] for m in METHODS}
    for method in METHODS:
        for page_id in selected_pages:
            for trap in selected_traps:
                rec = _load_cache(_cache_path(page_id, trap, method))
                if _is_fully_graded(rec):
                    assert rec is not None
                    by_method[method].append(rec)
    return by_method


def _rate(hits: int, total: int) -> float | None:
    if total <= 0:
        return None
    return round(hits / total, 4)


def _compute_method_summary(records: list[dict[str, Any]], method: str) -> dict[str, Any]:
    trap_records = [r for r in records if r["trap"] in TRAPS]
    clean_records = [r for r in records if r["trap"] == "clean"]

    overall_hits = sum(1 for r in trap_records if r["grades"][r["trap"]]["found"])
    overall_n = len(trap_records)

    per_trap: dict[str, dict[str, Any]] = {}
    for trap in TRAPS:
        subset = [r for r in trap_records if r["trap"] == trap]
        hits = sum(1 for r in subset if r["grades"][trap]["found"])
        mean_noul = (
            round(sum(float(r["grades"][trap]["noul"]) for r in subset) / len(subset), 4)
            if subset
            else None
        )
        per_trap[trap] = {
            "hits": hits,
            "n": len(subset),
            "recall": _rate(hits, len(subset)),
            "mean_noul": mean_noul,
        }

    fp_hits = sum(1 for r in clean_records for t in TRAPS if r["grades"][t]["found"])
    fp_checks = len(clean_records) * len(TRAPS)
    fp_by_trap = {
        t: {
            "hits": sum(1 for r in clean_records if r["grades"][t]["found"]),
            "n": len(clean_records),
        }
        for t in TRAPS
    }

    summary: dict[str, Any] = {
        "method": method,
        "n_trap_variants": overall_n,
        "n_clean_variants": len(clean_records),
        "recall_hits": overall_hits,
        "recall_overall": _rate(overall_hits, overall_n),
        "per_trap": per_trap,
        "fp_hits": fp_hits,
        "fp_checks": fp_checks,
        "fp_rate": _rate(fp_hits, fp_checks),
        "fp_by_trap": fp_by_trap,
    }

    if method == "panel":
        clean_conv = sum(int(r.get("converted_count", 0)) for r in clean_records)
        clean_sessions = sum(int(r.get("persona_count", 0)) for r in clean_records)
        trap_conv = sum(int(r.get("converted_count", 0)) for r in trap_records)
        trap_sessions = sum(int(r.get("persona_count", 0)) for r in trap_records)

        conv_by_trap: dict[str, dict[str, Any]] = {}
        for trap in TRAPS:
            subset = [r for r in trap_records if r["trap"] == trap]
            c = sum(int(r.get("converted_count", 0)) for r in subset)
            s = sum(int(r.get("persona_count", 0)) for r in subset)
            conv_by_trap[trap] = {
                "converted": c,
                "sessions": s,
                "rate": _rate(c, s),
            }

        summary["conversion"] = {
            "clean": {
                "converted": clean_conv,
                "sessions": clean_sessions,
                "rate": _rate(clean_conv, clean_sessions),
            },
            "trap_overall": {
                "converted": trap_conv,
                "sessions": trap_sessions,
                "rate": _rate(trap_conv, trap_sessions),
            },
            "by_trap": conv_by_trap,
        }

    return summary


def _extract_short_quote(record: dict[str, Any], max_chars: int = 220) -> str:
    trap = str(record["trap"])
    keywords = TRAP_KEYWORDS.get(trap, ())
    method = str(record["method"])

    candidates: list[str] = []
    if method == "panel":
        for p in record.get("personas") or []:
            if p.get("quit_reason"):
                candidates.append(str(p["quit_reason"]))
            for act in p.get("actions") or []:
                if act.get("thought"):
                    candidates.append(str(act["thought"]))
    else:
        raw_text = str(record.get("findings_text") or "")
        for line in raw_text.splitlines():
            cleaned = re.sub(r"^\s*[-*•\d.)]+\s*", "", line).strip()
            cleaned = cleaned.replace("**", "")
            if len(cleaned) >= 25:
                candidates.append(cleaned)

    best = ""
    best_score = -1
    for cand in candidates:
        flat = " ".join(cand.split())
        low = flat.lower()
        score = sum(2 for kw in keywords if kw in low)
        if score > best_score:
            best_score = score
            best = flat

    if not best:
        best = " ".join(str(record.get("findings_text") or "").split())

    if len(best) > max_chars:
        best = best[: max_chars - 1].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
    return best


def _select_examples(records: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    trap_records = [r for r in records if r["trap"] in TRAPS]
    found_records = sorted(
        [r for r in trap_records if r["grades"][r["trap"]]["found"]],
        key=lambda r: (-float(r["grades"][r["trap"]]["noul"]), r["trap"], r["page"]),
    )

    chosen: list[dict[str, Any]] = []
    seen_traps: set[str] = set()
    seen_keys: set[tuple[str, str]] = set()

    for r in found_records:
        if r["trap"] in seen_traps:
            continue
        chosen.append(r)
        seen_traps.add(r["trap"])
        seen_keys.add((r["page"], r["trap"]))
        if len(chosen) >= limit:
            break

    if len(chosen) < limit:
        for r in found_records + trap_records:
            key = (r["page"], r["trap"])
            if key in seen_keys:
                continue
            chosen.append(r)
            seen_keys.add(key)
            if len(chosen) >= limit:
                break

    return [
        {
            "page": r["page"],
            "trap": r["trap"],
            "found": bool(r["grades"][r["trap"]]["found"]),
            "noul": float(r["grades"][r["trap"]]["noul"]),
            "quote": _extract_short_quote(r),
        }
        for r in chosen
    ]


def _fmt_pct(rate: float | None, hits: int, total: int) -> str:
    if rate is None or total == 0:
        return "N/A"
    return f"{rate * 100:.1f}% ({hits}/{total})"


def _write_honest_reading(
    summaries: dict[str, dict[str, Any]],
) -> str:
    p = summaries.get("panel")
    b = summaries.get("baseline")

    if not p or not b or p["n_trap_variants"] == 0 or b["n_trap_variants"] == 0:
        return (
            "Evaluation results are incomplete because one or both methods have no graded trap variants yet. "
            "Run the full suite across all 5 pages and 6 variants to compare panel and baseline recall and false positives. "
            "With only 5 pages per trap, per-trap differences should be read as directional rather than statistically decisive."
        )

    p_rec = float(p["recall_overall"] or 0.0)
    b_rec = float(b["recall_overall"] or 0.0)
    delta_pp = (p_rec - b_rec) * 100.0

    # Identify traps with largest absolute gap between panel and baseline.
    panel_edges: list[str] = []
    baseline_edges: list[str] = []
    for trap in TRAPS:
        pr = p["per_trap"][trap]["recall"]
        br = b["per_trap"][trap]["recall"]
        if pr is None or br is None:
            continue
        if pr - br >= 0.19:
            panel_edges.append(f"`{trap}` ({pr * 100:.0f}% vs {br * 100:.0f}%)")
        elif br - pr >= 0.19:
            baseline_edges.append(f"`{trap}` ({br * 100:.0f}% vs {pr * 100:.0f}%)")

    if abs(delta_pp) < 0.05:
        s1_head = (
            f"Overall trap recall tied at **{p_rec * 100:.1f}%** "
            f"(panel {p['recall_hits']}/{p['n_trap_variants']} vs baseline {b['recall_hits']}/{b['n_trap_variants']})"
        )
    elif delta_pp > 0:
        s1_head = (
            f"The 3-persona browser **panel** outperformed the static-screenshot **baseline** on overall trap recall "
            f"at **{p_rec * 100:.1f}%** ({p['recall_hits']}/{p['n_trap_variants']}) vs **{b_rec * 100:.1f}%** "
            f"({b['recall_hits']}/{b['n_trap_variants']}), a {delta_pp:+.1f} percentage-point margin"
        )
    else:
        s1_head = (
            f"The static-screenshot **baseline** outperformed the 3-persona browser **panel** on overall trap recall "
            f"at **{b_rec * 100:.1f}%** ({b['recall_hits']}/{b['n_trap_variants']}) vs **{p_rec * 100:.1f}%** "
            f"({p['recall_hits']}/{p['n_trap_variants']}), a {-delta_pp:+.1f} percentage-point lead for the baseline"
        )

    edge_bits: list[str] = []
    if panel_edges:
        edge_bits.append("panel led on " + ", ".join(panel_edges))
    if baseline_edges:
        edge_bits.append("baseline led on " + ", ".join(baseline_edges))
    s1 = f"{s1_head}, where {'; '.join(edge_bits)}." if edge_bits else f"{s1_head}."

    p_fp = float(p["fp_rate"] or 0.0)
    b_fp = float(b["fp_rate"] or 0.0)
    s2 = (
        f"On the clean control pages, false-positive rates were **{p_fp * 100:.1f}%** "
        f"({p['fp_hits']}/{p['fp_checks']} checks) for the panel vs **{b_fp * 100:.1f}%** "
        f"({b['fp_hits']}/{b['fp_checks']} checks) for the baseline, showing "
        + (
            "both methods kept hallucinated trap flags low."
            if max(p_fp, b_fp) <= 0.12
            else (
                "the baseline flagged more non-existent traps on clean pages."
                if b_fp > p_fp + 0.04
                else (
                    "the panel flagged more non-existent traps on clean pages."
                    if p_fp > b_fp + 0.04
                    else "both methods produced non-trivial false positives on clean pages."
                )
            )
        )
    )

    conv = p.get("conversion") or {}
    c_clean = conv.get("clean") or {}
    c_trap = conv.get("trap_overall") or {}
    clean_rate = c_clean.get("rate")
    trap_rate = c_trap.get("rate")
    if clean_rate is not None and trap_rate is not None:
        conv_delta = (trap_rate - clean_rate) * 100.0
        effect = (
            "confirming that injected traps measurably drove shoppers to quit"
            if trap_rate < clean_rate - 0.05
            else "indicating injected traps did not strongly reduce overall panel conversion on this small 5-page set"
        )
        s3 = (
            f"In the browser panel, shopper conversion moved from **{clean_rate * 100:.1f}%** "
            f"({c_clean['converted']}/{c_clean['sessions']}) on clean pages to **{trap_rate * 100:.1f}%** "
            f"({c_trap['converted']}/{c_trap['sessions']}, {conv_delta:+.1f}pp) on trapped pages, {effect}."
        )
    else:
        s3 = "Panel conversion could not be compared across clean and trapped pages due to missing runs."

    return f"{s1} {s2} {s3}"


def _render_markdown(
    summaries: dict[str, dict[str, Any]],
    examples: dict[str, list[dict[str, Any]]],
    honest_reading: str,
) -> str:
    lines: list[str] = [
        "# Browser-Lab UX-Trap Evaluation",
        "",
        "Comparing our 3-persona Chromium browser panel (`persona_01` desktop, `persona_02` mobile, `persona_03` tablet; "
        f"`{MODEL_IDS['persona_driver']}`) against a single static-screenshot Gemini critique "
        f"(1440×900 + 390×844 full-page screenshots; `{MODEL_IDS['quit_analyzer']}`).",
        "",
        "| Method | Recall (Overall) | hidden_fee | dead_cta | tiny_targets | price_hidden | forced_signup | FP Rate (Clean) | N (Trap / Clean) |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for method in METHODS:
        s = summaries[method]
        cells = [
            method,
            _fmt_pct(s["recall_overall"], s["recall_hits"], s["n_trap_variants"]),
        ]
        for trap in TRAPS:
            pt = s["per_trap"][trap]
            cells.append(_fmt_pct(pt["recall"], pt["hits"], pt["n"]))
        cells.append(_fmt_pct(s["fp_rate"], s["fp_hits"], s["fp_checks"]))
        cells.append(f"{s['n_trap_variants']} / {s['n_clean_variants']}")
        lines.append("| " + " | ".join(cells) + " |")

    conv = summaries.get("panel", {}).get("conversion")
    if conv:
        c_clean = conv["clean"]
        c_trap = conv["trap_overall"]
        per_trap_conv = ", ".join(
            f"`{t}` {_fmt_pct(conv['by_trap'][t]['rate'], conv['by_trap'][t]['converted'], conv['by_trap'][t]['sessions'])}"
            for t in TRAPS
        )
        lines.extend(
            [
                "",
                f"**Panel conversion rate:** clean pages {_fmt_pct(c_clean['rate'], c_clean['converted'], c_clean['sessions'])} "
                f"vs trap pages {_fmt_pct(c_trap['rate'], c_trap['converted'], c_trap['sessions'])} "
                f"({per_trap_conv}).",
            ]
        )

    lines.extend(
        [
            "",
            "## Honest Reading",
            "",
            honest_reading,
            "",
            "> **Note:** traps were injected by the team into model-generated pages; grading is automatic (Decisions API, threshold 0.5).",
            "",
            "## Example Findings",
            "",
        ]
    )

    for method in METHODS:
        title = "Browser Panel (`panel`)" if method == "panel" else "Static-Screenshot Baseline (`baseline`)"
        lines.append(f"### {title}")
        lines.append("")
        items = examples.get(method) or []
        if not items:
            lines.append("- No graded trap findings available.")
        else:
            for ex in items:
                status = "found" if ex["found"] else "missed"
                quote = " ".join(ex["quote"].split())
                page_label = ex["page"]
                trap_label = ex["trap"]
                noul_val = ex["noul"]
                lines.append(
                    f'- **`{page_label}` / `{trap_label}`** ({status}, noul={noul_val:.2f}): "{quote}"'
                )
        lines.append("")

    return chr(10).join(lines) + chr(10)


def write_reports(selected_pages: list[str], selected_traps: list[str]) -> dict[str, Any]:
    by_method = _load_all_graded_results(selected_pages, selected_traps)
    summaries = {m: _compute_method_summary(by_method[m], m) for m in METHODS}
    examples = {m: _select_examples(by_method[m], limit=3) for m in METHODS}
    honest_reading = _write_honest_reading(summaries)

    payload: dict[str, Any] = {
        "config": {
            "pages": selected_pages,
            "variants": selected_traps,
            "traps": list(TRAPS),
            "panel_personas": list(PANEL_PERSONA_IDS),
            "models": {
                "panel": MODEL_IDS["persona_driver"],
                "baseline": MODEL_IDS["quit_analyzer"],
                "grader": MODEL_IDS["decisions"],
            },
            "grading_threshold": 0.5,
            "note": "traps were injected by the team into model-generated pages; grading is automatic (Decisions API, threshold 0.5)",
        },
        "methods": summaries,
        "examples": examples,
        "reading": honest_reading,
        "per_variant": {
            m: [
                {
                    "page": r["page"],
                    "trap": r["trap"],
                    "elapsed_s": r.get("elapsed_s"),
                    "converted_count": r.get("converted_count"),
                    "persona_count": r.get("persona_count"),
                    "grades": r["grades"],
                }
                for r in by_method[m]
            ]
            for m in METHODS
        },
    }

    _atomic_write_json(LAB_RESULTS_JSON_PATH, payload)
    md = _render_markdown(summaries, examples, honest_reading)
    LAB_RESULTS_MD_PATH.write_text(md, encoding="utf-8")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate 3-persona browser lab panel vs static-screenshot baseline on injected UX traps."
    )
    parser.add_argument(
        "--methods",
        type=str,
        default=",".join(METHODS),
        help="Comma-separated methods to run (panel,baseline).",
    )
    parser.add_argument(
        "--pages",
        type=str,
        default=",".join(p for p, _ in PAGE_SOURCES),
        help="Comma-separated page IDs to include.",
    )
    parser.add_argument(
        "--traps",
        type=str,
        default=",".join(VARIANTS),
        help="Comma-separated variants to include (clean plus trap names).",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=3,
        help="Number of variants to run concurrently per method (default: 3).",
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Skip running evals and only regenerate lab_results.json and LAB_RESULTS.md from cache.",
    )
    return parser.parse_args()


async def main_async() -> int:
    args = parse_args()
    selected_methods = [m.strip().lower() for m in args.methods.split(",") if m.strip()]
    selected_pages = [p.strip() for p in args.pages.split(",") if p.strip()]
    selected_traps = [t.strip() for t in args.traps.split(",") if t.strip()]

    for m in selected_methods:
        if m not in METHODS:
            raise ValueError(f"Unknown method {m!r}; expected subset of {METHODS}")
    valid_pages = {p for p, _ in PAGE_SOURCES}
    for p in selected_pages:
        if p not in valid_pages:
            raise ValueError(f"Unknown page {p!r}; expected subset of {sorted(valid_pages)}")
    for t in selected_traps:
        if t not in VARIANTS:
            raise ValueError(f"Unknown variant {t!r}; expected subset of {VARIANTS}")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    if not args.report_only:
        variant_paths = prepare_pages(selected_pages, selected_traps)
        variants = [
            (page_id, trap, variant_paths[(page_id, trap)])
            for page_id in selected_pages
            for trap in selected_traps
        ]
        print(
            f"[setup] Prepared {len(variants)} variants ({len(selected_pages)} pages x "
            f"{len(selected_traps)} variants) under {PAGES_DIR}",
            flush=True,
        )

        personas = load_panel_personas()
        persona_meta = {str(p["id"]): p for p in personas}

        # Warm up cached Gemini clients on main thread before spawning worker threads.
        client()
        beta()

        for method in selected_methods:
            print(
                f"[{method}] Starting {len(variants)} variants with concurrency={args.concurrency}...",
                flush=True,
            )
            await run_method(method, variants, args.concurrency, personas, persona_meta)

    payload = write_reports(selected_pages, selected_traps)
    print(f"[report] Wrote {LAB_RESULTS_JSON_PATH}", flush=True)
    print(f"[report] Wrote {LAB_RESULTS_MD_PATH}", flush=True)
    print(chr(10) + payload["reading"], flush=True)
    return 0


def main() -> int:
    return asyncio.run(main_async())


if __name__ == "__main__":
    raise SystemExit(main())
