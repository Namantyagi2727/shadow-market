"""Live pitch session backend: founder transcript debouncing, parallel research, judge questions, and founder prep."""

from __future__ import annotations

import asyncio
import difflib
import json
import math
import os
import re
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import httpx

from pipeline import analyst
from pipeline.competitors import (
    MCP_HEADERS,
    MCP_PROTOCOL_VERSION,
    SHOPIFY_MCP_URL,
    _extract_products,
    _map_product,
    _parse_mcp_response,
)
from pipeline.context import BACKEND_DIR, EventLog
from pipeline.llm import MODEL_IDS, client, generate_json, output_text, text_part
from pipeline.swarm import CHUNK_SIZE_QUESTIONS, RUBRICS, _call_decisions_sync

DEBOUNCE_DELAY_S = 6.0
MIN_TRANSCRIPT_WORDS = 12
MAX_RESEARCH_RUNS = 3

PITCH_TIMEOUT_S = 20.0
COMPETITORS_TIMEOUT_S = 15.0
COMPETITORS_WAIT_FOR_BUYERS_S = 4.0
WEB_TIMEOUT_S = 30.0
ANALYST_TIMEOUT_S = 30.0
BUYERS_TIMEOUT_S = 25.0
QUESTIONS_TIMEOUT_S = 25.0
PREP_TIMEOUT_S = 20.0

MATCH_QUESTION_THRESHOLD = 0.45
VALID_QUESTION_SOURCES: set[str] = {"competitors", "web", "buyers", "analyst", "pitch"}

PANEL_200_PATH = BACKEND_DIR / "panel_200.json"

_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()

SESSION_PITCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "one_liner": {"type": "string"},
        "target_user": {"type": "string"},
        "price_usd": {"type": ["number", "null"]},
        "location": {"type": ["string", "null"]},
        "claims": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 5,
        },
    },
    "required": ["title", "one_liner", "target_user", "price_usd", "location", "claims"],
    "additionalProperties": False,
}

WEB_FACTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "facts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "fact": {"type": "string"},
                    "url": {"type": ["string", "null"]},
                },
                "required": ["fact", "url"],
                "additionalProperties": False,
            },
            "maxItems": 3,
        }
    },
    "required": ["facts"],
    "additionalProperties": False,
}

JUDGE_QUESTIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "question": {"type": "string"},
                    "why": {"type": "string"},
                    "evidence": {"type": "string"},
                    "source": {
                        "type": "string",
                        "enum": ["competitors", "web", "buyers", "analyst", "pitch"],
                    },
                },
                "required": ["id", "question", "why", "evidence", "source"],
                "additionalProperties": False,
            },
            "minItems": 3,
            "maxItems": 3,
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}

FOUNDER_PREP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question_id": {"type": "string"},
                    "question": {"type": "string"},
                    "line": {"type": "string"},
                    "points": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 2,
                        "maxItems": 2,
                    },
                    "evidence": {"type": "string"},
                },
                "required": ["question_id", "question", "line", "points", "evidence"],
                "additionalProperties": False,
            },
            "minItems": 3,
            "maxItems": 3,
        }
    },
    "required": ["answers"],
    "additionalProperties": False,
}


@dataclass
class SessionState:
    run_id: str
    transcript: str = ""
    last_researched_words: int = 0
    research_runs: int = 0
    debounce_task: asyncio.Task[None] | None = None
    research_task: asyncio.Task[None] | None = None
    research_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    latest_research: dict[str, Any] | None = None
    latest_questions: list[dict[str, Any]] = field(default_factory=list)
    latest_prep: list[dict[str, Any]] = field(default_factory=list)


SESSIONS: dict[str, SessionState] = {}


def ensure_session(run_id: str) -> SessionState:
    state = SESSIONS.get(run_id)
    if state is None:
        state = SessionState(run_id=run_id)
        SESSIONS[run_id] = state
    return state


def get_session(run_id: str) -> SessionState | None:
    return SESSIONS.get(run_id)


def _sanitize_error(text: str) -> str:
    for env_name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "API_KEY"):
        secret = os.environ.get(env_name)
        if secret and len(secret) >= 8:
            text = text.replace(secret, "[REDACTED]")
    return text


def _track_task(task: asyncio.Task[Any], label: str) -> None:
    _BACKGROUND_TASKS.add(task)

    def _done(t: asyncio.Task[Any]) -> None:
        _BACKGROUND_TASKS.discard(t)
        if not t.cancelled():
            exc = t.exception()
            if exc is not None:
                print(f"[session] {label} failed: {type(exc).__name__}", flush=True)

    task.add_done_callback(_done)


