# Shadow Market — build plan (proposal, 11:40 AM)

Track: **Problem Statement 1 (5 Sigma)** + Managed Agents prize + Shopify bonus. Deadline **5:00 PM ET**.
Feature freeze **4:15**, video recorded by **4:35**, submitted by **4:45**.

One sentence: *pitch a product idea out loud, Gemini builds the MVP, a panel of browser agents tries it and quits, you interview a quitter live, and a calibrated swarm predicts whether it launches — backtested against real launches.*

## Scope: what we build, in priority order

The blueprint has 9 phases. That is ~3 days of work. We build the demo spine first and add only if it's green.

| P | Phase | What happens | Models | Notes |
|---|---|---|---|---|
| **P0** | 1. Pitch | Record a ~20 s webcam clip (voice + sketch). | `gemini-4-hydrogen` → Pitch JSON | MediaRecorder upload, **not** a Live WebSocket. Much less risk. |
| **P0** | 2. Boardroom-lite | Neon (strategist) and Argon (hostile skeptic) trade 3 turns, output a V1 spec. Turns are spoken with TTS. | `gemini-4-neon`, `gemini-4-argon`, `gemini-3.8-flash-tts` | No 5-voice live barge-in. |
| **P0** | 3. Build | Managed agent writes a single-page landing + signup + checkout MVP (static HTML/JS). We copy the files out and serve them ourselves. | `antigravity-preview-09-2026` | Serving it ourselves means Playwright and phones can reach it. |
| **P0** | 4. Usability lab | 6 persona agents (scale to 20 if time) drive the MVP in headless Chromium. Model picks from a fixed action list (click/type/scroll/quit + think-aloud). Video `.webm` + action log per persona. | `gemini-4-hydrogen` drives; `gemini-4-neon` generates personas | Allow-listed actions only, no shell. |
| **P0** | 5. Quit analysis | Hydrogen watches each recording and marks confusion/quit timestamps. | `gemini-4-hydrogen` (agentic video) | |
| **P0** | 6. Market swarm | 200 buyer personas × 5 rubrics over MVP screenshot + hero image + competitor prices = 1,000 checks. | `gemini-decision-1` | Fast and cheap; the "calibrated" part of the story. |
| **P0** | 8. Verdict | Launch-survival probability + failure modes. | `gemini-4-carbon` | |
| **P1** | 5b. Hot-seat | Click a quitter, talk to it by voice, grounded in its action log. | `gemini-3.8-live` | Big demo moment. Spike early. |
| **P1** | 9. Reality check | QR → phone vote page; live tally next to the AI prediction. | — | Needs a public URL (deploy — ask Naman first). |
| **P1** | Competitors | Real competing products/prices from Shopify. | shop.dev MCP / Catalog | Bonus prize. |
| **P1** | Hero image | Product hero image. | `gemini-nano-banana-2.1` | |
| **P2** | 15 s video ad | | `gemini-omni-1.2-flash` | Only if everything above works. |
| **P2** | 7. V2 iterate + held-out panel | Patch the MVP and re-test on unseen personas. | `gemini-4-neon` | |
| Cut | Social contagion feed, 5-agent live barge-in | | | |

## Proof it works (25% of the score)

**Results so far (eval/RESULTS.md, 120 held-out 2026 Kickstarter campaigns, 50/50 balanced):** single Neon analyst AUC 0.88 / Brier 0.146; buyer swarm AUC 0.70 / Brier 0.232 (calibrated); goal-only 0.71; base rate 0.57; analyst+swarm 0.88 (swarm adds nothing for *funding* prediction). First run leaked outcomes through campaign photos ("FUNDED IN 14 HOURS!" banners, single-model AUC 0.96) — caught from the model's own reasons, images removed (eval/RESULTS_leaky_with_images.md). **Decision (1:00 PM): the verdict number comes from the analyst; swarm, browser lab and boardroom explain why and what to fix.** Do not claim single models are "85% sycophantic" — on this data Neon averaged 0.49 vs 0.50 actual.


Rule to respect: *evaluations made up entirely of examples the team wrote are not allowed.*

