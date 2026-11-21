# Common rules for every P0 backend worker

- Read `AGENTS.md`, `contracts/events.md`, `backend/pipeline/context.py`, `backend/pipeline/llm.py`, `backend/models.py` before writing.
- **Only create/edit the files listed in your brief.** Never edit `context.py`, `llm.py`, `models.py` or other workers' files. Do not run shell commands.
- Every stage module exposes exactly: `async def run(ctx: RunContext, emit: Emit) -> None`. It reads inputs from `ctx`, writes outputs back to `ctx`, and calls `await emit(type, stage, data)` with events **exactly** as in `contracts/events.md`.
- Gemini calls are sync: wrap with `await asyncio.to_thread(...)`. Use helpers from `pipeline.llm` (`generate_text`, `generate_json` with a JSON schema, `image_part`, `video_part`, `text_part`, `beta()`, `client()`, `MODEL_IDS`). Model IDs only via `MODEL_IDS[...]`.
- Gemini 4: only `thinking_level` (low/medium/high/xhigh); no temperature/top_p/top_k; never `minimal`.
- Files go under `ctx.run_dir`. URLs for the frontend: `ctx.artifact_url(path)`.
- Never print or log env vars or keys. On a recoverable failure, `await emit("error", stage, {"message": ..., "recoverable": True})` and continue with a sensible fallback; never crash the whole run for an optional step.
- Keep it simple and readable. No mocks in the normal path.
- Imports inside `backend/` use `from pipeline.context import ...`, `from pipeline.llm import ...` (the server runs with `backend/` as the working dir).