@lru_cache(maxsize=1)
def _load_panel() -> list[dict[str, str]]:
    raw = json.loads(PANEL_200_PATH.read_text(encoding="utf-8"))
    panel: list[dict[str, str]] = []
    if isinstance(raw, list):
        for idx, item in enumerate(raw, start=1):
            if not isinstance(item, dict):
                continue
            summary = " ".join(str(item.get("summary") or "").split()).strip()
            if not summary:
                continue
            pid = str(item.get("id") or f"p{idx:03d}").strip()
            panel.append({"id": pid, "summary": summary})
    return panel[:200]


def _normalize_match_text(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return " ".join(cleaned.split())


def match_prepared_question(
    run_id: str,
    judge_text: str,
) -> tuple[str | None, dict[str, Any] | None]:
    """Return (matched_question_id, prep_answer_dict) for highest difflib ratio >= 0.45."""
    session = SESSIONS.get(run_id)
    if session is None:
        return None, None

    probe = _normalize_match_text(judge_text)
    if not probe:
        return None, None

    prep_by_id: dict[str, dict[str, Any]] = {
        str(item.get("question_id") or ""): item
        for item in session.latest_prep
        if isinstance(item, dict) and item.get("question_id")
    }

    candidates: list[tuple[str, str]] = []
    for q in session.latest_questions:
        if isinstance(q, dict) and q.get("id") and q.get("question"):
            candidates.append((str(q["id"]), str(q["question"])))
    if not candidates:
        for item in session.latest_prep:
            if isinstance(item, dict) and item.get("question_id") and item.get("question"):
                candidates.append((str(item["question_id"]), str(item["question"])))

    best_id: str | None = None
    best_ratio = 0.0
    for qid, qtext in candidates:
        ref = _normalize_match_text(qtext)
        if not ref:
            continue
        ratio = difflib.SequenceMatcher(None, probe, ref).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_id = qid

    if best_id is not None and best_ratio >= MATCH_QUESTION_THRESHOLD:
        return best_id, prep_by_id.get(best_id)
    return None, None


async def _debounce_research(run_id: str) -> None:
    try:
        await asyncio.sleep(DEBOUNCE_DELAY_S)
    except asyncio.CancelledError:
        return

    session = SESSIONS.get(run_id)
    if session is None:
        return

    words = len(session.transcript.split())
    if (
        words >= MIN_TRANSCRIPT_WORDS
        and words > session.last_researched_words
        and session.research_runs < MAX_RESEARCH_RUNS
    ):
        schedule_research(run_id, force=False)


async def on_founder_utterance(run_id: str, text: str, log: EventLog) -> None:
    """Append founder utterance to session transcript, emit pitch_update, and reset 6 s debounce."""
    session = ensure_session(run_id)
    if session.transcript:
        session.transcript = f"{session.transcript} {text}"
    else:
        session.transcript = text

    words = len(session.transcript.split())
    await log.emit(
        "pitch_update",
        "room",
        {"transcript": session.transcript, "words": words},
    )

    if session.debounce_task is not None and not session.debounce_task.done():
        session.debounce_task.cancel()

    if session.research_runs < MAX_RESEARCH_RUNS:
        task = asyncio.create_task(_debounce_research(run_id))
        session.debounce_task = task
        _track_task(task, f"debounce:{run_id}")


def schedule_research(run_id: str, force: bool = False) -> asyncio.Task[None] | None:
    """Schedule run_research in the background (cancelling any pending debounce timer if forced)."""
    session = ensure_session(run_id)
    if force and session.debounce_task is not None and not session.debounce_task.done():
        session.debounce_task.cancel()

    if not session.transcript.strip():
        return None
    if session.research_runs >= MAX_RESEARCH_RUNS:
        return None

    task = asyncio.create_task(run_research(run_id, force=force))
    session.research_task = task
    _track_task(task, f"research:{run_id}")
    return task


# ---------- Step helpers ----------


def _parse_price(value: Any) -> float | int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)) or value < 0:
            return None
        return int(value) if float(value).is_integer() else round(float(value), 2)
    if isinstance(value, str):
        cleaned = re.sub(r"[^0-9.]", "", value)
        if not cleaned:
            return None
        try:
            num = float(cleaned)
        except ValueError:
            return None
        if not math.isfinite(num) or num < 0:
            return None
        return int(num) if num.is_integer() else round(num, 2)
    return None


def _trim_words(text: str, max_words: int, ensure_question_mark: bool = False) -> str:
    cleaned = " ".join(str(text or "").split()).strip().strip('"').strip("'")
    words = cleaned.split()
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words]).rstrip(",;:-")
        if ensure_question_mark:
            cleaned = cleaned.rstrip(".!?") + "?"
    elif ensure_question_mark and cleaned and not cleaned.endswith("?"):
        cleaned = cleaned.rstrip(".!") + "?"
    return cleaned


