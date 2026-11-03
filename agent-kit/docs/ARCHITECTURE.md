# Architecture

CutKit is a single-page web app (React + TypeScript, built with Vite) that edits video in a phone browser. A chat AI drives the edits through components. One Vercel function stores edit data. The code has 10 parts.

| Part | Folder | Task |
|---|---|---|
| Model | `src/model.ts` | Project data types and timeline math (layout, split, ripple delete). Pure. |
| Store | `src/store.ts` | App state, every project edit, undo/redo, visible components, persistence. |
| Engine | `src/engine.ts`, `src/pitch.ts` | Clock, media sync, audio graph, canvas drawing, frame grabs, export. |
| Media | `src/media.ts` | File import, metadata probe, IndexedDB storage, blob URLs. |
| Components | `src/components/` | Editing units: a Panel plus AI tools each. |
| AI | `src/ai/` | Provider settings, OpenRouter sign-in, system prompt, tool loop. |
| UI shell | `src/App.tsx`, `src/ui/`, `src/styles.css` | 3 swipe screens (Tracks, Video, Talk), paw menus, floating component card, sheets. Motion animations. |
| Subjects | `src/subjects.ts`, `src/segment/` | Tap → cut-out (SlimSAM in a worker) → follow through the clip. Masks on the device. |
| Voice and examples | `src/voice.ts`, `src/examples.ts`, `src/beats.ts` | Hold-to-talk speech recognition; example video analysis (shots, tempo, contact sheet). |
| Edit data | `src/telemetry.ts`, `api/events.ts` | Batches edit events in the browser; the function writes them to Vercel Blob. |

## Data flow

One chat request, from typed words to a changed video:

1. The user holds the paw and speaks (`src/voice.ts`), or types on the talk screen. `session.ask()` calls `Agent.send()`, adding the tapped subject if there is one.
2. `Agent` adds `<editor_state>` (from `store.snapshot()`) to the message and sends it with every tool in `ALL_TOOLS` to the provider.
3. The model answers with tool calls. `runTool()` finds each tool and calls its `run()`.
4. The tool calls an op that calls `store.edit(component, tool, "ai", args, fn)`. The store pushes undo history, saves to localStorage and logs an `edit` event.
5. `show_components` adds component ids to `visible`. `CardHost` raises the newest as a floating card with an "AI set this" badge.
6. Tool results go back to the model. The loop repeats until the model stops calling tools (max 14 steps).
7. Each animation frame, `Engine.tick()` reads the project, syncs media elements and draws the frame on the canvas.
8. `telemetry` sends queued events to `/api/events` every 15 s and when the page hides.

## Tap to isolate

1. `VideoScreen` maps the tap to a canvas point, then `Engine.toSource()` maps it to the clip's source frame.
2. `isolate()` grabs that frame from a hidden video element at 512 px and sends it to `segment/worker.ts`.
3. The worker runs SlimSAM (WebGPU if an adapter exists, else WASM) and returns the largest mask region.
4. A `SubjectLayer` goes into the project through `store.edit`; masks stay in `subjects.ts` and IndexedDB `ck-masks`.
5. `follow()` segments every 0.4 s forward and back, prompting each frame with the last mask's center.
6. `Engine.drawSubjects()` draws effects from the nearest mask within 0.3 s.

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
| `subject.tsx` | subject (tapped things and their effects) |
| `examples.tsx` | examples (analyze an example video, propose a recipe) |
| `index.ts` | Registry plus core tools: show/hide components, get_state, undo, view_frame |

## Boundaries

| Boundary | Rule |
|---|---|
| UI ↔ Store | Project changes go only through `store.edit()`. |
| Component ↔ AI | The AI acts only through tools. A tool and its Panel share one op function. |
| UI ↔ Engine | The UI calls `getEngine()` methods. Only the engine plays, pauses or seeks preview media. `subjects.ts`, `thumbs.ts` and `examples.ts` use their own hidden elements. |
| Project ↔ masks | The project holds subject layers and effects only. Masks never enter the project or edit data. |
| Browser ↔ model host | The browser downloads SlimSAM weights from Hugging Face once. Frames never leave the device. |
| Model ↔ everything | `model.ts` takes plain data and returns plain data. |
| Browser ↔ AI provider | Direct HTTPS with the user's key. Nothing goes through `/api`. |
| Browser ↔ `/api/events` | Edit events only: tools, arguments, project JSON, chat text. Never media, never keys. |
