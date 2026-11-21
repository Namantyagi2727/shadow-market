# Demo runbook (judging: 3 min demo + 2 min Q&A)

## 15 minutes before our slot

1. **Network.** Join both laptops + iPad to our phone hotspot (venue Wi-Fi may block laptop-to-laptop traffic). On Laptop A: `ipconfig getifaddr en0` → call it `A_IP`. Check from Laptop B: `curl http://A_IP:8000/api/health` → `{"ok":true}`.
2. **Backend (Laptop A):** `cd backend && uv run uvicorn app:app --host 0.0.0.0 --port 8000`
3. **Frontend (Laptop A):** `cd frontend && NEXT_PUBLIC_API_BASE=http://A_IP:8000 npm run dev -- -H 0.0.0.0` → start page at `http://localhost:3000` (old UI at `/classic`).
   **Allowlist:** start the backend with `ALLOWED_CLIENT_IPS=<laptop B IP>,<iPad IP>` and allow `python3.12` in macOS Firewall if prompted.
4. **Laptop B mic permission (once):** Chrome → `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → add `http://A_IP:3000,http://A_IP:8000` → Enabled → Relaunch. Open `http://A_IP:3000/room/<runId>`, allow the mic. **Plug in the lapel/USB mic if we have one.** Laptop B volume up (twins speak out loud).
5. **iPad:** open `http://A_IP:3000/vote/<runId>` (display only).
6. **Warm-up:** open the golden replay once so videos/audio are cached; keep a typed pitch ready in case no judge offers one.
7. **Fallback ready:** the golden run id is in `backend/runs/logs/golden_run_id`; replay mode on the stage loads it if Wi-Fi or the API fails. Say "Replay" out loud when using it.

## The 3 minutes (Live Run screen on Laptop A; judges' room on Laptop B)

Screens: Laptop A `http://localhost:3000/` (start page) → `/live/<runId>`. Golden replay: `/live/r_9828b9cf?replay=1&speed=4`. Laptop B: `http://A_IP:3000/room/<runId>`. iPad: `/vote/<runId>`.

| Time | Who / where | Say / do |
|---|---|---|
| 0:00–0:15 | Naman → a judge | "Give us any product idea." Type it on the start page → **Run it**. It goes live on its own (6–8 min). "That's running live in Google's cloud right now — meanwhile, here's one we ran an hour ago." |
| 0:15–0:45 | Laptop A, golden run | Timeline on the left. Boardroom: play one Skeptic turn out loud (Argon vs Neon, real Shopify competitor). Build: the MVP the Antigravity managed agent built in a Google sandbox. |
| 0:45–1:20 | Laptop A, golden run | Lab grid: 6 testers, 5 quit. Click one quitter → **Interview** → ask "Why did you leave?" out loud; it answers in its own voice from its real clicks (Gemini Live). |
| 1:20–1:45 | Laptop A, golden run | Verdict: the big number + why. "Backtested on 120 real 2026 Kickstarter launches; we caught our own data leak and changed the product when our swarm lost." V2: "then it fixes the page and proves it on buyers who never saw it — honestly, 0/6 → 1/6; the rest needs real photos only the founder can take." |
| 1:45–2:40 | **Judges**, Laptop B | "Now ask us anything, out loud." Judge asks → Laptop B's twin voices a sharper challenge (~2 s) → Laptop A shows VERIFIED / PARTIAL / PUSH BACK + a line → Naman answers. If no judge speaks within 5 s, Arnab asks first. |
| 2:40–3:00 | Laptop A + iPad | Cut back to the judge's own run (whatever stage it reached — boardroom/build/lab live). iPad vote vs the AI's number. Close: "Four Gemini 4 models with clear jobs, the Decisions API gating in under a second, Gemini Live in three roles, a managed agent that builds and fixes — and a backtest that changed our own product." |

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