def _extract_pitch_sync(transcript: str) -> dict[str, Any]:
    prompt = f"""Extract a structured product pitch from this live founder transcript.
Return ONLY valid JSON matching the schema:
- title: concise product or startup name (2-5 words; create a crisp descriptive title if unnamed).
- one_liner: clear one-sentence description of what the product is and the problem it solves.
- target_user: specific intended buyer or user segment.
- price_usd: numeric price in USD if mentioned, otherwise null.
- location: city, region, or country if mentioned, otherwise null.
- claims: up to 5 concrete factual, market, or product claims the founder made (short phrases).

Founder transcript:
{transcript}"""
    raw = generate_json(
        model=MODEL_IDS["pitch_extract"],
        parts=[text_part(prompt)],
        schema=SESSION_PITCH_SCHEMA,
        thinking="low",
    )
    if not isinstance(raw, dict):
        raise ValueError("Pitch extraction returned non-object JSON")

    title = " ".join(str(raw.get("title") or "").split()).strip() or "Live Pitch"
    one_liner = " ".join(str(raw.get("one_liner") or "").split()).strip() or transcript[:180]
    target_user = " ".join(str(raw.get("target_user") or "").split()).strip() or "General consumers"
    price_usd = _parse_price(raw.get("price_usd"))

    raw_loc = raw.get("location")
    location: str | None = None
    if isinstance(raw_loc, str):
        loc_clean = " ".join(raw_loc.split()).strip()
        if loc_clean and loc_clean.lower() not in ("null", "none", "n/a", "unknown"):
            location = loc_clean

    raw_claims = raw.get("claims")
    claims: list[str] = []
    if isinstance(raw_claims, list):
        for item in raw_claims:
            s = " ".join(str(item or "").split()).strip()
            if s:
                claims.append(s)
            if len(claims) >= 5:
                break

    return {
        "title": title,
        "one_liner": one_liner,
        "target_user": target_user,
        "price_usd": price_usd,
        "location": location,
        "claims": claims,
    }


async def _fetch_competitors_async(pitch: dict[str, Any]) -> list[dict[str, Any]]:
    one_liner = str(pitch.get("one_liner") or "").strip()
    title = str(pitch.get("title") or "").strip()
    queries: list[str] = []
    if one_liner:
        queries.append(one_liner[:140])
    if title and title != one_liner:
        queries.append(title[:100])
    if not queries:
        return []

    async with httpx.AsyncClient(timeout=COMPETITORS_TIMEOUT_S) as http:
        for query in queries:
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
            resp = await http.post(SHOPIFY_MCP_URL, headers=MCP_HEADERS, json=payload)
            resp.raise_for_status()
            rpc = _parse_mcp_response(resp.text)
            products = _extract_products(rpc)
            items: list[dict[str, Any]] = []
            for prod in products:
                mapped = _map_product(prod)
                if mapped is not None:
                    items.append(
                        {
                            "title": mapped["title"],
                            "price_usd": mapped["price_usd"],
                            "url": mapped["url"],
                        }
                    )
                    if len(items) >= 3:
                        break
            if items:
                return items
    return []


def _extract_grounding_urls(resp: Any) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for item in getattr(resp, "outputs", None) or []:
        if isinstance(item, dict):
            d = item
        elif hasattr(item, "model_dump"):
            try:
                d = item.model_dump(exclude_none=True)
            except Exception:  # noqa: BLE001
                d = {}
        else:
            d = {}
        if not isinstance(d, dict):
            continue
        results = d.get("result") or d.get("results") or []
        if isinstance(results, list):
            for r in results:
                if not isinstance(r, dict):
                    continue
                u = str(r.get("url") or "").strip()
                if u.startswith(("http://", "https://")) and u not in seen:
                    seen.add(u)
                    title = str(r.get("title") or "").strip()
                    urls.append(f"- {title}: {u}" if title else f"- {u}")
    return urls[:10]


