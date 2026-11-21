"""Spike: stream two speakers' audio into gemini-3.5-transcribe-live with diarization; print finished lines."""

import asyncio
import audioop
import sys
import time
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from google.genai import types  # noqa: E402
from google import genai  # noqa: E402
from pipeline import llm  # noqa: E402,F401
client = lambda: genai.Client(http_options={'api_version': 'v1beta'})

MODEL = "gemini-3.5-transcribe-live"


def pcm16k(path: Path) -> bytes:
    with wave.open(str(path)) as w:
        data, rate, ch = w.readframes(w.getnframes()), w.getframerate(), w.getnchannels()
    if ch == 2:
        data = audioop.tomono(data, 2, 0.5, 0.5)
    return audioop.ratecv(data, 2, 1, rate, 16000, None)[0]


async def main(wavs: list[Path]) -> None:
    silence = b"\x00\x00" * 16000  # 1 s
    audio = silence.join(pcm16k(p)[: 16000 * 2 * 8] for p in wavs) + silence * 2  # first 8 s of each
    cfg = {"input_audio_transcription": {}}
    t0 = time.time()
    async with client().aio.live.connect(model=MODEL, config=cfg) as s:
        async def send():
            for i in range(0, len(audio), 3200):  # 100 ms
                await s.send_realtime_input(audio=types.Blob(data=audio[i : i + 3200], mime_type="audio/pcm;rate=16000"))
                await asyncio.sleep(0.05)  # 2x real time
            await s.send_realtime_input(audio_stream_end=True)

        async def recv():
            n = 0
            async for msg in s.receive():
                n += 1
                if n <= 0:
                    print("RAW", str(msg.model_dump(exclude_none=True))[:300])
                sc = getattr(msg, "server_content", None)
                tr0 = getattr(sc, "input_transcription", None) if sc else None
                if False:
                    print(f"[partial] {tr0.text.strip()[:80]}")
                tr = getattr(sc, "input_transcription", None) if sc else None
                va = getattr(msg, "voice_activity", None)
                if va: print(f"[{time.time()-t0:5.1f}s] VA {va.voice_activity_type}")
                d = msg.model_dump(exclude_none=True).get("server_content", {})
                keys = [k for k in d if k != "interim_input_transcription"]
                if keys: print(f"[{time.time()-t0:5.1f}s] KEYS {keys} {str({k: d[k] for k in keys})[:160]}")
                if tr and tr.text and tr.finished:
                    print(f"[{time.time()-t0:5.1f}s] speaker={tr.speaker_label!r}: {tr.text.strip()}")
                if sc and getattr(sc, "turn_complete", False) and time.time() - t0 > len(audio) / 32000 / 2:
                    break

        sender = asyncio.create_task(send())
        try:
            await asyncio.wait_for(recv(), timeout=60)
        except asyncio.TimeoutError:
            print("recv timeout (ok if lines printed)")
        await sender
    print(f"done in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    run = Path(__file__).resolve().parents[1] / "runs" / "r_066ae675" / "boardroom"
    asyncio.run(main([run / "turn_1.wav", run / "turn_2.wav"]))
