# Brief: 5-Sigma evaluation runner (Gemini CLI)

Read `AGENTS.md`, `PLAN.md` ("Proof it works"), `backend/pipeline/llm.py`, `backend/pipeline/swarm.py`, `backend/pipeline/competitors.py`, `backend/models.py` first.
**Create files only under `eval/`.** Do not edit anything else. Do not run shell commands.
Scripts run from repo root as `uv run --project backend python eval/<script>.py`. At the top: insert `backend/` into `sys.path`, then `from pipeline.llm import ...` (this also loads `.env`). Never print keys. Use only `MODEL_IDS[...]`.

Goal: an honest backtest of "will this crowdfunding launch succeed?" on **real Kickstarter campaigns that ended in 2026** (after model training, so no memorized outcomes), comparing three arms.

## 1. `eval/sample_dataset.py`
- Download (stream, with progress) `https://s3.amazonaws.com/weruns/forfun/Kickstarter/Kickstarter_2026-11-16T07_32_37_797Z.json.gz` to `eval/data/` if not already there. Format: gzip, one JSON object per line; the campaign is under key `data`.
- Fields used: `data.id, name, blurb, goal, currency, category.slug` (e.g. `food/farms`; top-level = part before `/`), `photo.full` (image URL), `deadline` (unix), `state`.
- Keep: `state in {"successful","failed"}`, `currency == "USD"`, deadline between 2026-01-01 and 2026-11-15, non-empty blurb and `photo.full`. Dedupe by id.
- **Never** read or store `pledged, usd_pledged, backers_count, percent_funded, staff_pick, spotlight, converted_pledged_amount` (they leak the outcome).
- Sample 150 with `random.Random(42)`, stratified by top-level category proportional to the pool (natural success rate). Split: 30 `calib`, 120 `test` (stratified by label).
- Write `eval/data/sample.jsonl` (full rows we use + `label` 1/0 + `split`) and **`eval/sample_ids.json`** (`[{"id", "split"}]` only — this one is committed). Print pool size, sample size, success rate per split.

## 2. `eval/run_eval.py` — `--arms base,single,swarm --limit N --concurrency 8`
Results are cached per arm in `eval/results/<arm>.jsonl` (one line per campaign id: `{"id","p","meta"}`); rerunning skips done ids (resume after crashes). Any per-item failure: log it, write nothing for that id, continue.
- **base**: P(success | top-level category) from the `calib` split, falling back to the overall calib rate; Laplace smoothing (+1/+2).
- **single** (the typical LLM baseline): one call to `MODEL_IDS["strategist"]` (gemini-4-neon), thinking `medium`, input = campaign image (download bytes with httpx, `image_part(bytes, mime)`) + text with name, blurb, category, goal USD. Prompt: "You are an expert venture analyst. Estimate the calibrated probability (0 to 1) that this crowdfunding campaign reaches 100% of its funding goal." `generate_json` schema `{"probability": number, "reason": string}`.
- **swarm** (our system's market stage):
  - A fixed panel of 200 general-population US online shoppers, generated **once** with `MODEL_IDS["strategist"]` (diverse ages, incomes, attitudes, ≤ 25 words each) and cached at `eval/data/panel.json`. Reuse it for every campaign.
  - Competitors: up to 3 real products from Shopify catalog search for the campaign name+blurb — copy the request format from `backend/pipeline/competitors.py` / `docs/shopify-mcp.md` (import the function from `pipeline.competitors` if it is cleanly reusable, otherwise reimplement the call in eval/).
  - One Decisions call per campaign, same 5 `noul` rubrics and per-persona geometric-mean formula as `backend/pipeline/swarm.py` (import its constants/helpers if cleanly reusable). Input: campaign image + text (name, blurb, category, goal, competitor titles/prices). Chunk into 250-question calls if 1,000 fails.
  - `p` = mean persona intent. `meta` = rubric means + mean confidence.
- Print progress (`done/total`, elapsed) and a one-line summary per arm.

## 3. `eval/report.py`
For each arm on the **test** split:
- raw metrics: Brier score, ROC-AUC (sklearn), mean predicted probability vs actual success rate, share of predictions > 0.5.
- calibrated metrics: fit logistic regression on `logit(clip(p, 0.01, 0.99))` using the **calib** split only, apply to test, recompute Brier/AUC. Do this for `single` and `swarm` equally (base is already calibrated).
- 95% bootstrap CI (1,000 resamples, seed 0) for Brier and AUC.
- Write `eval/RESULTS.md` (table + 3-sentence honest reading: who wins, by how much, CI overlap), `eval/results.json`, `eval/reliability.png` (10-bin reliability diagram, all arms, raw), `eval/scores.png` (bar chart of test Brier + AUC with CIs).
- Write `backend/calibration.json` = `{"alpha","beta"}` from the swarm arm's calibration fit (the live verdict uses it). This is the only file outside `eval/` you may write, and only as script output.
- Also list the 5 campaigns where swarm was most confidently wrong (id, name, p, label) in RESULTS.md — this feeds our "where it fails" section.
