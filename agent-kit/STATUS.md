# STATUS.md — where the project actually stands

The single source of truth for project state. Claims require evidence: a
passing gate, a linked run, a tag. Updated in the same commit as the
behavior change. The weekly cycle (WEEKLY.md step 5) refreshes it.

| Area | State | Evidence |
|---|---|---|
| Desktop layout (3 panes at ≥1000 px) | ✅ | Playwright at 1440×900: 3 panes update together; back to swiping at 390 px |
| Video-first screen, corner paw, 3-screen swipe | ✅ | `e2e/magic.cjs` run, 0 errors: paw opens, swipe moves to the talk screen (`translateX(-780px)`) |
| Tap to isolate (SlimSAM, in the browser) | ✅ | Same run: dog isolated 33 s after the tap, model download included (CPU, no GPU) |
| Follow through the clip | 🚧 | Works: 3.5 s clip followed in 150 s on a 2-core CPU without WebGPU. Too slow without WebGPU; not timed on a phone |
| Subject effects (glow, spotlight, trail, freeze, clone, recolor, erase, sticker, follow cam) | ✅ | Glow and spotlight on the followed dog at 3.1 s mid-playback (screenshot in devlog). The others render in code; not each screenshotted |
| Floating component cards, AI badge | ✅ | Fake-AI run: apply_look + show_components raised the Color card with "AI set this" |
| Tracks screen, open a track in place | ✅ | Screenshots: 7 lanes; Dog lane opens the Subject component |
| Talk screen, voice | 🚧 | Typing works in the run. Speech recognition is not testable headless; not tried on a phone |
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
- **Last release:** 0.3.1 (untagged) — 2026-11-03, live at https://cutkit-amber.vercel.app
- **Known red:** none. GitHub's default branch is still `claude/cutkit`; the human switches it to `main`.
