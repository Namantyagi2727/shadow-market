"""Run the 3-arm Kickstarter 2026 backtest (base, single, swarm) with per-arm resume caching.

Run from repo root:
    uv run --project backend python eval/run_eval.py --arms base,single,swarm --concurrency 8
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import mimetypes
import os
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from pipeline.competitors import (  # noqa: E402
    MCP_HEADERS,
    MCP_PROTOCOL_VERSION,
    SHOPIFY_MCP_URL,
    _extract_products,
    _map_product,
    _parse_mcp_response,
)
from pipeline.llm import MODEL_IDS, beta, client, generate_json, image_part, text_part  # noqa: E402
from pipeline.swarm import (  # noqa: E402
    CHUNK_SIZE_QUESTIONS,
    PERSONA_LIST_SCHEMA,
    RUBRICS,
    _call_decisions_sync,
    _extract_persona_items,
)

EVAL_DIR = REPO_ROOT / "eval"
DATA_DIR = EVAL_DIR / "data"
RESULTS_DIR = EVAL_DIR / "results"
# Campaign photos leak the outcome: successful creators add "FUNDED IN 14 HOURS!" banners after the
# fact (found in run 1: single-Neon AUC 0.96 came from reading those banners). Text only by default.
USE_IMAGES = os.environ.get("EVAL_USE_IMAGES", "0") == "1"
IMAGES_DIR = DATA_DIR / "images"
SAMPLE_JSONL_PATH = DATA_DIR / "sample.jsonl"
PANEL_PATH = DATA_DIR / "panel.json"

VALID_ARMS = ("base", "single", "swarm")
PANEL_SIZE = 200
MIN_PANEL_SIZE = 50

SINGLE_PROMPT_INSTRUCTION = (
    "You are an expert venture analyst. Estimate the calibrated probability (0 to 1) "
    "that this crowdfunding campaign reaches 100% of its funding goal."
)

SINGLE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "probability": {"type": "number"},
        "reason": {"type": "string"},
    },
    "required": ["probability", "reason"],
    "additionalProperties": False,
}


def _sanitize_error(text: str) -> str:
    for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "API_KEY"):
        secret = os.environ.get(env_name)
        if secret and len(secret) >= 8:
            text = text.replace(secret, "[REDACTED]")
    return text


def _load_sample(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Run `uv run --project backend python eval/sample_dataset.py` first."
        )
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rows.append(json.loads(line))
    return rows


def _load_done_results(path: Path) -> dict[str, dict[str, Any]]:
    done: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return done
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and "id" in obj and "p" in obj:
            done[str(obj["id"])] = obj
    return done


def _sniff_image_mime(data: bytes, url: str, content_type: str | None) -> str:
    if content_type:
        ct = content_type.split(";", 1)[0].strip().lower()
        if ct.startswith("image/"):
            return ct
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF8"):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    guessed = mimetypes.guess_type(url)[0]
    if guessed and guessed.startswith("image/"):
        return guessed
    return "image/jpeg"


async def _fetch_campaign_image(
    http: httpx.AsyncClient,
    campaign: dict[str, Any],
) -> tuple[bytes, str]:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    cid = str(campaign["id"])
    meta_path = IMAGES_DIR / f"{cid}.mime"
    bin_path = IMAGES_DIR / f"{cid}.img"

    if bin_path.exists() and bin_path.stat().st_size > 0 and meta_path.exists():
        data = bin_path.read_bytes()
        mime = meta_path.read_text(encoding="utf-8").strip() or "image/jpeg"
        return data, mime

    url = str(campaign["photo_url"])
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            resp = await http.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; ShadowMarketEval/1.0)"},
            )
            resp.raise_for_status()
            data = resp.content
            if not data:
                raise ValueError("Empty image response")
            mime = _sniff_image_mime(data, url, resp.headers.get("content-type"))
            bin_path.write_bytes(data)
            meta_path.write_text(mime, encoding="utf-8")
            return data, mime
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < 2:
                await asyncio.sleep(1.0 * (attempt + 1))

    raise RuntimeError(f"Failed to download image for id={cid}: {last_exc}")


# ---------- Arm 1: base ----------

def _fit_base_priors(all_campaigns: list[dict[str, Any]]) -> tuple[float, dict[str, tuple[int, int]]]:
    calib = [c for c in all_campaigns if c.get("split") == "calib"]
    if not calib:
        raise RuntimeError("No calib rows found in sample.jsonl")

    overall_pos = sum(int(c["label"]) for c in calib)
    overall_n = len(calib)
    overall_rate = (overall_pos + 1.0) / (overall_n + 2.0)

    by_cat: dict[str, list[int]] = defaultdict(list)
    for c in calib:
        by_cat[str(c["category"])].append(int(c["label"]))

    cat_stats = {cat: (sum(labels), len(labels)) for cat, labels in by_cat.items()}
    return overall_rate, cat_stats


async def run_base_arm(
    all_campaigns: list[dict[str, Any]],
    targets: list[dict[str, Any]],
) -> None:
    start = time.monotonic()
    out_path = RESULTS_DIR / "base.jsonl"
    done = _load_done_results(out_path)
    overall_rate, cat_stats = _fit_base_priors(all_campaigns)

    new_count = 0
    total = len(targets)
    with out_path.open("a", encoding="utf-8") as fh:
        for idx, c in enumerate(targets, start=1):
            cid = str(c["id"])
            if cid in done:
                continue
            cat = str(c["category"])
            if cat in cat_stats:
                pos, n = cat_stats[cat]
                p = (pos + 1.0) / (n + 2.0)
                fallback = False
            else:
                pos, n = 0, 0
                p = overall_rate
                fallback = True

            record = {
                "id": c["id"],
                "p": round(p, 6),
                "meta": {
                    "category": cat,
                    "calib_cat_pos": pos,
                    "calib_cat_n": n,
                    "fallback": fallback,
                    "overall_calib_rate": round(overall_rate, 6),
                },
            }
            fh.write(json.dumps(record) + "\n")
            fh.flush()
            done[cid] = record
            new_count += 1
            if idx % 50 == 0 or idx == total:
                print(
                    f"[base] {idx}/{total} elapsed={time.monotonic() - start:.2f}s",
                    flush=True,
                )

    all_ps = [float(done[str(c["id"])]["p"]) for c in targets if str(c["id"]) in done]
    mean_p = sum(all_ps) / len(all_ps) if all_ps else float("nan")
    print(
        f"[base] SUMMARY: done={len(all_ps)}/{total} "
        f"(new={new_count}, cached={len(all_ps) - new_count}, failed=0), "
        f"mean_p={mean_p:.4f}, elapsed={time.monotonic() - start:.2f}s",
        flush=True,
    )


# ---------- Arm 2: single ----------

def _format_campaign_text(campaign: dict[str, Any]) -> str:
    goal_usd = float(campaign["goal"])
    category_slug = campaign.get("category_slug") or campaign.get("category") or "unknown"
    return (
        f"Campaign Name: {campaign['name']}\n"
        f"Blurb: {campaign['blurb']}\n"
        f"Category: {category_slug} (top-level: {campaign['category']})\n"
        f"Funding Goal: ${goal_usd:,.0f} USD"
    )


def _eval_single_sync(
    campaign: dict[str, Any],
    img_bytes: bytes,
    img_mime: str,
) -> dict[str, Any]:
    prompt = f"{SINGLE_PROMPT_INSTRUCTION}\n\n{_format_campaign_text(campaign)}"
    parsed = generate_json(
        model=MODEL_IDS["strategist"],
        parts=([image_part(img_bytes, img_mime)] if USE_IMAGES else []) + [text_part(prompt)],
        schema=SINGLE_SCHEMA,
        thinking="medium",
    )
    if not isinstance(parsed, dict) or "probability" not in parsed:
        raise ValueError(f"Unexpected JSON response: {parsed!r}")

    prob = float(parsed["probability"])
    if not math.isfinite(prob):
        raise ValueError(f"Non-finite probability: {prob!r}")
    prob = max(0.0, min(1.0, prob))
    reason = " ".join(str(parsed.get("reason") or "").split())

    return {
        "id": campaign["id"],
        "p": round(prob, 6),
        "meta": {
            "reason": reason,
            "model": MODEL_IDS["strategist"],
        },
    }


# ---------- Arm 3: swarm ----------

def _generate_general_panel_batch_sync(count: int, existing_count: int) -> list[dict[str, str]]:
    prompt = f"""Generate {count} compact, realistic, diverse general-population US online shoppers to evaluate crowdfunding campaigns across all consumer categories.

