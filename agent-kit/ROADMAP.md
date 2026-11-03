# ROADMAP.md — the source of all work

**This file is not optional.** Every feature the agent builds flows down
from here. If it isn't on this roadmap, it doesn't get built; if it needs
building, it gets added here first. One item ships per weekly cycle
(see `WEEKLY.md`).

## North star

CutKit is the video editor where you talk instead of hunting for tools.
The video is always on screen. The AI makes the edit and opens only the
component you need to adjust it by hand. Every edit, by the AI or by
hand, becomes data that teaches the AI to use the components better.
Media stays on the phone.

## Feature Queue — ordered; top unblocked item ships next

provisional: true — the agent seeded this order at install time. The human re-orders it.

### 1. Browser end-to-end gate
- **Promise:** `npm run verify` runs a Playwright test that adds a clip, sends a chat message to a scripted fake AI, and checks the edits, the shown components, playback and export.
- **Evidence:** `npm run verify` green locally and in CI; the test fails when `store.edit` logging or `show_components` is broken on purpose.
- **Use case:** All cases — every later promise needs a browser gate to prove it.
- **Scope guard:** Chromium only, fake AI only. No real provider calls in CI.
- **Status:** ready

### 2. Auto-captions
- **Promise:** Asking "add captions" on a talking clip adds caption text items whose words and times match the speech within 0.5 s.
- **Evidence:** A Playwright run on a speech fixture compares caption start times to the known word times; a screenshot of the captions.
- **Use case:** Title and captions.
- **Scope guard:** On-device speech-to-text (Whisper tiny, as in FastCut). English first. No word-by-word highlight.
- **Status:** ready

### 3. Cut to the beat
- **Promise:** Asking "cut to the beat" splits the video track so every cut lands within 50 ms of a detected beat in the music.
- **Evidence:** A unit test on the beat-to-cut math; a 120 BPM fixture gives cuts on multiples of 0.5 s.
- **Use case:** Music bed; Hype moment.
- **Scope guard:** A new `beats` component with 1 tool and a beat strip in its Panel. Beat finder reused from FastCut.
- **Status:** ready

### 4. Edit-data dataset export
- **Promise:** `npm run dataset` downloads the stored edit events and writes one JSONL row per AI turn: state before, user message, tool calls, and any user edits in the next 60 s.
- **Evidence:** A unit test on the row builder with fixture events; a run against the live store prints the row count.
- **Use case:** Edit by hand — user corrections teach the AI.
- **Scope guard:** A local script only. No training, no dashboard.
- **Status:** ready

## Later — candidates, not yet specced

- Faster playback preview — draw with WebCodecs or show the video element directly when no effect is on. In software rendering, decoding a 1080p frame for the canvas costs ~11 ms.

- Faster follow — cross-origin isolation for multi-threaded WASM, and mask propagation between keyframes instead of a full model run per keyframe.
- Plan before acting — the AI shows its steps and waits for "Do it" (mockup 4).

- Direct "Sign in with Google" for Gemini — needs a Google Cloud OAuth client.
- Drag clips on the timeline — reorder and trim with handles in the Timeline component.
- Keyframes for zoom and text position — Ken Burns moves and moving titles.
- Faster export with WebCodecs — today export takes as long as the video.
- AI sees more than 1 frame — a contact sheet of frames per clip for better first edits.

## Shipped

| Week | Feature | Release | Evidence |
|---|---|---|---|
| 2026-11-03 | Load progress and speed | 0.3.2 | 4× CPU throttle: paused 6.3 → 60 fps, blocked time 2.9 s → 0 s per 3 s; playing 5 → 15 fps; load overlay steps captured; follow 145 s → 94 s |
| 2026-11-03 | Desktop: three screens side by side | 0.3.1 | Playwright at 1440×900: 3 panes, fake-AI edit shows in all 3; at 390×844 the swipe pager returns; 0 errors |
| 2026-11-03 | Magic UI: video first, tap to isolate, paw menus, floating components, tracks and talk screens, copy an edit | 0.3.0 | `e2e/magic.cjs` run, 0 errors: dog isolated and followed in-browser; glow and spotlight track it in playback; recipe split 1 clip into 4 |
| 2026-11-02 | Motion animations in the UI | 0.2.0 | Playwright run: cards, sheets, chat animate; 0 console errors at `167e9aa` |
| 2026-11-02 | AI-first editor with 13 components, PWA, edit data | 0.1.0 | Playwright run with a fake AI: 8 tool calls applied, 3 components shown, export 1.6 MB at `5fdfd78` |

## Explicitly not doing

- Uploading media to a server — it breaks the privacy promise and adds hosting cost.
- A proxy for AI keys — keys go straight to the provider.
- Recreating another app's design or templates — CutKit ships its own.

## Queue changes

<!-- Any reorder, insertion above position 3, or item removal gets one
     line here: date, what changed, why. -->

- 2026-11-02 — Seeded the queue at install. Item 1 (browser gate) goes first because items 2–4 need it for evidence.
- 2026-11-03 — Inserted "Magic UI" at position 1. The human approved the mockups and asked to build and merge it now.
- 2026-11-03 — Added and shipped "Desktop: three screens side by side" out of queue. The human asked for it during the Magic UI cycle.
- 2026-11-03 — Inserted "Load progress and speed" at position 1. The human reported no visible progress while a video loads, and a slow app.
