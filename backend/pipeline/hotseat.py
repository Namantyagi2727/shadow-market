"""Hot-seat interview session builder using Gemini Live ephemeral auth tokens."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

from google import genai
from google.genai import types

from pipeline.context import BACKEND_DIR, RunContext
from pipeline.llm import MODEL_IDS, client

PERSONAS_PATH = BACKEND_DIR / "personas.json"


@lru_cache(maxsize=1)
def _alpha_client() -> genai.Client:
    """v1alpha client fallback for ephemeral auth tokens if required by the SDK."""
    return genai.Client(http_options={"api_version": "v1alpha"})


def _load_persona(persona_id: str) -> dict[str, Any]:
    personas: list[dict[str, Any]] = json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))
    for persona in personas:
        if persona.get("id") == persona_id:
            return persona
    raise KeyError(f"Unknown persona_id: {persona_id}")


def _find_lab_result(ctx: RunContext, persona_id: str) -> dict[str, Any]:
    for item in ctx.lab_results:
        if item.get("persona_id") == persona_id:
            return item

    # Fallback to on-disk action log if present (e.g. replayed run)
    disk_log = ctx.run_dir / "lab" / f"{persona_id}.json"
    if disk_log.is_file():
        try:
            data = json.loads(disk_log.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
            if isinstance(data, list):
                return {"persona_id": persona_id, "actions": data}
        except json.JSONDecodeError:
            pass
    return {}


def _build_system_instruction(
    persona: dict[str, Any],
    ctx: RunContext,
    lab_result: dict[str, Any],
    markers: list[dict[str, Any]],
) -> str:
    product_lines: list[str] = []
    if ctx.pitch:
        if ctx.pitch.get("title"):
            product_lines.append(f"Product title: {ctx.pitch['title']}")
        if ctx.pitch.get("one_liner"):
            product_lines.append(f"Pitch one-liner: {ctx.pitch['one_liner']}")
        if ctx.pitch.get("price_usd") is not None:
            product_lines.append(f"Pitched price: ${ctx.pitch['price_usd']}")
    if ctx.spec:
        if ctx.spec.get("headline"):
            product_lines.append(f"Page headline: {ctx.spec['headline']}")
        if ctx.spec.get("price_usd") is not None:
            product_lines.append(f"Page price: ${ctx.spec['price_usd']}")
    product_block = chr(10).join(product_lines) if product_lines else "(Product details not recorded)"

    outcome = lab_result.get("outcome", "unknown")
    quit_reason = lab_result.get("quit_reason")
    duration_s = lab_result.get("duration_s")
    actions = lab_result.get("actions") or []

    action_lines: list[str] = []
    for idx, act in enumerate(actions, start=1):
        t_val = act.get("t", act.get("seconds", "?"))
        action_name = act.get("action", "?")
        target = act.get("target") or act.get("target_index") or ""
        thought = act.get("thought") or ""
        target_str = f" target={target!r}" if target != "" else ""
        action_lines.append(f"{idx}. [t={t_val}s] {action_name}{target_str} — thought: {thought}")
    actions_block = chr(10).join(action_lines) if action_lines else "(No recorded browser actions)"

    marker_lines: list[str] = []
    for m in markers:
        marker_lines.append(f"- [t={m.get('t', '?')}s] ({m.get('kind', 'note')}): {m.get('note', '')}")
    markers_block = chr(10).join(marker_lines) if marker_lines else "(No quit analysis markers)"

    return f"""You are {persona['name']}, a {persona['age']}-year-old {persona['role']}, being interviewed live right after visiting a product website on your {persona['device']}.

Rules you MUST follow:
- Speak in first person as {persona['name']} about the visit you just made.
- Keep every answer short, direct, and natural for spoken voice (1 to 3 sentences).
- Ground every single detail in your persona profile, your recorded visit log, your quit reason, and the markers below.
- NEVER invent clicks, form entries, pages, buttons, prices, or bugs that are not in your recorded log.
- If the interviewer asks about something you did not see, click, or do, admit uncertainty honestly (for example: "I didn't get that far" or "I'm not sure, I didn't click that").

Persona profile:
{json.dumps(persona, indent=2)}

Product site you visited:
{product_block}

Visit outcome:
- Outcome: {outcome}
- Duration: {duration_s if duration_s is not None else 'unknown'}s
- Quit reason: {quit_reason if quit_reason else 'none recorded'}

Your recorded actions and thoughts during the visit:
{actions_block}

Observed confusion/quit markers from your session recording:
{markers_block}
"""


def _build_token_config(
    model: str,
    system_instruction: str,
    expire_time: str,
    new_session_expire_time: str,
) -> types.CreateAuthTokenConfig:
    live_config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=system_instruction,
    )
    config_kwargs: dict[str, Any] = {
        "uses": 1,
        "expire_time": expire_time,
        "new_session_expire_time": new_session_expire_time,
    }
    config_fields = getattr(types.CreateAuthTokenConfig, "model_fields", {})

    if hasattr(types, "LiveEphemeralParameters") and (
        not config_fields or "live_constrained_parameters" in config_fields
    ):
        config_kwargs["live_constrained_parameters"] = types.LiveEphemeralParameters(
            model=model,
            config=live_config,
        )
    elif hasattr(types, "LiveConnectConstraints") and (
        not config_fields or "live_connect_constraints" in config_fields
    ):
        config_kwargs["live_connect_constraints"] = types.LiveConnectConstraints(
            model=model,
            config=live_config,
        )

    return types.CreateAuthTokenConfig(**config_kwargs)


def create_hotseat_session(ctx: RunContext, persona_id: str) -> dict[str, str]:
    """Create a constrained ephemeral Gemini Live token for interviewing a persona."""
    persona = _load_persona(persona_id)
    lab_result = _find_lab_result(ctx, persona_id)
    markers = ctx.quit_markers.get(persona_id, [])

    system_instruction = _build_system_instruction(persona, ctx, lab_result, markers)
    model = MODEL_IDS["live_voice"]

    now = datetime.now(timezone.utc)
    expire_time = (now + timedelta(minutes=30)).isoformat().replace("+00:00", "Z")
    new_session_expire_time = (now + timedelta(minutes=2)).isoformat().replace("+00:00", "Z")

    config = _build_token_config(model, system_instruction, expire_time, new_session_expire_time)

    try:
        token = client().auth_tokens.create(config=config)
    except Exception:  # noqa: BLE001
        token = _alpha_client().auth_tokens.create(config=config)

    token_name = getattr(token, "name", None)
    if not token_name:
        raise RuntimeError("Auth token response missing token name")

    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and token_name == api_key:
        raise RuntimeError("Refusing to return API key as ephemeral token")

    return {
        "ephemeral_token": str(token_name),
        "model": model,
        "system_instruction": system_instruction,
    }
