# Worker A: server, orchestrator, hot-seat

Files you own: `backend/app.py`, `backend/pipeline/orchestrator.py`, `backend/pipeline/hotseat.py`.

## `backend/pipeline/orchestrator.py`
`async def run_pipeline(ctx: RunContext, log: EventLog) -> None`. Stage order, emitting `stage_changed` before each stage:
1. `pitch.run`
2. `boardroom.run` and `competitors.run` **concurrently** (`asyncio.gather`), both under stage `boardroom`
3. `build.run`
4. `lab.run`
5. `quit_analysis.run` (stage `lab`)
6. `swarm.run`
7. `verdict.run`
Import stage modules as `from pipeline import pitch, boardroom, competitors, build, lab, quit_analysis, swarm, verdict`. Wrap each stage: on exception emit `error` (recoverable False for pitch/build, True otherwise) and stop only if pitch or build failed. Log elapsed seconds per stage to stdout.

## `backend/pipeline/hotseat.py`
`def create_hotseat_session(ctx: RunContext, persona_id: str) -> dict` returns `{"ephemeral_token", "model", "system_instruction"}`.
- `system_instruction`: speak as this persona, in first person, about the visit just made; ground every answer in the persona JSON (from `backend/personas.json`) and its recorded actions/thoughts/quit reason from `ctx.lab_results` and `ctx.quit_markers`; short spoken answers; admit uncertainty; never invent clicks that are not in the log.
- Token: `client().auth_tokens.create(config=types.CreateAuthTokenConfig(uses=1, expire_time=<now+30min ISO>, new_session_expire_time=<now+2min>, live_constrained_parameters=types.LiveEphemeralParameters(model=MODEL_IDS["live_voice"], config=types.LiveConnectConfig(response_modalities=["AUDIO"], system_instruction=<text>))))`. The token's `.name` is the ephemeral token. If the SDK needs `http_options={"api_version":"v1alpha"}` for tokens, create a separate client for that. Never return the real API key.

## `backend/app.py`
FastAPI app, run with `uv run uvicorn app:app --port 8000` from `backend/`. CORS allow all origins (hackathon).
- In-memory registry `RUNS: dict[str, tuple[RunContext, EventLog, asyncio.Task | None]]`. On startup, load every `runs/r_*/events.jsonl` as a finished run (for replay).
- Routes exactly as in `contracts/events.md`:
  - `POST /api/runs` multipart `video` → save to `runs/<run_id>/pitch.webm` (use the uploaded extension), create ctx + log, start `run_pipeline` task, return `{"run_id"}`. run_id = `r_` + 8 hex chars.
  - Also accept `POST /api/runs` with form field `text` instead of video (typed pitch, for testing): store in `ctx.pitch_video=None` and `ctx.pitch = {"raw_text": text}`; the pitch stage handles it.
  - `GET /api/runs/{id}/events` → `{"events": log.events}`
  - `GET /api/runs/{id}/artifacts/{path:path}` → FileResponse; reject paths that escape the run dir.
  - `POST /api/runs/{id}/hotseat/{persona_id}` → `hotseat.create_hotseat_session`.
  - `POST /api/runs/{id}/votes` `{choice, reason}` → append to `runs/<id>/votes.json`; emit `vote_tally` with counts and `ai_probability = ctx.verdict["launch_probability"]` (or null).
  - `GET /api/demo-runs` → runs that have a `verdict` event, `title` from the `pitch_parsed` event.
  - `WS /ws/runs/{id}` → send all past events, then stream new ones from a subscriber queue until disconnect.
- Also serve the MVP so phones and Playwright can open it: the artifacts route covers `mvp/index.html`. Set `ctx.mvp_url` is done by the build stage; read base URL from env `PUBLIC_BASE_URL` default `http://localhost:8000` and pass it via `os.environ` (build stage reads it).
- `GET /api/health` → `{"ok": true}`.
