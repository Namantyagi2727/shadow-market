"""Spike: Gemini Live judge twin via ephemeral token. Text turn in -> audio out + tool call challenge_founder."""

import asyncio
import datetime as dt
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from google import genai  # noqa: E402
from google.genai import types  # noqa: E402
from pipeline.llm import MODEL_IDS, client  # noqa: E402,F401

TOOL = types.Tool(function_declarations=[types.FunctionDeclaration(
    name="challenge_founder",
    description="Send one sharp, specific challenge to the founder's screen.",
    parameters={"type": "object", "properties": {"challenge": {"type": "string"}}, "required": ["challenge"]},
)])
SYSTEM = ("You are the digital twin of a skeptical VC judge at a pitch. When the judge says something, "
          "say a short spoken challenge (max 2 sentences) AND call challenge_founder with it.")


async def main() -> None:
    now = dt.datetime.now(dt.timezone.utc)
    tok_client = genai.Client(http_options={"api_version": "v1alpha"})
    tok = tok_client.auth_tokens.create(config=types.CreateAuthTokenConfig(
        uses=1,
        expire_time=(now + dt.timedelta(minutes=30)).isoformat(),
        new_session_expire_time=(now + dt.timedelta(minutes=2)).isoformat(),
        live_connect_constraints=types.LiveConnectConstraints(
            model=MODEL_IDS["live_voice"],
            config=types.LiveConnectConfig(response_modalities=["AUDIO"], system_instruction=SYSTEM, tools=[TOOL],
                                           output_audio_transcription={}),
        ),
    ))
    print("token ok:", bool(tok.name))
    live = genai.Client(api_key=tok.name, http_options={"api_version": "v1alpha"})
    t0 = time.time()
    async with live.aio.live.connect(model=MODEL_IDS["live_voice"], config={}) as s:
        print(f"connected {time.time()-t0:.1f}s")
        t1 = time.time()
        await s.send_client_content(turns=types.Content(role="user", parts=[types.Part(text=
            "Judge said out loud: 'Why wouldn't Dove just launch a refill case next quarter and crush you?'")]), turn_complete=True)
        first_audio, audio_bytes, said = None, 0, ""
        for _turn in range(3):
            async for msg in s.receive():
                sc = msg.server_content
                if sc and sc.model_turn:
                    for p in sc.model_turn.parts or []:
                        if p.inline_data and p.inline_data.data:
                            first_audio = first_audio or time.time() - t1
                            audio_bytes += len(p.inline_data.data)
                if sc and sc.output_transcription and sc.output_transcription.text:
                    said += sc.output_transcription.text
                if msg.tool_call:
                    for fc in msg.tool_call.function_calls:
                        print(f"TOOL CALL at {time.time()-t1:.1f}s: {fc.name} {dict(fc.args)}")
                        await s.send_tool_response(function_responses=[types.FunctionResponse(id=fc.id, name=fc.name, response={"ok": True})])
                if sc and sc.turn_complete:
                    break
            if audio_bytes:
                break
        print(f"first audio after {first_audio and round(first_audio,2)}s, {audio_bytes} audio bytes, total {time.time()-t1:.1f}s")
        print("spoke:", said.strip()[:200])


asyncio.run(main())
