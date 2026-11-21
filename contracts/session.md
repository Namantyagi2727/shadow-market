# Live pitch session — contract v4 (3:35 PM). Additive.

Two AI assistants listen to the same live pitch:
- **Laptop A = founder's assistant** (`/founder/[runId]`): its mic hears the founder. Shows the founder's pitch notes, the research the judges are seeing, **prepared answers** to likely questions, and a **live answer card** when a judge asks.
- **Laptop B = judge's assistant** (`/judge/[runId]`): its mic hears the judges. Shows the live transcript, background research as it lands, and **the top 3 questions to ask**, each with evidence.
No twin voices, no votes in this mode.

## HTTP / WS
| Method & path | Body | Returns |
|---|---|---|
| `POST /api/sessions` | `{}` | `{ "run_id": "s_xxxxxxxx" }` — a new session (a run with no pipeline started). |
| `WS /ws/runs/{run_id}/room-audio?role=founder\|judge` | binary PCM16 16 kHz mono frames (existing format) | events arrive on `/ws/runs/{run_id}` |
| `POST /api/runs/{run_id}/session/pitch-done` | `{}` | `{ "ok": true }` — founder button "I'm done pitching": run research now instead of waiting for the pause. |
| `POST /api/runs/{run_id}/session/ask` | `{ "text": string, "role": "founder" \| "judge" }` | `{ "ok": true }` — typed fallback for either side; same path as speech. |
| `POST /api/runs/{run_id}/session/full-run` | `{}` | `{ "ok": true }` — optional: start the full pipeline (boardroom, MVP, lab, verdict, V2) on this session's pitch; its events stream into the same run. |

## Events (stage `"room"`)
| `type` | `data` |
|---|---|
| `room_caption` | `{ "text": string, "role": "founder" \| "judge" }` (existing event + role) |
| `room_utterance` | `{ "utterance_id", "speaker": "founder" \| "judge", "speaker_label": "", "text", "t" }` — speaker = which laptop's mic heard it. Near-identical lines heard by both mics within 8 s are emitted once. |
| `pitch_update` | `{ "transcript": string, "words": int }` — the founder's pitch so far |
| `research_status` | `{ "step": "pitch" \| "competitors" \| "web" \| "analyst" \| "buyers" \| "questions" \| "prep", "state": "running" \| "done" \| "failed", "message": string }` |
| `pitch_research` | `{ "pitch": { "title", "one_liner", "target_user", "price_usd": number\|null, "location": string\|null, "claims": [string] }, "competitors": [{ "title", "price_usd", "url" }], "web": [{ "fact": string, "url": string\|null }], "analyst": { "probability": number, "reason": string, "framing": string }, "buyers": { "n": 200, "rubrics": { "<rubric>": number }, "intent_mean": number, "weakest": string }, "latency_ms": int }` — may be emitted more than once as parts finish (later ones are complete) |
| `judge_questions` | `{ "questions": [{ "id": "q1", "question": string, "why": string, "evidence": string, "source": "competitors" \| "web" \| "buyers" \| "analyst" \| "pitch" }] }` (exactly 3) |
| `founder_prep` | `{ "answers": [{ "question_id": "q1", "question": string, "line": string (≤ 22 words, speakable), "points": [string] (2), "evidence": string }] }` |
| `room_gate` | existing (judge utterances only) |
| `founder_brief` | existing fields + `"matched_question_id": string \| null` (when the judge's real question matches a prepared one) — the live answer card on Laptop A |
