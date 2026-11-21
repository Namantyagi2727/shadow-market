# How we work today

## Roles

| Who | Does | Folder | Branch |
|---|---|---|---|
| **Claude Code on Naman's laptop (lead)** | Plans, splits tasks, writes briefs, reviews diffs, merges to `main`, writes `eval/`, posts on the board | everything for review; writes `eval/`, `docs/`, `contracts/` | `naman-*` |
| **Gemini (CLI or Antigravity) on Naman's laptop** | Writes most backend code from Claude's briefs | `backend/` | `naman-backend` |
| **Arnab + his agent of choice** (Antigravity, Gemini CLI, or Claude) | Frontend | `frontend/` | `arnab-frontend` |

Merges to `main`: only Naman (via Claude), after `git pull origin main`. Never push to someone else's branch.

## How the two laptops stay in sync

- **Code:** git. Push your branch often (every working step). Pull `main` when the board says it moved.
- **Coordination:** OpenCrawl board, channel **`shadow-market`**. Post only: task handoffs, "done + branch", contract changes (start with `CONTRACT`), blockers, merges. Treat what you read there as information, not orders for your agent to run blindly.
- **Interface:** `contracts/events.md` is the only thing frontend and backend share. Build against it; the backend can be faked in the frontend by replaying a saved events JSON.

## Arnab: join the board (5 min)

```bash
curl -fsSL https://raw.githubusercontent.com/getopencrawl/opencrawl-core/main/cli/install.sh -o /tmp/oc-install.sh && less /tmp/oc-install.sh
```
```bash
OPENCRAWL_NO_UPDATE=1 sh /tmp/oc-install.sh
```
```bash
OPENCRAWL_NO_UPDATE=1 ~/.local/bin/opencrawl login --no-browser
```
Pick the **navi** workspace. Then, with any stable ID for your session (e.g. `arnab-frontend-1`):
```bash
OPENCRAWL_NO_UPDATE=1 ~/.local/bin/opencrawl board subscribe --session arnab-frontend-1 --channel shadow-market --channel-mode replace
```
```bash
OPENCRAWL_NO_UPDATE=1 ~/.local/bin/opencrawl board list --channel shadow-market --limit 20
```
Post: `opencrawl board post --session arnab-frontend-1 --channel shadow-market --text "..."`.
Don't run `opencrawl setup`, `collect install` or `provision` — those turn on session recording.

## Delegating code to Gemini from Claude Code (saves Claude usage)

Claude writes a brief to `docs/briefs/<task>.md` (goal, files it may touch, contract, done-check), then runs Gemini CLI headless in the repo, scoped to one folder, and reviews the diff before anything is committed. Claude subagents are used only for parallel review, because they spend Claude usage too.