def _web_research_sync(pitch: dict[str, Any]) -> list[dict[str, Any]]:
    loc = pitch.get("location")
    loc_hint = f" (especially in {loc})" if loc else ""
    claims_str = "; ".join(pitch.get("claims") or []) or "none stated"
    price_str = f"${pitch['price_usd']}" if pitch.get("price_usd") is not None else "unspecified"

    search_prompt = f"""You are researching a live startup pitch for a skeptical investor.
Product: {pitch.get('title')} — {pitch.get('one_liner')}
Target user: {pitch.get('target_user')}
Price: {price_str}
Location: {loc or 'not specified'}
Founder claims: {claims_str}

Give 3 short, specific, verifiable facts a skeptical investor should know about this product's market:
1. Existing competitors or well-known brands{loc_hint}
2. Recent market facts, demand trends, or pricing benchmarks
3. Regulatory, legal, distribution, or safety issues
Include a concrete source URL for each fact."""

    resp = client().interactions.create(
        model=MODEL_IDS["persona_driver"],
        input=search_prompt,
        tools=[{"type": "google_search"}],
        generation_config={"thinking_level": "low"},
    )
    raw_text = output_text(resp).strip()
    grounded_urls = _extract_grounding_urls(resp)
    if not raw_text and not grounded_urls:
        return []

    url_section = ""
    if grounded_urls:
        nl = chr(10)
        url_section = f"{nl}{nl}Grounded search result URLs:{nl}" + nl.join(grounded_urls)

    parse_prompt = f"""Extract up to 3 concise, investor-relevant market facts from the research notes below.
Return ONLY JSON matching the schema {{"facts": [{{"fact": string, "url": string|null}}]}}.
- Each fact must be 1 short sentence (<= 28 words) with concrete names or numbers.
- Use an exact http/https URL from the notes or grounded URLs when available, otherwise null.

Research notes:
{raw_text}{url_section}"""

    parsed = generate_json(
        model=MODEL_IDS["pitch_extract"],
        parts=[text_part(parse_prompt)],
        schema=WEB_FACTS_SCHEMA,
        thinking="low",
    )

    items = parsed.get("facts") if isinstance(parsed, dict) else []
    facts: list[dict[str, Any]] = []
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            fact_text = " ".join(str(item.get("fact") or "").split()).strip()
            if not fact_text:
                continue
            raw_url = item.get("url")
            url: str | None = None
            if isinstance(raw_url, str):
                u = raw_url.strip()
                if u.startswith(("http://", "https://")):
                    url = u
            facts.append({"fact": fact_text, "url": url})
            if len(facts) >= 3:
                break
    return facts


def _build_buyers_eval_text(
    pitch: dict[str, Any],
    competitors: list[dict[str, Any]],
) -> str:
    comp_lines: list[str] = []
    for item in competitors:
        title = item.get("title") or "Competitor"
        price = item.get("price_usd")
        price_str = f"${price:.2f}" if isinstance(price, (int, float)) else "price unknown"
        comp_lines.append(f"- {title} ({price_str})")
    comp_block = chr(10).join(comp_lines) if comp_lines else "- None found"

    claims_block = "; ".join(pitch.get("claims") or []) or "None stated"
    return f"""PRODUCT PITCH
Title: {pitch.get('title')}
One-liner: {pitch.get('one_liner')}
Target user: {pitch.get('target_user')}
Price (USD): {pitch.get('price_usd')}
Location: {pitch.get('location') or 'not specified'}
Claims: {claims_block}

COMPETING PRODUCTS
{comp_block}"""


async def _run_buyers_async(
    pitch: dict[str, Any],
    competitors: list[dict[str, Any]],
) -> dict[str, Any]:
    panel = _load_panel()
    if not panel:
        raise RuntimeError("panel_200.json has no personas")

    eval_text = _build_buyers_eval_text(pitch, competitors)
    input_parts = [text_part(eval_text)]

    questions: dict[str, dict[str, Any]] = {}
    for persona in panel:
        pid = persona["id"]
        summary = persona["summary"]
        for rubric_id, rubric_q, _ in RUBRICS:
            questions[f"{pid}_{rubric_id}"] = {
                "type": "noul",
                "instructions": f"You are this buyer: {summary}. {rubric_q}",
            }

    all_answers: dict[str, tuple[float, float | None]] = {}
    try:
        all_answers = await asyncio.to_thread(_call_decisions_sync, input_parts, questions)
        if not all_answers:
            raise ValueError("Decisions API returned no parseable answers")
    except Exception:  # noqa: BLE001
        items = list(questions.items())
        chunks = [
            dict(items[i : i + CHUNK_SIZE_QUESTIONS])
            for i in range(0, len(items), CHUNK_SIZE_QUESTIONS)
        ]

        async def _run_chunk(chunk: dict[str, dict[str, Any]]) -> dict[str, tuple[float, float | None]]:
            return await asyncio.to_thread(_call_decisions_sync, input_parts, chunk)

        chunk_results = await asyncio.gather(
            *[_run_chunk(chunk) for chunk in chunks],
            return_exceptions=True,
        )
        for res in chunk_results:
            if isinstance(res, dict):
                all_answers.update(res)

    rubric_totals: dict[str, list[float]] = {rid: [] for rid, _, _ in RUBRICS}
    persona_intents: list[float] = []

    for persona in panel:
        pid = persona["id"]
        scores: dict[str, float] = {}
        answered_any = False

        for rubric_id, _, _ in RUBRICS:
            ans = all_answers.get(f"{pid}_{rubric_id}")
            if ans is not None:
                prob, _ = ans
                scores[rubric_id] = prob
                rubric_totals[rubric_id].append(prob)
                answered_any = True

        if not answered_any:
            continue

        intent = math.prod(scores.get(rid, 0.5) ** weight for rid, _, weight in RUBRICS)
        persona_intents.append(intent)

    if not persona_intents:
        raise RuntimeError("No buyer personas answered")

    rubrics_mean = {
        rid: round(sum(vals) / len(vals), 4) if vals else 0.5
        for rid, vals in rubric_totals.items()
    }
    intent_mean = round(sum(persona_intents) / len(persona_intents), 4)
    weakest = min(rubrics_mean, key=lambda k: rubrics_mean[k])

    return {
        "n": len(persona_intents),
        "rubrics": rubrics_mean,
        "intent_mean": intent_mean,
        "weakest": weakest,
    }


