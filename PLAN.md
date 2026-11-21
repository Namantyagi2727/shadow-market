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

Rule to respect: *evaluations made up entirely of examples the team wrote are not allowed.*

1. **Main eval: historical backtest on real launches.** N ≥ 100 public product launches with known outcomes (data source TBD, must be licensed for our use). Three arms on the same inputs:
   a. base-rate heuristic, b. single `gemini-4-neon` call ("will this succeed?"), c. our swarm + verdict.
   Report ROC-AUC, Brier score, and the share of "yes" from the single-model baseline (sycophancy).
   Honest caveat in the README: the backtest covers the swarm/verdict stage, not the browser lab.
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
| `frontend/` | Builder 1 (with Antigravity) | `<name>-frontend` |
| `backend/`, `contracts/events.md` | Builder 2 (with Antigravity) | `<name>-backend` |
| `eval/` | Builder 2 writes the runner; Claude Code reviews the method and numbers | `<name>-eval` |
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

- Data source for the backtest (see the question list sent to the idea generator).
- Who is Builder 1 and Builder 2?
- Repo name.
