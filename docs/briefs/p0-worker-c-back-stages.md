# Worker C: lab, quit analysis, swarm, verdict

Files you own: `backend/pipeline/lab.py`, `backend/pipeline/quit_analysis.py`, `backend/pipeline/swarm.py`, `backend/pipeline/verdict.py`.

## `lab.py` (stage `lab`)
Port the logic of `backend/spikes/spike_persona.py` (read it; it works) to **async Playwright**, and run **all 6 personas from `backend/personas.json` concurrently** against `ctx.mvp_url` (one browser, one context per persona with its viewport and `record_video_dir=ctx.run_dir/"lab"/<persona_id>`). Max 12 steps each, allow-listed actions only, stop on quit / "Order confirmed" visible / max steps. Emit `persona_started`, one `persona_action` per step (with `t` seconds since that persona started, `target` = element text, `thought`), then `persona_finished` (`outcome` converted if confirmation visible else quit, `quit_reason` = last thought when quitting, `video_url`, `duration_s`). Save each video as `lab/<persona_id>.webm` and actions as `lab/<persona_id>.json`. Append `{...persona_finished data, "actions": [...]}` to `ctx.lab_results`. Limit concurrent model calls with an `asyncio.Semaphore(6)`.

## `quit_analysis.py` (stage `lab`)
For each persona that quit (concurrently, each with a 75 s timeout): `video_part(video)` **not agentic** (agentic took 95 s in testing) + the persona's action log → `MODEL_IDS["quit_analyzer"]` thinking `low`, `generate_json` → `{"markers":[{"t","kind":"confusion"|"quit","note"}]}`. On timeout/failure, fall back to markers derived from the action log (the quit step → kind "quit"; any `wait` or repeated scroll → "confusion"). Store in `ctx.quit_markers[persona_id]`, emit `quit_markers`.

## `swarm.py` (stage `swarm`)
1. Generate 200 compact buyer personas with one `generate_json` call to `MODEL_IDS["strategist"]` thinking `low`: an array of 200 `{id, summary}` (summary ≤ 25 words: age, job, budget, attitude, why they would/wouldn't buy), diverse and realistic for `ctx.pitch["target_user"]` **plus** 30% outside the target. If fewer than 200 come back, take what you get (min 50).
2. One Decisions API call: `beta().decisions.create(model=MODEL_IDS["decisions"], input=[image_part(ctx.screenshot_path), text_part(<pitch + spec + competitors as text + lab summary: how many of 6 quit and why>)], questions={...})` with **5 questions per persona** (keys like `p017_value_clarity`), all type `"noul"`, instructions = "You are this buyer: <summary>. " + rubric text below. If 1,000 questions fail, split into chunks of 250 questions run concurrently. Emit `swarm_progress` after each chunk.
   Rubrics (id: question):
   - `value_clarity`: Within 3 seconds of seeing this page, do you understand what the product is, what problem it solves and who it is for?
   - `pain_urgency`: Does this solve a recurring problem you already spend time or money on, rather than a nice-to-have?
   - `price_value_fit`: Given your budget and the competing products listed, does the price feel fair?
   - `credibility_trust`: Does this feel legitimate and deliverable enough to enter your card details today?
   - `beat_competitors`: With a checkout link right now, would you buy this over the listed alternatives and over doing nothing?
   Answer value: `answers[key].noul` (probability 0..1), `.confidence`.
3. Per persona intent `I = v^.15 * p^.20 * pr^.25 * c^.20 * b^.20`; `intent_mean` = mean over personas. `rubrics` = mean probability per rubric. Set `ctx.swarm = {personas, rubrics, intent_mean, per_persona:[{id, summary, intent}]}`. Emit `swarm_result` (contract fields only; leave out `per_persona`). Save full output to `swarm.json`.

## `verdict.py` (stage `verdict`)
- `launch_probability` is computed, not asked: `sigmoid(ALPHA + BETA * logit(clamp(intent_mean, 0.01, 0.99)))` with `ALPHA, BETA` read from `backend/calibration.json` if present (`{"alpha":..,"beta":..}`), else `0.0, 1.0`.
- `confidence` = mean Decisions confidence across all answers (store it in ctx.swarm in swarm.py as `mean_confidence`).
- `MODEL_IDS["verdict"]` (Carbon) thinking `medium`, `generate_json` → `{failure_modes: [3-5 short strings], summary: ≤ 60 words}` given pitch, spec, competitors, lab results (who quit, why, markers), swarm rubric means and the computed probability. Tell it not to change the number and to be blunt.
- Store in `ctx.verdict`, emit `verdict`.
