# Frontend ↔ backend contract (v0, 12:10 PM)

Owner: Naman (backend). Changes are announced on the OpenCrawl board channel `shadow-market` with the word **CONTRACT**.
Backend runs on `http://localhost:8000`. Frontend reads the base URL from `NEXT_PUBLIC_API_BASE`.

## HTTP

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/runs` | multipart: `video` (webm/mp4, ≤ 30 s, webcam + mic) | `{ "run_id": "r_abc123" }` and starts the pipeline |
| `GET /api/runs/{run_id}/events` | — | `{ "events": [Event, ...] }` all events so far (used for **replay mode** and reconnects) |
| `GET /api/runs/{run_id}/artifacts/{path}` | — | files: MVP page, screenshots, persona `.webm`, TTS audio |
| `POST /api/runs/{run_id}/hotseat/{persona_id}` | — | `{ "ephemeral_token": "...", "model": "gemini-3.8-live", "system_instruction": "..." }` for a browser Live session. Never the real API key. |
| `POST /api/runs/{run_id}/votes` | `{ "choice": "buy" \| "bounce", "reason": "text, optional" }` | `{ "ok": true }` |
| `GET /api/demo-runs` | — | `{ "runs": [{ "run_id", "title" }] }` cached runs for the Wi-Fi fallback |

## WebSocket

`GET /ws/runs/{run_id}` → server sends one JSON **Event** per message. Client sends nothing.

Every event: `{ "type": string, "seq": int, "ts": ISO-8601, "stage": Stage, "data": {...} }`
`Stage` = `pitch | boardroom | build | lab | swarm | verdict | reality`

| `type` | `data` |
|---|---|
| `stage_changed` | `{ "stage": Stage }` |
| `pitch_parsed` | `{ "title", "one_liner", "target_user", "price_usd": number \| null, "features": [string], "sketch_notes": string }` |
| `boardroom_turn` | `{ "speaker": "strategist" \| "skeptic", "model": string, "text": string, "audio_url": string \| null }` |
| `spec_ready` | `{ "headline", "price_usd", "pages": [string], "risks": [string] }` |
| `build_progress` | `{ "message": string }` |
| `mvp_ready` | `{ "url": string, "screenshot_url": string, "hero_image_url": string \| null }` |
| `competitors` | `{ "items": [{ "title", "price_usd": number \| null, "image_url": string \| null, "url": string \| null }] }` |
| `persona_started` | `{ "persona_id", "name", "role", "device" }` |
| `persona_action` | `{ "persona_id", "t": seconds, "action": "click" \| "type" \| "scroll" \| "wait" \| "quit", "target": string, "thought": string }` |
| `persona_finished` | `{ "persona_id", "outcome": "converted" \| "quit", "quit_reason": string \| null, "video_url": string, "duration_s": number }` |
| `quit_markers` | `{ "persona_id", "markers": [{ "t": seconds, "kind": "confusion" \| "quit", "note": string }] }` |
| `swarm_progress` | `{ "done": int, "total": int }` |
| `swarm_result` | `{ "personas": 200, "rubrics": { "<rubric_id>": mean_probability }, "intent_mean": number }` |
| `verdict` | `{ "launch_probability": number, "confidence": number, "failure_modes": [string], "summary": string }` |
| `vote_tally` | `{ "buy": int, "bounce": int, "ai_probability": number }` |
| `error` | `{ "message": string, "recoverable": bool }` |

## Rules

- Frontend never calls Gemini directly except the hot-seat Live session with the ephemeral token.
- Unknown `type` values must be ignored, not crash the UI.
- Replay mode = load `GET /events` and play them back with their original timing. Label it "Replay" on screen.
