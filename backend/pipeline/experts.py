"""The expert team behind the judges: six AI specialists that work on the pitch in parallel and post
short notes into the judges' channel as each one finishes (event `expert_note`).

Three use live Google Search (market size, similar products, startups that failed/succeeded);
three reason from the pitch (go-to-market, social media, sales). Each runs on its own, so notes
arrive staggered while the founder is still on stage.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from pipeline.context import EventLog
from pipeline.llm import MODEL_IDS, client, generate_json, output_text

NOTE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "message": {"type": "string"},
        "kind": {"type": "string", "enum": ["insight", "risk", "question"]},
        "question": {"type": "string"},
        "headline": {"type": "string"},
    },
    "required": ["message", "kind", "headline"],
}

# (id, name, role, model key, uses web search, task)
EXPERTS: list[tuple[str, str, str, str, bool, str]] = [
    ("market", "Maya", "Market analyst", "persona_driver", True,
     "Estimate the market size (TAM/SAM in USD, with the year and a source) for this product in its launch market, "
     "and say whether it is growing."),
    ("rivals", "Theo", "Competitive intel", "persona_driver", True,
     "Name the 2-3 most similar products or companies that already exist (with price and where they sell), "
     "and the one thing this founder must do differently."),
    ("history", "Iris", "Startup historian", "persona_driver", True,
     "Find one similar startup that FAILED and one that SUCCEEDED in this space, and the single reason each "
     "failed or succeeded."),
    ("gtm", "Ravi", "Go-to-market strategist", "strategist", False,
     "Give the best first go-to-market channel for this launch and the first 90-day milestone that would prove it."),
    ("social", "Zoe", "Social media manager", "persona_driver", False,
     "Judge its social/viral potential: the one content angle that could get it millions of views (platform + "
     "format), or why it won't spread."),
    ("sales", "Marco", "Sales lead", "persona_driver", False,
     "Ask the founder the hardest sales question: who exactly buys, through which channel, at what price, and "
     "why they would switch."),
]


def _expert_sync(expert: tuple[str, str, str, str, bool, str], pitch: dict[str, Any], transcript: str) -> dict[str, Any]:
    eid, name, role, model_key, web, task = expert
    brief = (
        f"Startup pitch (live, spoken): {transcript}\n"
        f"Structured: {pitch}\n\n"
        f"You are {name}, the {role} on the judges' support team. {task}"
    )
    sources: list[str] = []
    if web:
        resp = client().interactions.create(
            model=MODEL_IDS[model_key],
            input=brief + " Use web search for real, current facts and include source URLs.",
            tools=[{"type": "google_search"}],
            generation_config={"thinking_level": "low"},
        )
        research = output_text(resp)
        from pipeline.session import _extract_grounding_urls  # reuse the grounding URL helper

        sources = _extract_grounding_urls(resp)[:2]
        brief = brief + f"\n\nYour research notes:\n{research}"
    note = generate_json(
        MODEL_IDS[model_key] if not web else MODEL_IDS["persona_driver"],
        brief
        + "\n\nPost ONE short note to the judges' channel, in your own voice, first person, concrete numbers/names "
        "when you have them. Fields: headline (≤8 words), message (≤40 words), kind (insight | risk | question), "
        "question (≤22 words: the cross-question you'd want the judges to ask the founder).",
        NOTE_SCHEMA,
        thinking="low",
    )
    return {
        "expert_id": eid,
        "name": name,
        "role": role,
        "headline": str(note.get("headline", "")).strip(),
        "message": str(note.get("message", "")).strip(),
        "kind": note.get("kind", "insight"),
        "question": str(note.get("question", "")).strip() or None,
        "sources": sources,
        "web": web,
    }


async def run_experts(pitch: dict[str, Any], transcript: str, log: EventLog) -> None:
    t0 = time.monotonic()

    async def one(expert: tuple[str, str, str, str, bool, str]) -> None:
        await log.emit("expert_status", "room", {"expert_id": expert[0], "name": expert[1], "role": expert[2], "state": "working"})
        try:
            note = await asyncio.wait_for(asyncio.to_thread(_expert_sync, expert, pitch, transcript), timeout=45)
        except Exception as exc:  # noqa: BLE001
            await log.emit("expert_status", "room", {"expert_id": expert[0], "name": expert[1], "role": expert[2], "state": "failed"})
            print(f"[experts] {expert[0]} failed: {type(exc).__name__}", flush=True)
            return
        note["latency_ms"] = int((time.monotonic() - t0) * 1000)
        await log.emit("expert_note", "room", note)

    await asyncio.gather(*(one(e) for e in EXPERTS))
