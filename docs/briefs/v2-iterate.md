# Brief: V2 fix-and-prove loop (Gemini CLI)

Read first: `AGENTS.md`, `docs/briefs/p0-common.md`, **`contracts/v2.md` (implement exactly)**, `backend/pipeline/context.py`, `llm.py`, `build.py` (`_run_managed_agent`, `AGENT_SESSIONS`, HTML marker extraction, screenshot code), `lab.py` (`run_panel`), `swarm.py` (Decisions call helpers, rubric constants, per-persona intent formula), `verdict.py`, `orchestrator.py`, `app.py`.

**Files you may edit:** create `backend/pipeline/iterate.py`; in `backend/app.py` only **add** the `POST /api/runs/{run_id}/iterate` route; in `backend/pipeline/orchestrator.py` only **add** a final step after verdict that runs `iterate.run` when env `ENABLE_V2` is not `"0"` (wrapped like other recoverable stages, with `stage_changed` `"iterate"`). Nothing else. No shell commands. Never print keys.

## `iterate.py`: `async def run(ctx: RunContext, emit: Emit) -> None`
Works both right after a live pipeline and for a run loaded from disk (`app._hydrate_context` fills ctx; if anything you need is missing from ctx, rebuild it from `events.jsonl` in `ctx.run_dir`, and use `ctx.run_dir/"mvp"/"index.html"` + `screenshot.png` for V1).

1. **Plan** — `generate_json(MODEL_IDS["verdict"], ..., thinking="medium")` (Carbon) → `{"fixes":[{"issue","change","evidence"}]}` max 3, from the verdict failure modes, lab quit reasons + quit markers, and the 2 lowest swarm rubrics. Include the **honesty rule** verbatim in the prompt: "Never invent facts: no fake reviews, testimonials, ratings, addresses, certifications, press logos or photos. If a real detail is unknown (founder name, address, materials), add a clearly marked placeholder in square brackets." Emit `v2_plan`.
2. **Patch** — prompt: apply exactly these fixes to the V1 `index.html`, keep everything else, keep it a single self-contained file, keep the 2-step fake checkout ending in "Order confirmed", print the final file between `<<<HTML` and `HTML>>>`.
   - If `build.AGENT_SESSIONS.get(str(ctx.run_dir))` has ids: `beta().interactions.create(agent=MODEL_IDS["builder_agent"], previous_interaction_id=<interaction_id>, environment=<environment_id>, agent_config={"type":"antigravity","model":MODEL_IDS["persona_driver"],"max_total_tokens":100000}, input=<prompt>)` → `reused_sandbox=True`. If that raises, fall through.
   - Else: same call with `environment="remote"` and the V1 HTML inside the prompt → `reused_sandbox=False`.
   - Emit `v2_build_progress` every 10 s while waiting; timeout 240 s → fallback `generate_text(MODEL_IDS["persona_driver"], ..., thinking="low")` with the V1 HTML. Reuse build.py's marker extraction/validation helpers if importable.
   - Save to `ctx.run_dir/"v2"/"index.html"`, screenshot with async Playwright (1280×800 full page) → `v2/screenshot.png`. URL = `os.environ.get("PUBLIC_BASE_URL","http://localhost:8000") + ctx.artifact_url(index)`. Emit `v2_ready` (`url` and `screenshot_url` relative via `artifact_url`, `v1_screenshot_url` = V1 screenshot artifact url).
3. **Prove (concurrently)**:
   - Held-out A/B: load `backend/personas_holdout.json`; `await asyncio.gather(lab.run_panel(ctx, emit_v1, holdout, v1_url, run_dir/"v2"/"lab_v1"), lab.run_panel(ctx, emit_v2, holdout, v2_url, run_dir/"v2"/"lab_v2"))` where `emit_v1/emit_v2` are wrapper emitters that **drop** `persona_started`/`persona_action` and turn `persona_finished` into `v2_panel_finished` with `version` and the persona `name`; pass `error` through with stage `"iterate"`. Never emit plain `persona_*` events from this stage (the lab panel UI would mix them up).
   - Swarm re-score: same rubrics + aggregation as `swarm.py`, same persona summaries as V1 (from `ctx.swarm["per_persona"]` or `run_dir/swarm.json`), one Decisions call (chunk if needed) with the V2 screenshot + the same evaluation text as V1. `rubrics_v1` = V1's rubric means from the `swarm_result` event.
4. **Result** — `summary` (≤ 40 words, plain, honest; if V2 didn't improve, say so) from the numbers, written by code or a short `generate_text` with Hydrogen low. Emit `v2_result`; save `v2/result.json`.

Model keys: `MODEL_IDS["verdict"]`, `["builder_agent"]`, `["persona_driver"]`, `["decisions"]`.