Diversity requirements:
- Representative spread across ages (18 to 75), household incomes ($25k to $250k+), US regions, occupations, and online shopping habits.
- Varied attitudes toward crowdfunding and new products: skeptical pragmatists, deal hunters, niche hobbyists, cautious mainstream buyers, early adopters, and budget-constrained shoppers.
- Do not repeat archetypes already generated (this is batch starting at index {existing_count + 1}).

Format rules:
- Return JSON object {{"personas": [{{"id": "p001", "summary": "..."}}]}} with exactly {count} entries.
- Each summary MUST be <= 25 words: include age, income/budget level, shopping attitude, and skepticism level.
- Be concrete and realistic, not sycophantic."""

    raw = generate_json(
        model=MODEL_IDS["strategist"],
        parts=[text_part(prompt)],
        schema=PERSONA_LIST_SCHEMA,
        thinking="low",
    )
    return _extract_persona_items(raw)


def _load_or_create_panel_sync() -> list[dict[str, str]]:
    if PANEL_PATH.exists():
        try:
            loaded = json.loads(PANEL_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, list) and len(loaded) >= MIN_PANEL_SIZE:
                valid = [
                    {"id": f"p{i + 1:03d}", "summary": str(item["summary"]).strip()}
                    for i, item in enumerate(loaded)
                    if isinstance(item, dict) and str(item.get("summary") or "").strip()
                ]
                if len(valid) >= MIN_PANEL_SIZE:
                    print(f"[swarm] Loaded cached panel of {len(valid)} personas from {PANEL_PATH}", flush=True)
                    return valid[:PANEL_SIZE]
        except Exception:  # noqa: BLE001
            pass

    print(f"[swarm] Generating fixed panel of {PANEL_SIZE} US online shoppers...", flush=True)
    panel: list[dict[str, str]] = []
    seen_summaries: set[str] = set()

    for attempt in range(4):
        remaining = PANEL_SIZE - len(panel)
        if remaining <= 0:
            break
        batch_size = min(remaining, 100) if attempt > 0 else PANEL_SIZE
        batch = _generate_general_panel_batch_sync(batch_size, len(panel))
        for item in batch:
            summary = item["summary"]
            key = summary.lower()
            if key in seen_summaries:
                continue
            seen_summaries.add(key)
            panel.append({"id": f"p{len(panel) + 1:03d}", "summary": summary})
            if len(panel) >= PANEL_SIZE:
                break
        print(f"[swarm] Panel generation progress: {len(panel)}/{PANEL_SIZE}", flush=True)

    if len(panel) < MIN_PANEL_SIZE:
        raise RuntimeError(f"Only generated {len(panel)} personas (need at least {MIN_PANEL_SIZE})")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = PANEL_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(panel, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp_path.replace(PANEL_PATH)
    print(f"[swarm] Cached {len(panel)} personas to {PANEL_PATH}", flush=True)
    return panel


async def _search_shopify_competitors(
    http: httpx.AsyncClient,
    campaign: dict[str, Any],
) -> list[dict[str, Any]]:
    name = str(campaign.get("name") or "").strip()
    blurb = str(campaign.get("blurb") or "").strip()
    queries = [" ".join(f"{name} {blurb}".split())[:140].strip()]
    if name and name != queries[0]:
        queries.append(name[:100])

    for query in queries:
        if not query:
            continue
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
                "name": "search_catalog",
                "arguments": {
                    "catalog": {
                        "query": query,
                        "pagination": {"limit": 5},
                    }
                },
            },
        }
        try:
            resp = await http.post(SHOPIFY_MCP_URL, headers=MCP_HEADERS, json=payload)
            resp.raise_for_status()
            rpc = _parse_mcp_response(resp.text)
            products = _extract_products(rpc)
            items: list[dict[str, Any]] = []
            for prod in products:
                mapped = _map_product(prod)
                if mapped is not None:
                    items.append(mapped)
                    if len(items) >= 3:
                        break
            if items:
                return items
        except Exception as exc:  # noqa: BLE001
            print(
                f"[swarm] Shopify lookup warning id={campaign['id']}: "
                f"{type(exc).__name__}: {_sanitize_error(str(exc))}",
                flush=True,
            )
            return []

    return []


def _build_swarm_eval_text(
    campaign: dict[str, Any],
    competitors: list[dict[str, Any]],
) -> str:
    comp_lines: list[str] = []
    for item in competitors:
        title = item.get("title") or "Competitor"
        price = item.get("price_usd")
        price_str = f"${price:.2f}" if isinstance(price, (int, float)) else "price unknown"
        comp_lines.append(f"- {title} ({price_str})")
    comp_block = "\n".join(comp_lines) if comp_lines else "- None found"

    return (
        "CROWDFUNDING CAMPAIGN\n"
        f"{_format_campaign_text(campaign)}\n\n"
        "COMPETING PRODUCTS ON SHOPIFY\n"
        f"{comp_block}"
    )


async def _eval_swarm_async(
    campaign: dict[str, Any],
    panel: list[dict[str, str]],
    img_bytes: bytes,
    img_mime: str,
    http: httpx.AsyncClient,
) -> dict[str, Any]:
    competitors = await _search_shopify_competitors(http, campaign)
    eval_text = _build_swarm_eval_text(campaign, competitors)
    input_parts = ([image_part(img_bytes, img_mime)] if USE_IMAGES else []) + [text_part(eval_text)]

    questions: dict[str, dict[str, Any]] = {}
    for persona in panel:
        pid = persona["id"]
        summary = persona["summary"]
        for rubric_id, rubric_q, _ in RUBRICS:
            questions[f"{pid}_{rubric_id}"] = {
                "type": "noul",
                "instructions": f"You are this buyer: {summary}. {rubric_q}",
            }

    used_chunking = False
    all_answers: dict[str, tuple[float, float | None]] = {}
    try:
        all_answers = await asyncio.to_thread(_call_decisions_sync, input_parts, questions)
        if not all_answers:
            raise ValueError("Decisions API returned no parseable answers")
    except Exception:  # noqa: BLE001
        used_chunking = True
        items = list(questions.items())
        chunks = [
            dict(items[i : i + CHUNK_SIZE_QUESTIONS])
            for i in range(0, len(items), CHUNK_SIZE_QUESTIONS)
        ]

        async def _run_chunk(chunk: dict[str, dict[str, Any]]) -> dict[str, tuple[float, float | None]]:
            return await asyncio.to_thread(_call_decisions_sync, input_parts, chunk)

        chunk_results = await asyncio.gather(*[_run_chunk(chunk) for chunk in chunks], return_exceptions=True)
        for res in chunk_results:
            if isinstance(res, dict):
                all_answers.update(res)

    rubric_totals: dict[str, list[float]] = {rid: [] for rid, _, _ in RUBRICS}
    confidences: list[float] = []
    persona_intents: list[float] = []

    for persona in panel:
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

        intent = math.prod(scores.get(rid, 0.5) ** weight for rid, _, weight in RUBRICS)
        persona_intents.append(intent)

    if len(persona_intents) < max(1, len(panel) // 2):
        raise RuntimeError(
            f"Too few personas answered ({len(persona_intents)}/{len(panel)}) for id={campaign['id']}"
        )

    rubrics_mean = {
        rid: round(sum(vals) / len(vals), 4) if vals else 0.5
        for rid, vals in rubric_totals.items()
    }
    intent_mean = sum(persona_intents) / len(persona_intents)
    mean_confidence = sum(confidences) / len(confidences) if confidences else 0.5

    return {
        "id": campaign["id"],
        "p": round(intent_mean, 6),
        "meta": {
            "personas": len(persona_intents),
            "rubrics": rubrics_mean,
            "mean_confidence": round(mean_confidence, 4),
            "chunked": used_chunking,
            "competitors": [
                {"title": c.get("title"), "price_usd": c.get("price_usd")}
                for c in competitors
            ],
        },
    }


async def run_async_arm(
    arm: str,
    targets: list[dict[str, Any]],
    concurrency: int,
    panel: list[dict[str, str]] | None = None,
) -> None:
    start = time.monotonic()
    out_path = RESULTS_DIR / f"{arm}.jsonl"
    done = _load_done_results(out_path)
    total = len(targets)

    pending = [c for c in targets if str(c["id"]) not in done]
    cached_count = total - len(pending)
    if cached_count:
        print(f"[{arm}] Resuming: {cached_count}/{total} already cached, {len(pending)} remaining", flush=True)

    sem = asyncio.Semaphore(max(1, concurrency))
    write_lock = asyncio.Lock()
    new_ok = 0
    failed = 0
    completed = cached_count

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(20.0, read=30.0),
    ) as http:
        async def _process_one(campaign: dict[str, Any]) -> None:
            nonlocal new_ok, failed, completed
            cid = str(campaign["id"])
            async with sem:
                try:
                    img_bytes, img_mime = await _fetch_campaign_image(http, campaign)
                    if arm == "single":
                        record = await asyncio.to_thread(_eval_single_sync, campaign, img_bytes, img_mime)
                    elif arm == "swarm":
                        assert panel is not None
                        record = await _eval_swarm_async(campaign, panel, img_bytes, img_mime, http)
                    else:
                        raise ValueError(f"Unsupported async arm: {arm}")
                except Exception as exc:  # noqa: BLE001
                    async with write_lock:
                        failed += 1
                        completed += 1
                        print(
                            f"[{arm}] ERROR id={cid}: {type(exc).__name__}: {_sanitize_error(str(exc))} "
                            f"({completed}/{total}, elapsed={time.monotonic() - start:.1f}s)",
                            flush=True,
                        )
                    return

                async with write_lock:
                    with out_path.open("a", encoding="utf-8") as fh:
                        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
                        fh.flush()
                    done[cid] = record
                    new_ok += 1
                    completed += 1
                    print(
                        f"[{arm}] {completed}/{total} id={cid} p={record['p']:.4f} "
                        f"elapsed={time.monotonic() - start:.1f}s",
                        flush=True,
                    )

        await asyncio.gather(*[_process_one(c) for c in pending])

    all_ps = [float(done[str(c["id"])]["p"]) for c in targets if str(c["id"]) in done]
    mean_p = sum(all_ps) / len(all_ps) if all_ps else float("nan")
    print(
        f"[{arm}] SUMMARY: done={len(all_ps)}/{total} "
        f"(new={new_ok}, cached={cached_count}, failed={failed}), "
        f"mean_p={mean_p:.4f}, elapsed={time.monotonic() - start:.1f}s",
        flush=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run 5-Sigma Kickstarter backtest arms.")
    parser.add_argument(
        "--arms",
        type=str,
        default="base,single,swarm",
        help="Comma-separated arms to run (base,single,swarm).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of campaigns to evaluate.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=8,
        help="Maximum concurrent campaigns for LLM/Decisions arms (default: 8).",
    )
    return parser.parse_args()


async def main_async() -> int:
    args = parse_args()
    arms = [a.strip().lower() for a in args.arms.split(",") if a.strip()]
    invalid = [a for a in arms if a not in VALID_ARMS]
    if invalid:
        raise ValueError(f"Unknown arms: {invalid}. Valid arms: {VALID_ARMS}")
    if not arms:
        raise ValueError("No arms specified.")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    all_campaigns = _load_sample(SAMPLE_JSONL_PATH)
    targets = all_campaigns[: args.limit] if args.limit is not None else all_campaigns

    # Warm up cached genai clients on the main thread before spawning worker threads.
    if any(a in ("single", "swarm") for a in arms):
        client()
    if "swarm" in arms:
        beta()

    for arm in arms:
        if arm == "base":
            await run_base_arm(all_campaigns, targets)
        elif arm == "single":
            await run_async_arm("single", targets, args.concurrency)
        elif arm == "swarm":
            panel = await asyncio.to_thread(_load_or_create_panel_sync)
            await run_async_arm("swarm", targets, args.concurrency, panel=panel)

    return 0


def main() -> int:
    return asyncio.run(main_async())


if __name__ == "__main__":
    raise SystemExit(main())
