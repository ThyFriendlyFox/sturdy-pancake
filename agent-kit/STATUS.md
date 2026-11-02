# STATUS.md — where the project actually stands

The single source of truth for project state. Claims require evidence: a
passing gate, a linked run, a tag. Updated in the same commit as the
behavior change. The weekly cycle (WEEKLY.md step 5) refreshes it.

| Area | State | Evidence |
|---|---|---|
| Chat AI with tool loop (Claude, OpenAI, Gemini, OpenRouter) | ✅ | Playwright run with a scripted fake Claude: 8 tool calls applied at `167e9aa`. No real-key run recorded. |
| 13 components (Panel + AI tools) | ✅ | Same run: text, look, pitch, split, transition, motion applied; 3 components shown |
| Playback, transitions, motion graphics, text | ✅ | Screenshots in the 2026-11-02 devlog entry |
| Voice pitch (AudioWorklet) | 🚧 | Builds and sets the ratio; not checked by ear on a phone |
| Export (MediaRecorder) | ✅ | 1.6 MB WebM in Chromium. Safari MP4 not tested on a device. |
| PWA install | 🚧 | Manifest and service worker return 200; not installed on a real phone yet |
| Edit data to Vercel Blob | ✅ | `/api/events` returns 204 on the live site; Blob token linked |
| Motion animations | ✅ | Playwright run, 0 console errors at `167e9aa` |
| Unit tests | ✅ | `npm run verify` green: 4 tests |
| Browser end-to-end gate | ❌ | ROADMAP item 1 |
| CI | 🚧 | Workflows added at install; first run pending |

States: ✅ done (gated) · 🚧 in progress · ❌ not started · 🧊 frozen/won't do.

## Current week

- **Shipping:** between cycles — next is ROADMAP item 1, browser end-to-end gate
- **Last release:** 0.2.0 (untagged) — 2026-11-02, live at https://cutkit-amber.vercel.app
- **Known red:** none. The repo has no `main` branch yet; work lives on `claude/cutkit`.
