# CutKit

An AI-first video editor for phones. The video fills the screen; everything else is hidden until it's needed.

- **Tap and talk:** tap anything in the video; a paw menu opens around it and the app listens. Say what to change, or swipe left to the talk screen.
- **Tap anything:** tap a thing in the video and it lifts out, cut out and followed through the clip on the phone (Google's MediaPipe Magic Touch model, on the phone's GPU when it can). A paw menu around it adds glow, spotlight, trail, freeze, clone, recolor, erase, sticker or a follow camera.
- **Components appear when needed:** editing units (cuts, transitions, color, voice, pitch, music, text, motion graphics, subjects…) are both a panel you drive by hand and tools the AI calls. They rise as a floating card when the AI or you need one.
- **Tracks:** swipe right for every track on one timeline; tap a track to open it in place.
- **Copy an edit:** add an example video and the AI lists the moves it found; apply the ones you want.

- **AI:** sign in through OpenRouter (Google/GitHub login) or paste a Claude, OpenAI or Gemini key. Keys stay on the device and go straight to the provider.
- **Private media:** clips are stored in the browser (IndexedDB) and rendered on-device. Nothing is uploaded.
- **Edit data:** every edit (tool, arguments, AI or user, resulting project state) and chat turn is sent to `/api/events` and stored privately in Vercel Blob, to train the AI on how the tools get used. Users can turn this off in AI settings.

## Code map

| Part | File |
|---|---|
| Project data + timeline math (pure) | `src/model.ts` |
| Store: every edit, undo, edit logging | `src/store.ts`, `src/telemetry.ts` |
| Playback, audio graph, drawing, export | `src/engine.ts`, `src/pitch.ts` |
| Components (panel + AI tools each) | `src/components/*` |
| Tap to isolate, follow, masks | `src/subjects.ts`, `src/segment/*` |
| Screens, paw menus, floating card | `src/ui/*` |
| AI loop + providers | `src/ai/*` |
| Edit-data endpoint | `api/events.ts` |

The full map is in [`agent-kit/docs/ARCHITECTURE.md`](agent-kit/docs/ARCHITECTURE.md); how to add a component is in [`agent-kit/docs/COMPONENTS.md`](agent-kit/docs/COMPONENTS.md).

## Develop

```bash
npm install
npm run dev
npm run verify   # format check, type check, build, tests
```

## Project process

This repo uses the agent kit in [`agent-kit/`](agent-kit/ROUTING.md). Start with `agent-kit/ROUTING.md`.
Work comes from [`agent-kit/ROADMAP.md`](agent-kit/ROADMAP.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).
Security reports: see [agent-kit/SECURITY.md](agent-kit/SECURITY.md). Live at https://cutkit-amber.vercel.app.