1. **Main eval: historical backtest on real Kickstarter launches.**
   - **Data:** Web Robots monthly crawl, latest file `Kickstarter_2026-11-16…json.gz` (https://webrobots.io/kickstarter-datasets/). Use **campaigns whose deadline is in 2026**, so the models can't have memorized the outcome. Do *not* use the old 2021–22 Hugging Face mirror (memorization risk, no license on the card).
   - **Rights:** Web Robots offers the crawls for research use; there's no formal license. So: don't commit the dataset or images; commit only a list of campaign IDs + the download/sample script, and credit Web Robots in the README.
   - **Sample:** `state ∈ {successful, failed}`, `currency == USD`, ~150 campaigns, stratified by category, natural success rate. Split 30 calibration / 120 test, fixed seed.
   - **Inputs (all arms):** `name`, `blurb`, `category`, `goal`, hero image `photo.full`. **Never** `pledged`, `backers_count`, `staff_pick`, `spotlight` (leak the answer).
   - **Arms:** (a) category base rate from the calibration split; (b) one `gemini-4-neon` call returning a probability; (c) our swarm: Shopify competitors for the blurb + 200 personas × 5 Decisions rubrics → aggregated probability. Arm (c) does **not** build an MVP or run browsers per campaign (150 full runs won't fit the day); the README says so.
   - **Fairness:** fit the same 2-parameter logistic calibration on the 30-campaign split for **both** (b) and (c), and report raw and calibrated numbers for each.
   - **Report:** Brier, ROC-AUC, reliability diagram (10 bins), mean predicted vs actual success rate (shows sycophancy), and a small ablation (no competitors / fewer personas) if time allows.
   - **Decisions API schema:** use the guide's question types (`noul` for yes/no, `choice`, `score`), not "boolean". Pack 200 personas × 5 questions into one 1,000-question call per campaign.
   - **Aggregation:** per persona, weighted geometric mean of the 5 probabilities (weights .15/.20/.25/.20/.20); average over personas; then the calibration above.
2. **UX-friction detection:** our browser panel vs a single model looking at static screenshots, on a mix of real public pages and a few seeded-trap pages. Report recall.
3. **Failure frontier:** a short list of where it breaks, with examples, and what we changed after seeing it.

`eval/` writes JSON + PNG charts that the README and the stage UI both show.

## Stack

- `frontend/` — Next.js (App Router, Tailwind). Stage UI + `/vote/[id]` phone page.
- `backend/` — Python 3.12, FastAPI + WebSocket, `google-genai`, Playwright. Managed with `uv`.
- `eval/` — Python scripts, same env as backend.
- `contracts/events.md` — the WebSocket event schema. The **only** shared interface between frontend and backend.
- Model IDs live in one place: `backend/models.py` (verified with models.list at 11:30).

## Who owns what

| Area | Owner | Branch |
|---|---|---|
| `frontend/` | **Arnab** (with Antigravity) | `arnab-frontend` |
| `backend/`, `contracts/events.md` | **Naman** (with Antigravity) | `naman-backend` |
| `eval/` | **Naman**; Claude Code writes/reviews the runner and checks the numbers | `naman-eval` |
| `docs/` | Naman + Claude Code (`docs/shopify-mcp.md` has the verified Shopify call) | `naman-*` |
| `README.md`, `.gitignore`, `.env.example`, `AGENTS.md`, merges to `main` | Naman + Claude Code | `naman-*` |

Naman's branches: `naman-*`. Arnab's: `arnab-*`. Merge to `main` only after `git pull origin main`, with Naman's OK.

## Schedule

| Time | Builder 1 (frontend) | Builder 2 (backend + eval) |
|---|---|---|
| 11:45–12:15 | **Spikes:** Live API voice in browser; webcam clip upload | **Spikes:** managed agent returns MVP files; Decisions API call; one Playwright persona records a video |
| 12:15–1:45 | Stage UI: pitch → boardroom → build progress | Pipeline P0: pitch → boardroom → build → 6 personas → quit analysis |
| 1:45–3:00 | Replay theater + hot-seat + verdict card | Swarm (Decisions) + verdict; eval dataset + runner |
| 3:00–3:30 | QR vote page (P1) | Run eval, charts; P1 items |
| 3:30–4:15 | **Merge, two full rehearsals, cached-replay fallback for bad Wi-Fi** | |
| 4:15–4:45 | Record 1-min video, README, submit | |

## Open questions

- None blocking. Personas JSON from the idea generator goes in `backend/personas.json`.
