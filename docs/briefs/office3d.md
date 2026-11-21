# Brief: 3D isometric office (Gemini CLI)

Read first: `AGENTS.md`, `frontend/src/lib/run-store.ts` (RunState, PersonaState, applyRunEvent, createInitialRunState), `frontend/src/lib/contracts.ts` (event data types, `Stage`, `resolveArtifactUrl`), `frontend/src/lib/api.ts` (`fetchRunEvents`), and the existing 2D `frontend/src/components/office/OfficeScene.tsx` (same props, same data — you are writing its 3D replacement).

**Create new files only:** everything under `frontend/src/components/office3d/` plus one preview page `frontend/src/app/office3d-preview/page.tsx`. Do not edit any existing file. No shell commands. Libraries already installed on this branch (exact): `three@0.187.0`, `@react-three/fiber@9.8.2`, `@react-three/drei@10.7.9`, `@types/three`. React 19, Next 15 App Router, TypeScript strict, Tailwind. **No external assets, fonts, HDRIs, textures or network loads** (venue Wi-Fi); everything is built from geometry in code. Original code only — don't copy from any existing project.

## Goal
A living **isometric 3D office diorama** (cut-away building seen from 45°, like a dollhouse) where AI characters work in rooms, driven entirely by the real run events. It must look polished: soft shadows, warm lighting, clean stylised furniture, smooth camera moves. Think "architectural visualisation / cosy office sim", not a video game and not a dashboard.


