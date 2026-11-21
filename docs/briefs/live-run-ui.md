# Brief: "Live Run" UI — minimal, Google/Gemini-grade (Gemini CLI)

Read first: `AGENTS.md`, `contracts/events.md`, `contracts/room.md`, `contracts/v2.md`, `frontend/src/lib/run-store.ts`, `frontend/src/lib/contracts.ts`, `frontend/src/lib/api.ts` (`fetchRunEvents`, `connectRunStream`, `resolveArtifactUrl`), `frontend/src/components/HotseatModal.tsx` (reuse it as-is), `frontend/src/app/page.tsx` (how the current stage page wires live data).

**Create new files only:** `frontend/src/app/live/[runId]/page.tsx` and everything under `frontend/src/components/live/`. Do not edit existing files (you may import from them). No shell commands. No new npm packages. Fonts via `next/font/google` (Inter, JetBrains Mono) loaded inside your page/layout component.

## Design language (this is the whole point — be disciplined)
Think Google Antigravity's agent view / Gemini Deep Research / AI Studio. Calm, restrained, premium. **No cartoons, no emoji, no characters, no 3D, no glassmorphism overload, no rainbow colours, no chart grid.**
- **Canvas:** `#0E0F11` page, surfaces `#16171A` and `#1C1D21`, 1px borders `#2A2B30`, radius 16 (cards) / 10 (controls).
- **Text:** primary `#E8EAED`, secondary `#9AA0A6`, tertiary `#5F6368`. Inter: 13/14 body, 12 labels (uppercase tracking 0.08em for section labels only), 28–40 for key numbers, hero number 96–120 thin (weight 300). JetBrains Mono 12 for logs/ids.
- **Accent:** ONE Gemini gradient `linear-gradient(90deg,#4285F4 0%,#9B72CB 50%,#D96570 100%)`, used ONLY for: the active-step shimmer, the thinking state, thin progress lines, and the twin's challenge underline. Status colours (muted): success `#81C995`, warning `#FDD663`, danger `#F28B82`.
- **Space:** generous (24–32px padding, 8px grid). Max 2 font weights per view.
- **Motion:** only opacity/translate fades (200–300ms ease-out), the gradient shimmer (`background-size:200%` sweep, 1.6s) on whatever is in progress, and a soft pulse dot for "live". Respect `prefers-reduced-motion`.
- Icons: `lucide-react` (already installed), 16px, stroke 1.5, secondary colour.

## Layout: `/live/[runId]`
Full viewport, no page scroll. Top bar (56px): product name "Shadow Market" (Inter 15 medium), run title from `pitch.title` in secondary, a "LIVE" pulse dot or "REPLAY" tag, and elapsed time. Below: **left rail 340px** = agent timeline; **right** = artifact canvas.

### Left rail — agent timeline (Deep-Research style)
One row per stage: Pitch · Boardroom · Build · Usability lab · Market · Verdict · Fix & prove (V2) · Q&A room. Each row: 16px icon, stage name, one-line live status, right-aligned time. States: pending (tertiary text), active (gradient shimmer line under the row + secondary status text updating from the latest event), done (check icon + **one key fact**, e.g. "4 turns · Neon vs Argon", "MVP built in Google sandbox · 2m 58s", "6 testers · 5 quit", "1,000 answers · 2.8 s", "28% launch probability", "Held-out 0/6 → 1/6"). Clicking a row pins the canvas to that stage; an "Auto" toggle at the top follows the live stage. Below the steps, a tiny muted model legend: which Gemini model did what (Hydrogen, Neon, Argon, Carbon, Decision-1, Antigravity agent, Live).

### Right — artifact canvas (one big view per stage, crossfade between them)
- **Pitch:** large card: `pitch.title` (32), `one_liner`, target user, price, features as quiet chips, sketch notes. If a pitch video artifact exists, show it in a 16:9 rounded frame.
- **Boardroom:** two speaker columns with **minimal avatars = initials in a circle** (S / K) and the model name under it. The active turn: its text large (20, line-height 1.5) with a live audio **waveform** (draw bars from the actual `<audio>` via Web Audio AnalyserNode; fall back to an animated bar row if blocked) and a play button for `audio_url`. Previous turns as small muted lines. When `spec` arrives: a clean spec card (headline, price, risks).
- **Build:** a browser-frame mockup (three dots + URL bar showing the MVP url) containing the **live MVP in an `<iframe>`** (`resolveArtifactUrl(mvp.url)`); before it exists, a monospace log strip of `buildMessages` with the shimmer. Caption: "Built by the Antigravity managed agent in a Google-hosted sandbox".
- **Usability lab:** a **Meet-style 3×2 video grid**, one tile per persona: the recording (`<video muted autoplay loop playsinline>` from `video_url`; poster = MVP screenshot), name + role + device in a bottom gradient bar, a status pill (Working / Bought / Quit). Quit tiles desaturate (`filter: grayscale(1) brightness(.7)`) and show the quit reason in 2 lines plus marker timestamps as small chips; each quit tile has an **"Interview"** button → opens the existing `HotseatModal` for that persona. Clicking a tile enlarges it (unmuted).
- **Market:** one sentence in large type: "200 buyers · 1,000 calibrated answers · 2.8 s" (use real numbers), then the 5 rubrics as **thin horizontal bars** (4px, track `#2A2B30`, fill `#E8EAED`, lowest one in danger colour and labelled "weakest"). Competitors from Shopify as 3 quiet rows (title, price). Nothing else.
- **Verdict:** hero number `launch_probability` as % (thin 110px), label "Launch probability", a one-sentence reason (`analyst_reason` truncated to ~30 words), `analyst_framing` in tertiary 12px ("Assumed: …"), then `failure_modes` as 3 numbered lines. Small link "How we know →" opens a side sheet with the backtest summary: "Backtested on 120 real 2026 Kickstarter launches · analyst AUC 0.88 vs single-model leak-free baseline · we caught and removed an image leak" — text only, no images.
- **Fix & prove (V2):** read `v2_*` events from the raw event list (run-store ignores them): V1 vs V2 screenshots side by side with a draggable split slider; the ≤3 fixes as lines; `founder_todo` as a checklist titled "Only the founder can fix"; result row "Held-out buyers  0/6 → 1/6" and per-rubric before→after deltas (green up / red down); the `summary` sentence. Honest wording if it didn't improve.
- **Q&A room:** latest `twinChallenges` text large with the gradient underline appearing word by word, and the latest `founderBriefs` as the founder card: badge pill (VERIFIED green / PARTIAL amber / PUSH BACK red) + the `line` (24px) + proof pills. Live caption ticker (`roomCaption`) at the bottom in tertiary.

## Data
- Keep the raw events array AND the RunState (`createInitialRunState` + `applyRunEvent`). Derive V2 state from raw events in `components/live/useV2.ts`.
- **Live mode** (default): fetch existing events, then `connectRunStream` for new ones (see how `app/page.tsx` does it).
- **Replay mode** (`?replay=1&speed=4`): load all events and replay them in order with their original timing ÷ speed (speed 1/2/4/8 selectable in the top bar; Restart button). This is our Wi-Fi fallback and the 1-minute video source.
- Everything must handle missing data gracefully (render the empty state with tertiary "Waiting for …" text).

## Quality bar
Pixel-tidy alignment, consistent spacing, no overflow at 1440×900 and 1920×1080, no horizontal scroll, no layout shift when events stream in. TypeScript strict, no `any` where a contract type exists. At the end, list files created.