def _format_research_summary(research: dict[str, Any]) -> str:
    lines: list[str] = []
    pitch = research.get("pitch") or {}
    lines.append(
        f"PITCH: {pitch.get('title')} — {pitch.get('one_liner')} "
        f"(target: {pitch.get('target_user')}; price: {pitch.get('price_usd')}; "
        f"location: {pitch.get('location') or 'unspecified'})"
    )
    claims = pitch.get("claims") or []
    if claims:
        lines.append("CLAIMS: " + "; ".join(claims))

    comps = research.get("competitors") or []
    if comps:
        comp_bits: list[str] = []
        for c in comps:
            price = c.get("price_usd")
            price_str = f"${price:.2f}" if isinstance(price, (int, float)) else "price n/a"
            comp_bits.append(f"{c.get('title')} ({price_str})")
        lines.append("SHOPIFY COMPETITORS: " + "; ".join(comp_bits))
    else:
        lines.append("SHOPIFY COMPETITORS: none found")

    web = research.get("web") or []
    if web:
        lines.append("WEB FACTS:")
        for w in web:
            u = f" ({w['url']})" if w.get("url") else ""
            lines.append(f"- {w.get('fact')}{u}")

    an = research.get("analyst")
    if isinstance(an, dict) and an.get("probability") is not None:
        p = float(an["probability"])
        lines.append(
            f"ANALYST: launch_probability={p:.2f} ({round(p * 100)}%); "
            f"reason={an.get('reason')}; framing={an.get('framing')}"
        )

    buyers = research.get("buyers")
    if isinstance(buyers, dict) and buyers.get("rubrics"):
        rubrics = buyers["rubrics"]
        rb_bits = [f"{k}={v:.2f} ({round(v * 100)}%)" for k, v in rubrics.items()]
        lines.append(
            f"BUYER PANEL ({buyers.get('n', 200)} buyers): intent_mean={buyers.get('intent_mean', 0.5):.2f} "
            f"({round(float(buyers.get('intent_mean', 0.5)) * 100)}%); "
            f"weakest={buyers.get('weakest')}; rubrics: {', '.join(rb_bits)}"
        )

    return chr(10).join(lines)


def _fallback_questions(research: dict[str, Any]) -> list[dict[str, Any]]:
    pitch = research.get("pitch") or {}
    title = pitch.get("title") or "your product"
    comps = research.get("competitors") or []
    buyers = research.get("buyers") or {}
    an = research.get("analyst") or {}

    if comps:
        c0 = comps[0]
        c_price = f" at ${c0['price_usd']}" if c0.get("price_usd") is not None else ""
        q1 = {
            "id": "q1",
            "question": f"Why will buyers pick {title} over {c0['title']}{c_price}?",
            "why": "Tests differentiation against existing retail alternatives.",
            "evidence": f"Shopify lists {c0['title']}{c_price}.",
            "source": "competitors",
        }
    else:
        q1 = {
            "id": "q1",
            "question": f"Who is the strongest incumbent to {title}, and why switch now?",
            "why": "Checks competitive moat and switching friction.",
            "evidence": f"Pitch targets {pitch.get('target_user') or 'buyers'}.",
            "source": "pitch",
        }

    weakest = buyers.get("weakest")
    rubrics = buyers.get("rubrics") or {}
    if weakest and weakest in rubrics:
        val = rubrics[weakest]
        q2 = {
            "id": "q2",
            "question": f"Our 200-buyer panel scored {weakest.replace('_', ' ')} lowest at {round(val * 100)}%; how do you fix it?",
            "why": "Probes the biggest conversion blocker in buyer data.",
            "evidence": f"200 buyers rated {weakest} lowest at {val:.2f}.",
            "source": "buyers",
        }
    else:
        q2 = {
            "id": "q2",
            "question": "What proves buyers will pay today instead of sticking with free alternatives?",
            "why": "Tests willingness to pay and urgency.",
            "evidence": f"Pitched price: {pitch.get('price_usd') or 'not specified'}.",
            "source": "pitch",
        }

    if an.get("probability") is not None:
        p = float(an["probability"])
        q3 = {
            "id": "q3",
            "question": "What unit economics and distribution channel prove you can hit your funding target?",
            "why": "Tests feasibility and go-to-market economics.",
            "evidence": f"Analyst launch probability estimated at {round(p * 100)}%.",
            "source": "analyst",
        }
    else:
        q3 = {
            "id": "q3",
            "question": "What are your unit margins and customer acquisition cost at this price?",
            "why": "Tests whether the business model actually scales.",
            "evidence": f"Target user: {pitch.get('target_user') or 'unspecified'}.",
            "source": "pitch",
        }

    return [q1, q2, q3]


