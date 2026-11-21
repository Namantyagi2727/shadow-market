"""Thin Gemini helpers shared by all stages. Owned by Claude Code (lead).

All calls are synchronous; call them from async code with `await asyncio.to_thread(...)`.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import re
import sys
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai

from .context import BACKEND_DIR, REPO_ROOT

load_dotenv(REPO_ROOT / ".env")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
from models import MODEL_IDS  # noqa: E402,F401  (re-exported for stages)


@lru_cache(maxsize=1)
def client() -> genai.Client:
    return genai.Client()


@lru_cache(maxsize=1)
def beta() -> genai.Client:
    """v1beta client: Decisions API and Managed Agents."""
    return genai.Client(http_options={"api_version": "v1beta"})


# ---------- input parts ----------

def text_part(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def image_part(path_or_bytes: Path | bytes, mime_type: str = "image/png") -> dict[str, Any]:
    data = path_or_bytes if isinstance(path_or_bytes, bytes) else Path(path_or_bytes).read_bytes()
    return {"type": "image", "data": base64.b64encode(data).decode("ascii"), "mime_type": mime_type}


def upload(path: Path) -> Any:
    """Upload a media file (video/audio) with the Files API and wait until it is ACTIVE."""
    f = client().files.upload(file=str(path))
    for _ in range(120):
        state = str(getattr(f, "state", "ACTIVE"))
        if "PROCESSING" not in state:
            break
        time.sleep(1)
        f = client().files.get(name=f.name)
    return f


def video_part(path: Path, agentic: bool = False) -> dict[str, Any]:
    f = upload(path)
    mime = getattr(f, "mime_type", None) or mimetypes.guess_type(str(path))[0] or "video/webm"
    part = {"type": "video", "uri": f.uri, "mime_type": mime}
    if agentic:
        part["processing"] = "agentic"
    return part


# ---------- calls ----------

def output_text(resp: Any) -> str:
    text = getattr(resp, "output_text", None)
    if text:
        return str(text)
    parts: list[str] = []
    for item in getattr(resp, "outputs", None) or []:
        t = item.get("text") if isinstance(item, dict) else getattr(item, "text", None)
        if t:
            parts.append(str(t))
    return "\n".join(parts)


def generate_text(model: str, parts: list[dict[str, Any]] | str, thinking: str = "medium") -> str:
    resp = client().interactions.create(model=model, input=parts, generation_config={"thinking_level": thinking})
    return output_text(resp)


def parse_json(text: str) -> Any:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*```$", "", t).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"(\{.*\}|\[.*\])", t, flags=re.DOTALL)
        if not m:
            raise
        return json.loads(m.group(1))


def generate_json(
    model: str,
    parts: list[dict[str, Any]] | str,
    schema: dict[str, Any] | None = None,
    thinking: str = "medium",
) -> Any:
    """Ask for JSON. Uses native structured output (`response_format`) when a schema is given,
    and falls back to parsing JSON from text if the API rejects it."""
    kwargs: dict[str, Any] = {"model": model, "input": parts, "generation_config": {"thinking_level": thinking}}
    if schema:
        kwargs["response_format"] = schema
    try:
        resp = client().interactions.create(**kwargs)
    except Exception:
        if not schema:
            raise
        kwargs.pop("response_format")
        if isinstance(parts, str):
            kwargs["input"] = parts + "\n\nReturn ONLY JSON matching this schema:\n" + json.dumps(schema)
        else:
            kwargs["input"] = list(parts) + [text_part("Return ONLY JSON matching this schema:\n" + json.dumps(schema))]
        resp = client().interactions.create(**kwargs)
    return parse_json(output_text(resp))
