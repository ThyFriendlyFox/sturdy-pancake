# STATUS.md — where the project actually stands

The single source of truth for project state. Claims require evidence: a
passing gate, a linked run, a tag. Updated in the same commit as the
behavior change. The weekly cycle (WEEKLY.md step 5) refreshes it.

| Area | State | Evidence |
|---|---|---|
| Load progress overlay | ✅ | Playwright at 6× throttle: "Reading" 0.4 s → "Loading the first frame / Saving 13 of 31 MB" 1.7 s → "Ready" 2.9 s |
| Speed (4× CPU throttle, 31 MB 1080p clip) | 🚧 | Paused: 60 fps, 0 ms blocked (was 6 fps, 2.9 s per 3 s). Playing: 15 fps (was 5); the rest is software video decoding in the test browser. Not measured on a phone |
| Desktop layout (3 panes at ≥1000 px) | ✅ | Playwright at 1440×900: 3 panes update together; back to swiping at 390 px |
| Video-first screen, tap menu, 3-screen swipe | ✅ | `e2e/magic.cjs`, 0 errors: empty-screen tap shows Add clips; swipes move 1 screen each (−780, −780, −390, 0, 0); forced scroll stays 0. Not checked on a real iPhone |
| iPhone memory during cut-outs | 🚧 | Light mode (WASM, 8-bit weights) on iPhone, tensors freed per frame, crash guard tested by simulation (1 crash → light mode, 2 → off). The human's recording showed a crash on tap; not re-checked on a real iPhone |
| iPhone video drawing | 🚧 | Hidden videos are now in the page, muted, playsinline and primed with play-then-pause. Fixes the black video in the human's recording in theory; needs a real-iPhone check |
| Tap to isolate (SlimSAM, in the browser) | ✅ | Same run: dog isolated 33 s after the tap, model download included (CPU, no GPU) |
| Follow through the clip | 🚧 | Works: 3.5 s clip followed in 150 s on a 2-core CPU without WebGPU. Too slow without WebGPU; not timed on a phone |
| Subject effects (glow, spotlight, trail, freeze, clone, recolor, erase, sticker, follow cam) | ✅ | Glow and spotlight on the followed dog at 3.1 s mid-playback (screenshot in devlog). The others render in code; not each screenshotted |
| Floating component cards, AI badge | ✅ | Fake-AI run: apply_look + show_components raised the Color card with "AI set this" |
| Tracks screen, open a track in place | ✅ | Screenshots: 7 lanes; Dog lane opens the Subject component |
| Tap-to-talk | ✅ | Tap on the dog listens at once; fake-mic sentence reached the AI with the tapped subject, 0 errors |
| Talk screen, voice | 🚧 | Whisper fallback: fake-mic sentence transcribed exactly in 6.3 s, screen did not move. Browser speech recognition not testable headless; not tried on a phone |
| Copy an edit (recipe) | ✅ | Fake-AI recipe: 1 of 2 moves on, Apply split 1 clip into 4, 0 motions added |
| Chat AI tool loop (Claude, OpenAI, Gemini, OpenRouter) | ✅ | Fake Claude runs above. No real-key run recorded |
| Export (MediaRecorder) | ✅ | Unchanged since 0.2.0; not re-run in this cycle |
| Edit data to Vercel Blob | ✅ | `/api/events` returns 204 on the live site |
| Unit tests | ✅ | `npm run verify` green: 10 tests |
| Browser end-to-end gate in CI | ❌ | `e2e/magic.cjs` runs by hand; ROADMAP item 1 wires it in |
| CI | 🚧 | Workflows exist; first run on `main` pending |

States: ✅ done (gated) · 🚧 in progress · ❌ not started · 🧊 frozen/won't do.

## Current week

- **Shipping:** between cycles — next is ROADMAP item 1, browser end-to-end gate
- **Last release:** 0.4.1 (untagged) — 2026-11-03, live at https://cutkit-amber.vercel.app
- **Known red:** none. GitHub's default branch is still `claude/cutkit`; the human switches it to `main`.
