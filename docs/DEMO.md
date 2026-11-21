# Demo runbook (judging: 3 min demo + 2 min Q&A)

## 15 minutes before our slot

1. **Network.** Join both laptops + iPad to our phone hotspot (venue Wi-Fi may block laptop-to-laptop traffic). On Laptop A: `ipconfig getifaddr en0` → call it `A_IP`. Check from Laptop B: `curl http://A_IP:8000/api/health` → `{"ok":true}`.
2. **Backend (Laptop A):** `cd backend && uv run uvicorn app:app --host 0.0.0.0 --port 8000`
3. **Frontend (Laptop A):** `cd frontend && NEXT_PUBLIC_API_BASE=http://A_IP:8000 npm run dev -- -H 0.0.0.0` → stage at `http://localhost:3000`.
4. **Laptop B mic permission (once):** Chrome → `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → add `http://A_IP:3000,http://A_IP:8000` → Enabled → Relaunch. Open `http://A_IP:3000/room/<runId>`, allow the mic. **Plug in the lapel/USB mic if we have one.** Laptop B volume up (twins speak out loud).
5. **iPad:** open `http://A_IP:3000/vote/<runId>` (display only).
6. **Start a fresh run with the judges' idea ~6–8 min before we present** (build takes ~3 min). If we don't have their idea yet, start our own pitch.
7. **Fallback ready:** the golden run id is in `backend/runs/logs/golden_run_id`; replay mode on the stage loads it if Wi-Fi or the API fails. Say "Replay" out loud when using it.

## The 3 minutes

| Time | Who / where | Say / do |
|---|---|---|
| 0:00–0:20 | Naman, Laptop A | "Every founder asks an AI 'is my idea good?' and gets a pep talk. We built a room that tests it." Show the run that started a few minutes ago: the pitch clip → pitch card. |
| 0:20–0:50 | Laptop A | Boardroom: play 1 skeptic turn out loud (Argon attacking the price with a real Shopify competitor). Then the MVP the managed agent built in a Google sandbox. |
| 0:50–1:30 | Laptop A | Usability lab: 6 personas; open one quitter's video at the red marker. **Hot-seat:** ask it "Why did you leave?" out loud — it answers in its own voice from its real clicks. |
| 1:30–1:50 | Laptop A | Verdict: analyst probability + why (lowest swarm rubric, lab quits). One line on proof: "We backtested this on 120 real 2026 Kickstarter launches — and caught our own data leak." Point at the Proof card. |
| 1:50–2:45 | **Judges**, Laptop B | "Ask us anything, out loud." A judge asks → Laptop B's twin voices a sharper challenge (~2 s) → Laptop A teleprompter shows VERIFIED / PARTIAL / PUSH BACK + a line → Naman answers using it. If no judge speaks within 5 s, Arnab asks the first question. |
| 2:45–3:00 | iPad | "Vote: would you buy it?" Tally vs the AI's number. Close: "Two Gemini 4 models with clear jobs, the Decisions API gating everything in under a second, Gemini Live in three roles, and a backtest that changed our own product." |

## If something breaks

| Problem | Do this |
|---|---|
| Build slow / stuck | Show the golden run in replay; let the live run finish in the background. |
| Laptop B mic hears nothing | Type the judge's question into the room's typed box (`POST /room/ask`) — same pipeline. |
| Live twin doesn't speak | Server fallback triggers after 4 s (Hydrogen text + TTS voice). |
| Twin hears itself and re-triggers | Echo filter drops repeats; if it loops, mute Laptop B's mic between questions. |
| Teleprompter number looks wrong | It can't show a number that isn't in the run's data (code check). Read the line, not the pill. |
| Internet down | Replay the golden run + show the eval charts in the README. |

## Q&A prep (likely judge questions)
- *"Isn't the backtest easy because of the funding goal?"* — Goal alone scores AUC 0.71; the analyst scores 0.88, so it adds a lot beyond the goal. We also balanced the data 50/50 and excluded every post-launch field.
- *"Why does your swarm lose?"* — It measures buyer appeal, not funding odds. We changed the product after seeing that: the analyst gives the number; the swarm, browser lab and boardroom give the reasons and fixes.
- *"How do you know the teleprompter isn't hallucinating?"* — Every number on it is checked by code against the run's data; failing pills are dropped. Counter at `/api/room/stats`.
- *"What did you build today?"* — Everything; see the commit history from 11:40 AM.
