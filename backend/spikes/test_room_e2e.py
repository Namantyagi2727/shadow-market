"""E2E test for the Q&A room: speak judge lines (TTS) into WS room-audio, print room events.

Usage (server running on :8000): uv run python -u spikes/test_room_e2e.py <run_id>
"""

import asyncio
import audioop
import json
import sys
import time
import wave
from pathlib import Path

import httpx
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.boardroom import _synthesize_wav  # noqa: E402

LINES = [
    ("Thanks, that was a really clear demo.", "Kore"),
    ("Honestly, why wouldn't the big brands just copy this next quarter and undercut your price?", "Charon"),
]
OUT = Path(__file__).resolve().parents[1] / "runs" / "spikes" / "room_tts"
ROOM_TYPES = {"room_caption", "room_utterance", "room_gate", "twin_challenge", "founder_brief", "stage_changed", "error"}


def pcm16k(path: Path) -> bytes:
    with wave.open(str(path)) as w:
        data, rate, ch = w.readframes(w.getnframes()), w.getframerate(), w.getnchannels()
    if ch == 2:
        data = audioop.tomono(data, 2, 0.5, 0.5)
    return audioop.ratecv(data, 2, 1, rate, 16000, None)[0]


async def main(run_id: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    clips = []
    for i, (text, voice) in enumerate(LINES):
        p = OUT / f"line_{i}.wav"
        if not p.exists():
            _synthesize_wav(text, voice, p)
        clips.append(pcm16k(p))
    silence = b"\x00\x00" * 16000 * 2  # 2 s pause between speakers
    audio = silence.join(clips) + silence * 3

    t0 = time.time()
    seen = {"brief": False}

    async def listen():
        async with websockets.connect(f"ws://localhost:8000/ws/runs/{run_id}") as ws:
            async for raw in ws:
                ev = json.loads(raw)
                if ev["type"] in ROOM_TYPES and ev["ts"] >= start_iso:
                    if ev["type"] == "room_caption":
                        continue
                    print(f"[{time.time()-t0:5.1f}s] {ev['type']}: {json.dumps(ev['data'])[:260]}")
                    if ev["type"] == "founder_brief":
                        seen["brief"] = True
                        return

    async def speak():
        async with websockets.connect(f"ws://localhost:8000/ws/runs/{run_id}/room-audio") as ws:
            for i in range(0, len(audio), 3200):
                await ws.send(audio[i : i + 3200])
                await asyncio.sleep(0.1)  # real time
            await asyncio.sleep(25)

    from datetime import datetime, timezone
    start_iso = datetime.now(timezone.utc).isoformat()
    listener = asyncio.create_task(listen())
    speaker = asyncio.create_task(speak())
    try:
        await asyncio.wait_for(listener, timeout=70)
    except asyncio.TimeoutError:
        print("timeout waiting for founder_brief")
    speaker.cancel()
    print("stats:", httpx.get("http://localhost:8000/api/room/stats").json())


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
