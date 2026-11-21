"""Simulate Laptop B's Live judge twin against our API: token -> Live session -> gate -> tool call -> /room/challenge.

Usage (server on :8000): uv run python -u spikes/test_room_live_twin.py <run_id>
"""

import asyncio
import json
import sys
import time
from datetime import datetime, timezone

import httpx
import websockets
from google import genai
from google.genai import types

API = "http://localhost:8000"


async def main(run_id: str) -> None:
    tok = httpx.post(f"{API}/api/runs/{run_id}/room/twin-token", json={"seat": 2}).json()
    print("token ok:", bool(tok.get("ephemeral_token")), "model:", tok.get("model"))
    live = genai.Client(api_key=tok["ephemeral_token"], http_options={"api_version": "v1alpha"})
    start_iso = datetime.now(timezone.utc).isoformat()
    t0 = time.time()
    async with live.aio.live.connect(model=tok["model"], config={}) as s, websockets.connect(f"ws://localhost:8000/ws/runs/{run_id}") as ev_ws:
        httpx.post(f"{API}/api/runs/{run_id}/room/ask", json={"text": "What's your repeat purchase rate on refills, and why would anyone stick around after month two?", "seat": 2})
        async for raw in ev_ws:
            ev = json.loads(raw)
            if ev["ts"] < start_iso or ev["stage"] != "room" or ev["type"] == "room_caption":
                continue
            print(f"[{time.time()-t0:5.1f}s] {ev['type']}: {json.dumps(ev['data'])[:220]}")
            if ev["type"] == "room_gate" and ev["data"]["triggered"]:
                uid = ev["data"]["utterance_id"]
                await s.send_client_content(turns=types.Content(role="user", parts=[types.Part(text="Judge said out loud: 'What's your repeat purchase rate on refills, and why would anyone stick around after month two?'")]), turn_complete=True)
                done = False
                for _ in range(3):
                    async for msg in s.receive():
                        if msg.tool_call:
                            for fc in msg.tool_call.function_calls:
                                print(f"[{time.time()-t0:5.1f}s] LIVE tool call: {dict(fc.args)}")
                                httpx.post(f"{API}/api/runs/{run_id}/room/challenge", json={"seat": 2, "text": fc.args["challenge"], "utterance_id": uid})
                                await s.send_tool_response(function_responses=[types.FunctionResponse(id=fc.id, name=fc.name, response={"ok": True})])
                                done = True
                    if done:
                        break
            if ev["type"] == "founder_brief":
                break
    print("stats:", httpx.get(f"{API}/api/room/stats").json())


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
