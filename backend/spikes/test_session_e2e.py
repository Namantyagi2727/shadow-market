"""E2E test of a live pitch session: spoken founder pitch on the founder mic, then a spoken judge question
(deliberately NOT one of the suggestions) on the judge mic. Prints every session event with timing.

Usage (server on :8000): uv run python -u spikes/test_session_e2e.py
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

API = "http://localhost:8000"
OUT = Path(__file__).resolve().parents[1] / "runs" / "spikes" / "session_tts"
PITCH = (
    "Hi, I'm launching GlowSip, a smart cap that fits the water bottles kids already own. It glows when "
    "they haven't had a sip in an hour and sends parents a daily hydration summary. It's twenty-nine dollars, "
    "no subscription, and we're launching first in San Francisco for parents of six to ten year olds."
)
JUDGE_Q = "Isn't there already a company in New York selling a smart kids' bottle that does exactly this?"
SKIP = {"room_caption", "pitch_update"}


def pcm16k(path: Path) -> bytes:
    with wave.open(str(path)) as w:
        data, rate, ch = w.readframes(w.getnframes()), w.getframerate(), w.getnchannels()
    if ch == 2:
        data = audioop.tomono(data, 2, 0.5, 0.5)
    return audioop.ratecv(data, 2, 1, rate, 16000, None)[0]


async def speak(run_id: str, role: str, pcm: bytes, tail_s: float) -> None:
    async with websockets.connect(f"ws://localhost:8000/ws/runs/{run_id}/room-audio?role={role}") as ws:
        silence = b"\x00\x00" * 1600
        for i in range(0, len(pcm), 3200):
            await ws.send(pcm[i : i + 3200])
            await asyncio.sleep(0.1)
        for _ in range(int(tail_s / 0.1)):
            await ws.send(silence)
            await asyncio.sleep(0.1)


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pitch_wav, judge_wav = OUT / "pitch.wav", OUT / "judge.wav"
    if not pitch_wav.exists():
        _synthesize_wav(PITCH, "Kore", pitch_wav)
    if not judge_wav.exists():
        _synthesize_wav(JUDGE_Q, "Charon", judge_wav)

    run_id = httpx.post(f"{API}/api/sessions", json={}).json()["run_id"]
    print("session:", run_id)
    t0 = time.time()
    done = asyncio.Event()

    async def listen():
        async with websockets.connect(f"ws://localhost:8000/ws/runs/{run_id}") as ws:
            async for raw in ws:
                ev = json.loads(raw)
                if ev["type"] in SKIP or ev["type"] == "expert_status":
                    continue
                d = ev["data"]
                if ev["type"] == "research_status":
                    msg = f"{d.get('step')} {d.get('state')}"
                elif ev["type"] == "judge_questions":
                    msg = " | ".join(q["question"] for q in d.get("questions", []))
                elif ev["type"] == "expert_note":
                    msg = f"{d.get('name')} ({d.get('role')}): {d.get('headline')} — ask: {d.get('question')}"
                elif ev["type"] == "founder_prep":
                    msg = f"{len(d.get('answers', []))} prepared answers"
                elif ev["type"] == "pitch_research":
                    msg = json.dumps({k: d.get(k) for k in ("web", "latency_ms")})[:260]
                else:
                    msg = json.dumps(d)[:260]
                print(f"[{time.time()-t0:6.1f}s] {ev['type']}: {msg}")
                if ev["type"] == "founder_brief_update":
                    done.set()
                    return

    listener = asyncio.create_task(listen())
    await speak(run_id, "founder", pcm16k(pitch_wav), tail_s=40)  # pause → research runs
    print(f"[{time.time()-t0:6.1f}s] --- judge asks an UNEXPECTED question ---")
    await speak(run_id, "judge", pcm16k(judge_wav), tail_s=4)
    try:
        await asyncio.wait_for(done.wait(), timeout=60)
    except asyncio.TimeoutError:
        print("no founder_brief_update within 60 s")
    listener.cancel()


if __name__ == "__main__":
    asyncio.run(main())
