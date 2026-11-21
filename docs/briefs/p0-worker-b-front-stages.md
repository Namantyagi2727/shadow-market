# Worker B: pitch, boardroom, competitors, build

Files you own: `backend/pipeline/pitch.py`, `backend/pipeline/boardroom.py`, `backend/pipeline/competitors.py`, `backend/pipeline/build.py`.

## `pitch.py` (stage `pitch`)
If `ctx.pitch_video`: `video_part(ctx.pitch_video)` (NOT agentic, it's slow) + instructions; else use `ctx.pitch["raw_text"]`. Model `MODEL_IDS["pitch_extract"]`, thinking `low`, `generate_json` with a schema producing exactly `pitch_parsed.data` from the contract (`title, one_liner, target_user, price_usd|null, features[], sketch_notes`). `sketch_notes` describes any sketch/prototype held to the camera ("" if none). Store in `ctx.pitch`, emit `pitch_parsed`.

## `boardroom.py` (stage `boardroom`)
4 turns: strategist (`MODEL_IDS["strategist"]`, Neon, thinking `medium`) proposes a V1 product/pricing/landing-page plan → skeptic (`MODEL_IDS["skeptic"]`, Argon, thinking `medium`) attacks it hard and concretely (price, trust, competitors, UX) → strategist revises → skeptic gives final objections. Each turn ≤ 90 words, spoken style. After each turn: best-effort TTS to `boardroom/turn_<n>.wav` using `MODEL_IDS["tts"]` through `client().models.generate_content(model=..., contents=text, config=types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=<"Kore" for strategist, "Fenrir" for skeptic>)))))`; the response audio is 24 kHz 16-bit mono PCM in `candidates[0].content.parts[0].inline_data.data` — wrap it in a WAV header with the `wave` module. If TTS fails, `audio_url=None` (don't emit error). Emit `boardroom_turn` per turn; append to `ctx.boardroom`. Then the strategist outputs `spec_ready` JSON (`headline, price_usd, pages[], risks[]`) via `generate_json`; store in `ctx.spec`.

## `competitors.py` (stage `boardroom`)
Follow `docs/shopify-mcp.md` exactly (httpx, stateless MCP 2026-07-28 headers + `_meta`). Query = `ctx.pitch["one_liner"]` (fallback title). Limit 5, keep the first 3 with a title. Map to `{title, price_usd, image_url, url}`; price: look for `price_range`/`priceRange`/`price` fields — if values look like minor units (integers in cents) divide by 100; `None` if not found. Print the raw first product keys once to stdout so we can fix mapping. Timeout 20 s; on any failure emit recoverable `error` and set `ctx.competitors=[]`. Emit `competitors`.

## `build.py` (stage `build`)
Goal: a single self-contained `ctx.run_dir/mvp/index.html` (inline CSS/JS, no external assets, mobile-friendly) implementing `ctx.spec` for `ctx.pitch`: hero, price, signup form, 2-step fake checkout ending in a visible "Order confirmed" message, plus honest details (shipping, returns, contact).
- Primary: managed agent, same pattern as `backend/spikes/spike_build.py` (read it): `beta().interactions.create(agent=MODEL_IDS["builder_agent"], environment="remote", agent_config={"type":"antigravity","model":"gemini-4-hydrogen","max_total_tokens":100000}, input=...)`, ask it to print the final file between `<<<HTML` and `HTML>>>`.
- While it runs (it takes ~2 min) emit `build_progress` every 10 s ("Managed agent building in Google sandbox… 40s").
- Timeout 240 s or failure/no markers → fallback: `generate_text(MODEL_IDS["persona_driver"], ..., thinking="low")` (Hydrogen) to write the same HTML; emit `build_progress` saying it fell back.
- Set `ctx.mvp_dir`, `ctx.mvp_url = os.environ.get("PUBLIC_BASE_URL","http://localhost:8000") + ctx.artifact_url(index)`.
- Screenshot with async Playwright (viewport 1280×800, full_page) to `mvp/screenshot.png`; set `ctx.screenshot_path`.
- Emit `mvp_ready` with `url`, `screenshot_url`, `hero_image_url: None`.
