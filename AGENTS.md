# Rules for every coding agent in this repo (Antigravity, Claude Code, others)

Project plan: `PLAN.md`. Read it first. Deadline 5:00 PM ET; feature freeze 4:15 PM.

## Hard rules

1. **Secrets live only in `.env`** (git-ignored). Never print, log, echo or commit a key. Never hard-code one. Read keys with `os.environ` / `process.env`. If you add a new variable, add its name (no value) to `.env.example`.
2. **Commits are authored by the human only.** No `Co-Authored-By`, no "Generated with …", no AI attribution in commit messages or PR descriptions. A local hook rejects them.
3. **Branches:** never commit to `main`. Work on your owner's branch (`naman-*` or `arnab-*`). Never push to the other person's branches. Merges to `main` are done by Naman.
4. **File ownership:** only edit the folders your owner owns (see PLAN.md "Who owns what"). If you need a change elsewhere, stop and tell your human.
5. **Contract:** frontend and backend talk only through the WebSocket/HTTP events in `contracts/events.md`. Backend owner changes it; announce every change to the other builder.
6. **Model IDs** come only from `backend/models.py` (verified against models.list). Never invent or guess model names.
7. **Gemini 4 API boundaries** (from the official builder guide):
   - no custom temperature / top-p / top-k / thinking-budget fields on Gemini 4 models; use `thinking_level`
   - no `minimal` thinking level on Neon or Hydrogen
   - no manual context caching on Gemini 4
   - use native tools, structured output, or Decisions API questions instead of asking a model to write raw JSON tool calls
   - Managed Agents and Decisions API use the `v1beta` client
8. **Browser agents** may only use an allow-listed action set (click, type, scroll, wait, quit, think-aloud). No shell access driven by model output on the laptop.
9. **No mocks in the demo path.** A cached-replay mode is allowed only as an explicit, labeled fallback toggle.
10. **Evaluation honesty:** eval data must not be only examples we wrote. Report baselines and failures truthfully.
11. Don't add dependencies with unclear licenses, and don't use data or assets we don't have rights to.

## Done means

It runs end to end on an input you did not prepare, and you say what you tested.
