# AGENTS.md — the binding contract

In effect whenever code in this repo is touched, by agent or human.
When this conflicts with intuition, this wins.

## Commands

```sh
npm run build      # build (tsc -b && vite build)
npm test           # tests (vitest)
npm run lint       # prettier --check . && tsc -b
npm run verify     # full health gate — must pass before any push
npm run format     # fix formatting
node e2e/magic.cjs <url> <video> <out-dir>   # phone-size browser run with a fake AI (needs network for the model)
```

Requires Node.js 20 or newer.

## Invariants — never regress these

1. **Every project change goes through `store.edit()`** (`src/store.ts`).
   That one call gives undo, persistence and edit-data logging. Never
   assign `state.project` anywhere else.
2. **A component is one `ComponentDef`** (`src/components/types.ts`): a
   hidden Panel plus the tools the AI calls. The Panel and the tools call
   the same op functions; only the `source` argument differs (`"user"` /
   `"ai"`). Register it in `src/components/index.ts`; the AI sees it
   automatically. See `docs/COMPONENTS.md`.
3. **All components start hidden.** Only the user (paw, Tracks, ✕, swipe
   down) or the AI (`show_components` / `hide_components`) changes `visible`.
   The newest visible component is the floating card.
4. **`src/model.ts` is pure.** Plain JSON data and math. No DOM, no
   media elements, no randomness except `uid()`.
5. **Only the engine touches media elements** (`src/engine.ts`). The UI
   seeks with `getEngine()?.seek(t)`, never by setting `store.time`.
6. **Media never leaves the device.** Files live in IndexedDB; the
   project holds only metadata. Rendering and export run in the browser.
7. **AI keys go only to the provider**, straight from the browser. No
   proxy through `/api`. Keys never appear in edit data.
8. **Edit data honors the opt-out.** Every log call goes through
   `telemetry.log()`, which checks `telemetry.enabled`.
9. **AI history never ends on an unanswered tool call.** `Agent.send()`
   rolls back the failed turn (`src/ai/agent.ts`).
10. **Masks stay out of the project.** A subject layer holds its tap point
   and effects; masks live in `src/subjects.ts` and IndexedDB `ck-masks`.
   Edit data never carries frames or masks.
11. **The model runs in the worker.** Nothing on the main thread waits on
   SlimSAM; the UI shows progress instead.

## Landmine map

| Area | Why it bites |
|---|---|
| `useEffect` bodies | `scrollIntoView()` returns a Promise in new Chromium. An arrow that returns it crashes React ("destroy is not a function"). Use a block body. |
| `AnimatePresence mode="popLayout"` | Direct children must forward refs (`forwardRef`), or Motion warns and exit animations break. |
| Audio volume | iOS ignores `el.volume`. Volume goes through the per-element `GainNode` in `Engine.route()`. |
| `createMediaElementSource` | Works once per element. The engine keeps a `gains` map; never route an element twice. |
| Claude tool use | Claude Opus 5.5 / Sonnet 5.5 reject forced `tool_choice` (`any`/`tool`). Keep `auto`. |
| Slider edits | Pass `merge = true` so a drag is one undo step and one log event. |
| `public/sw.js` | Pages are network-first, `/assets/` cache-first. Change the cache name when the caching rules change. |
| Export | Real time: it plays the timeline once into `MediaRecorder`. Safari gives MP4, Chrome gives WebM. |
| Overlays over the video | A fading overlay still takes taps. The paw scrim has no exit animation for this reason. |
| WebGPU | `navigator.gpu` can exist with no adapter. `worker.ts` asks for an adapter before choosing WebGPU. |
| Playback clock | The playing video drives `Engine.t`. Seeking a playing video to "catch up" shows black frames on slow decoders. |
| Mask timing | Effects draw only within `MAX_GAP` of a mask. Raising `FOLLOW_STEP` without raising it leaves gaps. |
| Zero-size anchors | `.radial` is 0×0; Playwright needs `state: "attached"` to wait for it. |
| `motion` transforms | Motion owns `transform` on animated elements. Center them with the `translate` property, not `transform`. |
| Production deploy | The Vercel project is git-linked, but production builds come from an explicit deployment of the release branch. See `RELEASING.md`. |

## House style

- Match the surrounding code's idiom, naming, and comment density.
- No demo scaffolding, no leftover diagnostics, no dead flags.
- Comments state constraints the code can't show — never narration.
- User-facing copy states the thing plainly; no reassurance microcopy.

## Process rules

- Branch from `main`; never commit to it directly.
- `npm run verify` green before every push. Flaky gate → fix or
  quarantine in the same PR; never route around it.
- After adding/removing/renaming source files, run the stack's
  regeneration step (`npm install` for the lockfile) and commit the result.
- Commit at boundaries; message says what changed and cites evidence.
- Docs move with behavior — same commit or PR.
- Report outcomes faithfully; failing is failing, with output.