def _generate_questions_sync(research: dict[str, Any]) -> list[dict[str, Any]]:
    summary = _format_research_summary(research)
    prompt = f"""You are advising a panel of sharp startup pitch judges listening live.
Using ONLY the research below, write EXACTLY 3 razor-sharp questions a judge should ask out loud.

Preferred mix:
- q1: one competitor or web-fact question (source: "competitors" or "web", fallback "pitch")
- q2: one buyer-panel weakness question referencing the weakest rubric/score (source: "buyers", fallback "pitch")
- q3: one economics, pricing, or feasibility question (source: "analyst" or "pitch")

Strict rules:
- Return ONLY JSON matching the schema with exactly 3 items (id: "q1", "q2", "q3").
- "question": <= 25 words, written naturally as a sharp judge would ask it out loud.
- "why": <= 15 words explaining why this matters.
- "evidence": <= 20 words citing a concrete fact or exact number from the research below.
- "source": one of "competitors", "web", "buyers", "analyst", "pitch".

RESEARCH:
{summary}"""

    raw = generate_json(
        model=MODEL_IDS["strategist"],
        parts=[text_part(prompt)],
        schema=JUDGE_QUESTIONS_SCHEMA,
        thinking="low",
    )
    raw_list = raw.get("questions") if isinstance(raw, dict) else []
    fallbacks = _fallback_questions(research)

    cleaned: list[dict[str, Any]] = []
    if isinstance(raw_list, list):
        for idx, item in enumerate(raw_list[:3]):
            if not isinstance(item, dict):
                continue
            qid = f"q{len(cleaned) + 1}"
            q_text = _trim_words(str(item.get("question") or ""), 25, ensure_question_mark=True)
            why_text = _trim_words(str(item.get("why") or ""), 15)
            ev_text = _trim_words(str(item.get("evidence") or ""), 20)
            src = str(item.get("source") or "pitch").strip().lower()
            if src not in VALID_QUESTION_SOURCES:
                src = "pitch"
            if not q_text:
                continue
            cleaned.append(
                {
                    "id": qid,
                    "question": q_text,
                    "why": why_text or fallbacks[min(idx, 2)]["why"],
                    "evidence": ev_text or fallbacks[min(idx, 2)]["evidence"],
                    "source": src,
                }
            )

    while len(cleaned) < 3:
        fb = dict(fallbacks[len(cleaned)])
        fb["id"] = f"q{len(cleaned) + 1}"
        cleaned.append(fb)

    return cleaned[:3]


