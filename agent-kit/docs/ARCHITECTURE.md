# Architecture

CutKit is a single-page web app (React + TypeScript, built with Vite) that edits video in a phone browser. A chat AI drives the edits through components. One Vercel function stores edit data. The code has 8 parts.

| Part | Folder | Task |
|---|---|---|
| Model | `src/model.ts` | Project data types and timeline math (layout, split, ripple delete). Pure. |
| Store | `src/store.ts` | App state, every project edit, undo/redo, visible components, persistence. |
| Engine | `src/engine.ts`, `src/pitch.ts` | Clock, media sync, audio graph, canvas drawing, frame grabs, export. |
| Media | `src/media.ts` | File import, metadata probe, IndexedDB storage, blob URLs. |
| Components | `src/components/` | Editing units: a Panel plus AI tools each. |
| AI | `src/ai/` | Provider settings, OpenRouter sign-in, system prompt, tool loop. |
| UI shell | `src/App.tsx`, `src/ui/`, `src/styles.css` | Preview, component dock, chat, sheets. Motion animations. |
| Edit data | `src/telemetry.ts`, `api/events.ts` | Batches edit events in the browser; the function writes them to Vercel Blob. |

## Data flow

One chat request, from typed words to a changed video:

1. The user types in the chat. `Chat` calls `Agent.send()`.
2. `Agent` adds `<editor_state>` (from `store.snapshot()`) to the message and sends it with every tool in `ALL_TOOLS` to the provider.
3. The model answers with tool calls. `runTool()` finds each tool and calls its `run()`.
4. The tool calls an op that calls `store.edit(component, tool, "ai", args, fn)`. The store pushes undo history, saves to localStorage and logs an `edit` event.
5. `show_components` adds component ids to `visible`. The dock renders each `Panel` with a glow for AI-opened cards.
6. Tool results go back to the model. The loop repeats until the model stops calling tools (max 14 steps).
7. Each animation frame, `Engine.tick()` reads the project, syncs media elements and draws the frame on the canvas.
8. `telemetry` sends queued events to `/api/events` every 15 s and when the page hides.

## Engine

| File | Task |
|---|---|
| `src/engine.ts` | `Engine`: `play`, `pause`, `seek`, `tick`, `draw`, `snapshot`, `export`. Draws clips, transitions, motion graphics and text. |
| `src/pitch.ts` | AudioWorklet source for the voice pitch shifter. |

## Components

| File | Components |
|---|---|
| `media.tsx` | media |
| `timeline.tsx` | timeline |
| `videotrack.tsx` | video_track |
| `cuts.tsx` | cuts |
| `look.tsx` | transitions, color |
| `audio.tsx` | voice, pitch, music |
| `overlays.tsx` | text, motion |
| `output.tsx` | format, export |
| `index.ts` | Registry plus core tools: show/hide components, get_state, undo, view_frame |

## Boundaries

| Boundary | Rule |
|---|---|
| UI ↔ Store | Project changes go only through `store.edit()`. |
| Component ↔ AI | The AI acts only through tools. A tool and its Panel share one op function. |
| UI ↔ Engine | The UI calls `getEngine()` methods. Only the engine plays, pauses or seeks media. |
| Model ↔ everything | `model.ts` takes plain data and returns plain data. |
| Browser ↔ AI provider | Direct HTTPS with the user's key. Nothing goes through `/api`. |
| Browser ↔ `/api/events` | Edit events only: tools, arguments, project JSON, chat text. Never media, never keys. |
