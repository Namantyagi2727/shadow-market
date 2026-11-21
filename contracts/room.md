# Live Q&A room — contract v2 draft (1:15 PM). Additive to `contracts/events.md`.

Owner: Naman (backend). Status: **draft until the 3 backend tests pass** (~1:45 PM); field names below are stable, build against them.

## Devices (no phones)

| Device | Route | Role |
|---|---|---|
| **Laptop A** (Naman) — main stage, runs the backend | `/` (stage) | Pipeline stages + **Founder Co-Pilot teleprompter** (`founder_brief` events). Pitch clip recorded here. |
| **Laptop B** (Arnab) — judges' table | `/room/[runId]` (new) | **Conference room**: judge seats + speech bubbles; **room mic** streamed to backend; **plays judge-twin voices out loud** (`twin_challenge.audio_url`). |
| **iPad** | `/vote/[id]` (exists) | QR vote + live tally vs AI prediction. Display only (no mic needed → no HTTPS issue). Optional: hot-seat persona replay. |

All devices talk to the backend on Laptop A over our own network (phone hotspot), `NEXT_PUBLIC_API_BASE=http://<laptop-A-LAN-IP>:8000`.
Laptop B needs mic access on an http LAN address: in Chrome on Laptop B open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<laptop-A-IP>:3000` and `http://<laptop-A-IP>:8000`, relaunch.

## New stage: `room`

## HTTP / WS

| Method & path | Body | Returns |
|---|---|---|
| `WS /ws/runs/{run_id}/room-audio` | **client → server binary frames**: raw PCM 16-bit little-endian, **16 kHz, mono**, ~100 ms per frame | nothing back on this socket; results arrive as events on the normal `/ws/runs/{run_id}` |
| `POST /api/runs/{run_id}/room/seats` | `{ "seats": [{ "seat": 1, "role": "VC partner" }, { "seat": 2, "role": "Skeptical CFO" }] }` | `{ "ok": true }` — roles for the judge twins |
| `POST /api/runs/{run_id}/room/ask` | `{ "text": "...", "seat": 1 }` | `{ "ok": true }` — **typed fallback** if the mic fails; goes through the same pipeline |

Laptop B mic capture: `getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}})` → AudioWorklet → downsample to 16 kHz Int16 → send. Mute Laptop B's mic stream while it is playing a twin's audio (prevents re-hearing itself).

## New events (on `/ws/runs/{run_id}`)

| `type` | `data` |
|---|---|
| `room_utterance` | `{ "utterance_id": string, "speaker": "founder" \| "judge" \| "unknown", "speaker_label": string, "text": string, "t": seconds_since_room_start }` — every finished sentence heard |
| `room_gate` | `{ "utterance_id", "is_challenge": number, "topic": "market" \| "price" \| "competitors" \| "tech" \| "traction" \| "other", "triggered": bool, "latency_ms": int }` — Decisions API gate result |
| `twin_challenge` | `{ "challenge_id": string, "utterance_id": string \| null, "seat": int, "role": string, "text": string, "audio_url": string \| null }` — the judge twin's sharpened challenge; **Laptop B plays `audio_url` out loud** and shows a speech bubble at `seat` |
| `founder_brief` | `{ "challenge_id", "badge": "VERIFIED" \| "PARTIAL" \| "PUSH_BACK", "badge_confidence": number, "line": string (≤ 14 words, say it verbatim), "proof": [{ "label": string, "value": string, "source": "swarm" \| "lab" \| "analyst" \| "competitors" \| "boardroom" }], "latency_ms": int }` — **Laptop A teleprompter**. Every number in `proof` is checked by code against the run data before sending. |

UI notes: teleprompter = badge (green/amber/red) + one big line + 1–2 proof pills; nothing else. Room = 2–3 seats with role labels, a bubble per `twin_challenge`, a small live caption ticker from `room_utterance`, and a gate indicator (dot that lights when `triggered`).
