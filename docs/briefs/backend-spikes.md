# Brief: backend spikes (Gemini CLI)

Read `AGENTS.md` first and follow it. You may create or edit files **only under `backend/spikes/`**. Do not edit anything else. Do not run shell commands; just write the files. The environment already exists (`backend/pyproject.toml`, google-genai 3.6.1, playwright, httpx, python-dotenv installed with uv).

Every script:
- starts with `from dotenv import load_dotenv; load_dotenv()` loading the repo-root `.env` (path: `Path(__file__).resolve().parents[2] / ".env"`);
- imports model IDs from `backend/models.py` (add `sys.path` insert of `backend/`), never hard-codes model names;
- never prints environment variables or the API key;
- writes outputs under `backend/runs/spikes/` (create dirs);
- prints a short PASS/FAIL line at the end and the elapsed seconds;
- uses `client = genai.Client()` for model calls and `beta = genai.Client(http_options={"api_version": "v1beta"})` for Decisions and Managed Agents.

API shapes (from the official Gemini 4 builder guide):

```python
# model call
r = client.interactions.create(model=..., input=[...] or "text", generation_config={"thinking_level": "low"|"medium"|"high"})
r.output_text

# Decisions API
d = beta.decisions.create(model=MODEL_IDS["decisions"], input=[{"type":"image","uri":..., "mime_type":"image/png"} or {"type":"image","data": base64, "mime_type": ...}, {"type":"text","text":...}],
    questions={"q1": {"type":"noul","instructions":"..."},
               "q2": {"type":"choice","instructions":"...","criteria":{"a":"...","other":"..."}},
               "q3": {"type":"score","instructions":"...","criteria":["low","mid","high"]}})
d.answers["q1"].noul ; d.answers["q2"].choice, .confidence ; d.answers["q3"].score

# Managed agent in a Google-hosted sandbox
run = beta.interactions.create(agent=MODEL_IDS["builder_agent"], environment="remote",
    agent_config={"type":"antigravity","model":"gemini-4-hydrogen","max_total_tokens":100000}, input="...")
run.environment_id ; run.output_text
```

If an attribute name differs at runtime, the script should print `dir()` of the response object and the raw response (minus any key) so we can fix it fast.

## Files to write

1. `backend/spikes/spike_decisions.py`
   Render a tiny local HTML landing page (inline string: a product "Pocket espresso maker, $49, Buy now") to PNG with Playwright, then call Decisions with that image + text and three questions: one `noul` ("Is the price clearly visible?"), one `choice` (buy / compare / leave / other), one `score` (trust: low/medium/high). Print each answer and confidence.

2. `backend/spikes/spike_build.py`
   Ask the managed agent to write a single self-contained `index.html` (inline CSS/JS, no external assets) for a product landing page with: hero, price, a signup form, and a 2-step fake checkout (no real payment). Get the HTML back: first try reading it from `run.output_text` (ask the agent to print the final file between `<<<HTML` and `HTML>>>` markers), save to `backend/runs/spikes/mvp/index.html`. Print the environment id and file size.

3. `backend/spikes/spike_persona.py`
   Serve `backend/runs/spikes/mvp/index.html` (or a fallback inline page if missing) with `http.server` on a free port in a thread. Launch headless Chromium with `record_video_dir` set and the viewport from persona_02 in `backend/personas.json`. Loop up to 12 steps: take a screenshot + list of visible clickable elements (tag, text, a stable index), send both plus the persona JSON to `MODEL_IDS["persona_driver"]` asking for a JSON action `{"action": "click"|"type"|"scroll"|"wait"|"quit", "target_index": int|null, "text": str|null, "thought": str}` (use structured output / response schema if the SDK supports it, else parse JSON from text). Only allow those five actions; anything else counts as `wait`. Log each step with seconds since start. Stop on `quit`, on checkout success text, or after 12 steps. Close the context, save the `.webm` and `actions.json` to `backend/runs/spikes/persona/`. Print the outcome.
