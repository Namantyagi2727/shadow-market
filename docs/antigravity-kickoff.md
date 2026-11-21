# Antigravity kickoff prompt

Paste everything below the line into Antigravity, after filling in the two `[...]` blanks.
Arnab uses the same prompt in his own Antigravity with his own values.

---

You are my coding agent for a one-day hackathon that ends at 5:00 PM ET (feature freeze 4:15 PM). Before doing anything, read `AGENTS.md` and `PLAN.md` in the repo root and follow `AGENTS.md` strictly. The short version:

- Secrets only in `.env` (already exists, git-ignored). Never print, log or commit a key. Load it with `python-dotenv` / `process.env`.
- Never commit to `main`. Work on branch `[BRANCH, e.g. naman-backend or arnab-frontend]`. No AI attribution in commit messages (no Co-Authored-By, no "Generated with"). I review and commit; ask me before committing.
- You own only `[FOLDER: backend/ and eval/  OR  frontend/]`. Do not edit files outside it. If you need something changed elsewhere, stop and tell me.
- Frontend and backend talk only through `contracts/events.md`. The backend side owns it; any change must be announced.
- Model IDs come only from `backend/models.py`. Never guess model names. Follow the Gemini 4 boundaries in `AGENTS.md` (thinking_level only, no temperature/top-p, v1beta client for Decisions API and Managed Agents).
- Install the official Gemini API skills/docs so you use current APIs, not old ones.

First task, before any feature code — **spikes, 30 minutes max, report results to me:**

If you own `backend/`:
1. Set up `backend/` with `uv` (Python 3.12), `google-genai>=3.2.0`, `fastapi`, `uvicorn`, `playwright`, `python-dotenv`.
2. Spike A: one `gemini-decision-1` call via the v1beta client with an image + 2 questions; print the answers.
3. Spike B: one `antigravity-preview-09-2026` managed-agent run that writes a single-page HTML landing + signup + checkout; get the files back to local disk.
4. Spike C: one Playwright headless run on that page, one persona, actions chosen by `gemini-4-hydrogen` from an allow-list, recorded to `.webm`.
5. Draft `contracts/events.md` (WebSocket events from pitch to verdict) and show it to me.

If you own `frontend/`:
1. Scaffold `frontend/` with Next.js (App Router, TypeScript, Tailwind).
2. Spike A: record a 20-second webcam + mic clip in the browser and upload it to a stub endpoint.
3. Spike B: a browser voice conversation with `gemini-3.8-live` (bidi WebSocket), using a short-lived/ephemeral token from a server route — never ship the API key to the browser.
4. Build the stage layout skeleton for: pitch → boardroom → build → usability lab → hot-seat → verdict.

After the spikes, tell me what worked, what failed, and how long each took. Then continue with PLAN.md "P0" items for your folder only.
