# Brief: browser-lab UX-trap evaluation (Gemini CLI)

Read first: `AGENTS.md`, `backend/pipeline/lab.py` (`run_panel`, `_run_persona`), `backend/pipeline/context.py` (`RunContext`), `backend/pipeline/llm.py`, `backend/personas.json`, `eval/report.py` (style of outputs).
**Create files only under `eval/lab/`** (script + outputs). No shell commands. Never print keys. Run as: `uv run --project backend python eval/lab/run_lab_eval.py` from the repo root (insert `backend/` into `sys.path`).

## Question
Does our 3-persona browser panel (real Chromium, Hydrogen driving) find real UX problems better than the obvious baseline: **one Gemini call looking at static screenshots**?

## Pages
The 5 MVP pages our runs generated (written by the managed agent, not by us): `backend/runs/{r_066ae675,r_35bf7899,r_9828b9cf,r_c5da68f4}/mvp/index.html` and `backend/runs/spikes/mvp/index.html`. Copy each into `eval/lab/pages/<page_id>/clean/index.html`.

## Traps (injected by code, one per variant)
Inject a `<script>` before `</body>` that applies the trap at `DOMContentLoaded` (robust to any page structure). Write each variant to `eval/lab/pages/<page_id>/<trap>/index.html`.
1. `hidden_fee` — find elements whose text matches /total|order summary|confirm/i; append a small grey line "+ $14.99 handling fee (non-refundable)" to them, and when any button with text /confirm|place order|complete/i is clicked, show the same fee in the confirmation.
2. `dead_cta` — buttons/links whose text matches /buy|order|reserve|pre-?order|checkout|get it|add to cart|continue/i do nothing: capture-phase click listener calling `preventDefault()` + `stopImmediatePropagation()`.
3. `tiny_targets` — those same CTAs get `font-size:9px;padding:1px 2px;min-height:0;line-height:1` and the same colour as the background with 30% opacity.
4. `price_hidden` — every text node containing `$<digits>` is replaced with "Price shown at checkout" (keep the checkout step's numbers untouched only if they are inside a form).
5. `forced_signup` — a full-screen modal on load: "Create an account to see this product" with email + password fields and a "Sign up" button (no close button; the button just shows "Please verify your email").
Plus `clean` (no trap) as the control. → 5 pages × 6 variants = 30 variants.

## Methods (same pages, same traps)
- **panel**: serve each variant with `http.server` on a free port (thread); `lab.run_panel(ctx, emit, personas, url, out_dir)` with 3 personas from `backend/personas.json`: `persona_01` (desktop), `persona_02` (mobile), `persona_03` (tablet). `ctx = RunContext(run_id=f"labeval_{page}_{trap}", run_dir=eval/lab/runs/<page>/<trap>)`; `emit` is a no-op async function. Collect each persona's outcome, quit_reason and all action thoughts. Run **3 variants concurrently** (asyncio.Semaphore(3)).
- **baseline**: Playwright screenshots of the same variant at 1440×900 full page AND 390×844 full page (load only, no interaction) → one `generate_text(MODEL_IDS["quit_analyzer"], [image_part(desktop), image_part(mobile), text_part("List every usability, trust or checkout problem a real shopper would hit on this product page.")], thinking="medium")`.

## Grading (automatic, same grader for both methods)
For each (variant, method) and **each of the 5 trap descriptions** (even on clean pages, to measure false positives): one `beta().decisions.create(model=MODEL_IDS["decisions"], input=[text_part(<method's findings text>)], questions={"found": {"type": "noul", "instructions": "Does this text identify the following problem: <trap description in plain words>?"}})` — batch all 5 trap questions for a (variant, method) into ONE call. `found = noul >= 0.5`.
- **Recall** per method = fraction of the 25 trap variants where that variant's own trap was found. Also per trap type.
- **False-positive rate** per method = fraction of (clean page × 5 trap descriptions) = 25 checks flagged as found.
- Also report **conversion rate** of the panel on clean vs trap pages (do traps make personas quit?).

## Outputs
- Cache results per (variant, method) in `eval/lab/results/*.json` (resume-safe; skip done).
- `eval/lab/LAB_RESULTS.md`: one table (method × recall overall + per trap + FP rate + n), 3-sentence honest reading, an explicit note "traps were injected by the team into model-generated pages; grading is automatic (Decisions API, threshold 0.5)", and 3 example findings per method (short quotes).
- `eval/lab/lab_results.json`.
Print progress as it runs.