def _generate_prep_sync(
    research: dict[str, Any],
    questions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    summary = _format_research_summary(research)
    q_block = json.dumps(questions, indent=2)
    prompt = f"""You are coaching a startup founder on stage right before Q&A.
Prepare concise, honest, speakable answers to the 3 likely judge questions below using ONLY the research provided.

Rules:
- Return ONLY JSON matching the schema with one answer per question ("q1", "q2", "q3").
- "question_id": exact id ("q1", "q2", "q3").
- "question": exact question text.
- "line": <= 22 words, first person ("We ...", "Our ..."), speakable out loud, honest — concede when the evidence is against the founder and state the concrete fix/plan.
- "points": exactly 2 short supporting bullets (<= 14 words each).
- "evidence": 1 short concrete fact or exact number from the research below.

RESEARCH:
{summary}

LIKELY JUDGE QUESTIONS:
{q_block}"""

    raw = generate_json(
        model=MODEL_IDS["room_founder"],
        parts=[text_part(prompt)],
        schema=FOUNDER_PREP_SCHEMA,
        thinking="low",
    )
    raw_list = raw.get("answers") if isinstance(raw, dict) else []
    by_id: dict[str, dict[str, Any]] = {}
    if isinstance(raw_list, list):
        for item in raw_list:
            if isinstance(item, dict) and item.get("question_id"):
                by_id[str(item["question_id"]).strip()] = item

    answers: list[dict[str, Any]] = []
    for idx, q in enumerate(questions):
        qid = str(q["id"])
        qtext = str(q["question"])
        item = by_id.get(qid)
        if item is None and isinstance(raw_list, list) and idx < len(raw_list) and isinstance(raw_list[idx], dict):
            item = raw_list[idx]
        item = item or {}

        line = _trim_words(str(item.get("line") or ""), 22)
        if not line:
            line = "Fair point; our data flags that risk, and we are addressing it with our initial launch plan."

        raw_points = item.get("points")
        points: list[str] = []
        if isinstance(raw_points, list):
            for p in raw_points:
                s = _trim_words(str(p or ""), 16)
                if s:
                    points.append(s)
                if len(points) >= 2:
                    break
        while len(points) < 2:
            points.append(
                "Acknowledge the evidence directly instead of hand-waving."
                if len(points) == 0
                else "Focus on the specific validation step before scaling spend."
            )

        evidence = _trim_words(str(item.get("evidence") or q.get("evidence") or ""), 22)
        answers.append(
            {
                "question_id": qid,
                "question": qtext,
                "line": line,
                "points": points[:2],
                "evidence": evidence,
            }
        )

    return answers


# ---------- Main research orchestrator ----------


async def run_research(run_id: str, force: bool = False) -> None:
    """Run live pitch research in parallel and emit research_status, pitch_research, judge_questions, founder_prep."""
    from pipeline import room as room_mod

    session = ensure_session(run_id)
    room_state = room_mod._get_room(run_id)
    log = room_state.log
    await room_mod._ensure_room_stage(room_state)

    async with session.research_lock:
        transcript = session.transcript.strip()
        if not transcript:
            return
        words = len(transcript.split())

        if not force:
            if words < MIN_TRANSCRIPT_WORDS or words <= session.last_researched_words:
                return
        else:
            if session.research_runs > 0 and words <= session.last_researched_words:
                return

        if session.research_runs >= MAX_RESEARCH_RUNS:
            return

        session.research_runs += 1
        session.last_researched_words = words
        t0 = time.monotonic()

        async def _emit_status(step: str, state: str, message: str) -> None:
            await log.emit(
                "research_status",
                "room",
                {"step": step, "state": state, "message": message},
            )

        # 1. Pitch extraction
        await _emit_status("pitch", "running", "Extracting pitch claims and target user")
        try:
            pitch = await asyncio.wait_for(
                asyncio.to_thread(_extract_pitch_sync, transcript),
                timeout=PITCH_TIMEOUT_S,
            )
            await _emit_status("pitch", "done", f"Extracted pitch: {pitch['title']}")
        except Exception as exc:  # noqa: BLE001
            await _emit_status("pitch", "failed", _sanitize_error(f"Pitch extraction failed ({type(exc).__name__})"))
            pitch = {
                "title": "Live Pitch",
                "one_liner": transcript[:180],
                "target_user": "General consumers",
                "price_usd": None,
                "location": None,
                "claims": [],
            }

        # 2. Parallel research steps
        competitors_res: list[dict[str, Any]] = []
        web_res: list[dict[str, Any]] = []
        analyst_res: dict[str, Any] | None = None
        buyers_res: dict[str, Any] | None = None

        def _snapshot() -> dict[str, Any]:
            return {
                "pitch": pitch,
                "competitors": list(competitors_res),
                "web": list(web_res),
                "analyst": dict(analyst_res) if isinstance(analyst_res, dict) else None,
                "buyers": dict(buyers_res) if isinstance(buyers_res, dict) else None,
                "latency_ms": int(round(max(0.0, time.monotonic() - t0) * 1000)),
            }

        async def _emit_research() -> dict[str, Any]:
            payload = _snapshot()
            session.latest_research = payload
            await log.emit("pitch_research", "room", payload)
            return payload

        async def _step_competitors() -> list[dict[str, Any]]:
            nonlocal competitors_res
            await _emit_status("competitors", "running", "Searching Shopify catalog for competitors")
            try:
                items = await asyncio.wait_for(_fetch_competitors_async(pitch), timeout=COMPETITORS_TIMEOUT_S)
                competitors_res = items
                await _emit_status("competitors", "done", f"Found {len(items)} Shopify competitors")
                await _emit_research()
                return items
            except Exception as exc:  # noqa: BLE001
                competitors_res = []
                await _emit_status(
                    "competitors",
                    "failed",
                    _sanitize_error(f"Competitor search failed ({type(exc).__name__})"),
                )
                await _emit_research()
                return []

        async def _step_web() -> list[dict[str, Any]]:
            nonlocal web_res
            await _emit_status("web", "running", "Checking web for incumbents and market facts")
            try:
                facts = await asyncio.wait_for(
                    asyncio.to_thread(_web_research_sync, pitch),
                    timeout=WEB_TIMEOUT_S,
                )
                web_res = facts
                await _emit_status("web", "done", f"Found {len(facts)} web market facts")
                return facts
            except Exception as exc:  # noqa: BLE001
                web_res = []
                await _emit_status("web", "failed", _sanitize_error(f"Web research failed ({type(exc).__name__})"))
                return []

        async def _step_analyst() -> dict[str, Any] | None:
            nonlocal analyst_res
            await _emit_status("analyst", "running", "Estimating calibrated launch probability")
            try:
                raw = await asyncio.wait_for(
                    asyncio.to_thread(analyst._analyse_sync, pitch),
                    timeout=ANALYST_TIMEOUT_S,
                )
                prob = max(0.0, min(1.0, float(raw["probability"])))
                analyst_res = {
                    "probability": round(prob, 4),
                    "reason": str(raw.get("reason") or "").strip(),
                    "framing": str(raw.get("campaign_text") or "").strip(),
                }
                await _emit_status("analyst", "done", f"Launch probability {round(prob * 100)}%")
                return analyst_res
            except Exception as exc:  # noqa: BLE001
                analyst_res = None
                await _emit_status("analyst", "failed", _sanitize_error(f"Analyst failed ({type(exc).__name__})"))
                return None

        async def _step_buyers(comp_task: asyncio.Task[list[dict[str, Any]]]) -> dict[str, Any] | None:
            nonlocal buyers_res
            await _emit_status("buyers", "running", "Polling 200 synthetic buyers")
            comps_for_buyers: list[dict[str, Any]] = []
            try:
                comps_for_buyers = await asyncio.wait_for(
                    asyncio.shield(comp_task),
                    timeout=COMPETITORS_WAIT_FOR_BUYERS_S,
                )
            except Exception:  # noqa: BLE001
                comps_for_buyers = list(competitors_res)

            try:
                result = await asyncio.wait_for(
                    _run_buyers_async(pitch, comps_for_buyers),
                    timeout=BUYERS_TIMEOUT_S,
                )
                buyers_res = result
                await _emit_status(
                    "buyers",
                    "done",
                    f"{result['n']} buyers · weakest: {result['weakest']}",
                )
                await _emit_research()
                return result
            except Exception as exc:  # noqa: BLE001
                buyers_res = None
                await _emit_status("buyers", "failed", _sanitize_error(f"Buyer panel failed ({type(exc).__name__})"))
                return None

        comp_task = asyncio.create_task(_step_competitors())
        web_task = asyncio.create_task(_step_web())
        analyst_task = asyncio.create_task(_step_analyst())
        buyers_task = asyncio.create_task(_step_buyers(comp_task))

        await asyncio.gather(comp_task, web_task, analyst_task, buyers_task)
        final_research = await _emit_research()

        # 3. Judge questions (Neon, low)
        await _emit_status("questions", "running", "Drafting top 3 judge questions")
        try:
            questions = await asyncio.wait_for(
                asyncio.to_thread(_generate_questions_sync, final_research),
                timeout=QUESTIONS_TIMEOUT_S,
            )
            await _emit_status("questions", "done", "3 judge questions ready")
        except Exception as exc:  # noqa: BLE001
            questions = _fallback_questions(final_research)
            await _emit_status(
                "questions",
                "failed",
                _sanitize_error(f"Question generation failed ({type(exc).__name__}); using fallback"),
            )

        session.latest_questions = questions
        await log.emit("judge_questions", "room", {"questions": questions})

        # 4. Founder prep (Hydrogen, low)
        await _emit_status("prep", "running", "Preparing founder answer cards")
        try:
            answers = await asyncio.wait_for(
                asyncio.to_thread(_generate_prep_sync, final_research, questions),
                timeout=PREP_TIMEOUT_S,
            )
            session.latest_prep = answers
            await log.emit("founder_prep", "room", {"answers": answers})
            await _emit_status("prep", "done", "Prepared 3 founder answers")
        except Exception as exc:  # noqa: BLE001
            await _emit_status("prep", "failed", _sanitize_error(f"Founder prep failed ({type(exc).__name__})"))