## LOOK — match `frontend/reference/office3d-look.html` (READ IT FULLY FIRST)
That file is the team's approved look: a standalone three.js r128 sketch. **Port its look to React Three Fiber** (three 0.187: use `outputColorSpace = SRGBColorSpace` instead of `outputEncoding`; set `gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: <same as reference> }}`, `shadows="soft"` / PCFSoftShadowMap). Reproduce:
- **Lighting & mood:** warm key light + cool fill exactly like the reference, soft shadows, fog, dark background, dusk skyline windows (gradient CanvasTexture), plank floor (CanvasTexture), warm walls.
- **Chibi characters:** sphere head with eyes and hair, body, hands, shoes — same proportions/colours approach as the reference. Make ONE `Chibi` component (props: colour, hair colour, position, pose: "stand" | "sit" | "talk" | "type" | "walk", status ring) and reuse it everywhere.
- **Props:** presenter with a mic under a spotlight cone + live slide screen; judges' table with laptops and nameplates; dev desks with dual monitors and pendant lamps; glass-walled usability lab; whiteboard; plants.
- **Screens use CanvasTexture** (like the reference's `tex()` helper) redrawn when their data changes — NOT `Html` — for slides, monitors, wall displays and the verdict board. For images (MVP screenshot), load with `THREE.TextureLoader` from `resolveArtifactUrl(...)` (same-origin/backend, CORS is open) and draw them into the canvas or use as a map. `Html` only for speech bubbles and name tags.
- **Camera:** use the reference's PerspectiveCamera (FOV ~30) and its camera positions for each view ("Pitch stage", "Judges", "Dev pit", "Usability lab", "Whole office") as the starting point; smooth glide between views.
- **Layout:** use the reference's floor plan as the core (stage, judges, dev pit, lab) and **extend** it with the extra areas below (boardroom, server corner, market floor, verdict wall) in the same style. Where the brief's room list and the reference differ, keep the reference's look and the brief's data mapping.
- Every hard-coded text in the reference must instead show live RunState data.

## Public API
- `frontend/src/components/office3d/Office3DScene.tsx`: `"use client"`; `export function Office3DScene(props: { runState: RunState; activeStage: Stage; isSampleData?: boolean; onOpenHotseat: (persona: PersonaState) => void })` — **exactly** the props of `OfficeScene`. Fills its parent (`w-full h-full`, min height 520px).
- `frontend/src/components/office3d/index.ts`: `export const Office3D = dynamic(() => import("./Office3DScene").then(m => m.Office3DScene), { ssr: false })` (next/dynamic) and re-export the props type.

## Scene
- **Camera:** see LOOK (perspective, reference views). Smoothly glide (useFrame lerp, ~0.8 s) to the area for `activeStage`; "Whole office" shows everything. Light mouse orbit limited to ±15°, no pan.
- **Stage → room:** pitch→Pitch Studio; boardroom→Boardroom; build→Server Room; lab→Usability Lab; swarm→Market Floor; verdict→Verdict Room; room and reality→Judges' Room; anything else→Overview.
- **Building:** 7 rooms on a floor plan (two rows + corridor). Each room: floor slab (distinct soft colour per room), low back walls (cut-away, ~2.4 high) with a glass partition front (transparent, opacity ~0.2), a room name sign (drei `Text` is NOT allowed if it fetches a font — use `Html` labels instead), plants (cylinder pot + sphere/cone foliage), lamps.
- **Lighting:** `hemisphereLight` + one `directionalLight` with shadows (mapSize 2048, tight shadow camera), drei `ContactShadows` under the building, drei `Environment` built only from `Lightformer`s (no files). Background: subtle vertical gradient via CSS on the wrapper. `dpr={[1, 1.5]}`, `shadows`.
- **Characters** (one reusable component): capsule body + sphere head + two small arm boxes, colour by role; idle bob; **walk** by lerping position toward a target (face the direction of travel); **typing** animation (arms oscillate) while working; **status ring** (flat torus on the floor): amber = working/running, green = converted/approved, red = quit, blue = speaking. Small name tag via drei `Html` (distanceFactor, pointer-events none).
- **Speech bubbles:** drei `Html` above a character, max ~90 chars, fade after ~6 s.

## Rooms and the data they show (all from RunState)
1. **Pitch Studio:** founder character at a podium; wall screen (Html, transform) with `pitch.title`, `one_liner`, `price_usd`.
2. **Boardroom:** table with Strategist (left) and Skeptic (right). Latest `boardroomTurns` item → that speaker gets a bubble with its text and a blue ring. When `spec` exists, a wall card shows `spec.headline` + price.
3. **Server Room:** 4 racks with blinking emissive LEDs while building (`buildMessages.length > 0 && !mvp`); a wall screen shows the last build message, then the MVP screenshot (`<img src={resolveArtifactUrl(mvp.screenshot_url)}>`) once `mvp` exists.
4. **Usability Lab:** 6 desks with monitors, one per `personaOrder` entry (up to 6). Each monitor shows the MVP screenshot thumbnail and the persona name. Status: running → seated and typing; **quit → stands up and walks to the room door**, desk lamp turns red; converted → desk lamp green. Clicking a desk/character opens an overlay panel (normal DOM, outside the canvas) with the persona's video (`<video src={resolveArtifactUrl(video_url)} controls autoPlay>`), `quit_reason`, markers, and an **"Interview them"** button → `onOpenHotseat(persona)` (only if quit).
5. **Market Floor:** 200 small figures as ONE `instancedMesh` on a grid. Before `swarmResult`: grey; `swarmProgress` lights them up proportionally. After `swarmResult`: colour `round(intent_mean*200)` of them green ("expected buyers") and the rest grey; wall card lists the 5 rubric means as small bars, lowest one highlighted. Label it "expected buyers (mean intent)" — don't imply per-person data.
6. **Verdict Room:** large wall display: `verdict.launch_probability` as a big %, `verdict.summary`, first 3 `failure_modes`; if `analyst_framing` exists show it small ("assumed: …").
7. **Judges' Room:** table with 3 judge-twin seats; latest `twinChallenges` item → bubble at its seat; a teleprompter screen with the latest `founderBriefs` item (badge colour green/amber/red, `line`, proof pills); a caption ticker from `roomCaption`.

## Overlay (DOM, on top of the canvas)
Top-left: room tabs (click to fly there; highlights the auto-followed room; an "Auto-follow" toggle that resumes following `activeStage`). Top-right: "Replay" badge if `isSampleData`. Bottom-left: one-line live status (current stage + last event). Keep it crisp: Tailwind, small, translucent dark panels.

## Performance & safety
No `<video>` inside the 3D scene (overlay only). At most ~25 `Html` elements mounted at once (only the focused room's screens use `Html transform`; other rooms show simple coloured planes). Memoise geometries/materials. Handle missing data everywhere (null checks): an empty RunState must render the empty building without errors.

## Preview page
`frontend/src/app/office3d-preview/page.tsx` (`"use client"`): reads `?run=<id>` (default `r_9828b9cf`), loads events with `fetchRunEvents`, builds state with `createInitialRunState` + `applyRunEvent`, and has a **"Play"** button that replays events in order with their original timing ×4 (so the camera tours the rooms), plus a stage `<select>` to jump. Renders `<Office3D runState=... activeStage=state.currentStage isSampleData onOpenHotseat={() => alert("hot-seat")} />` full-screen.
