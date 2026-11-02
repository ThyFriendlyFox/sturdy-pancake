# CutKit

An AI-first video editor for phones. The video is always on screen; everything else is hidden until it's needed.

You chat with an AI. It edits the video by calling **components** — self-contained editing units (timeline, video track, cuts, transitions, color, voice track, voice pitch, music, text, motion graphics, format, export). Each component is both a panel you can drive by hand and a set of tools the AI can call. The AI decides which panels to put on screen.

- **AI:** sign in through OpenRouter (Google/GitHub login) or paste a Claude, OpenAI or Gemini key. Keys stay on the device and go straight to the provider.
- **Private media:** clips are stored in the browser (IndexedDB) and rendered on-device. Nothing is uploaded.
- **Edit data:** every edit (tool, arguments, AI or user, resulting project state) and chat turn is sent to `/api/events` and stored privately in Vercel Blob, to train the AI on how the tools get used. Users can turn this off in AI settings.
- **Installable:** add to home screen (PWA, works offline once loaded).

## Code map

| Part | File |
|---|---|
| Project data + timeline math (pure) | `src/model.ts` |
| Store: every edit, undo, edit logging | `src/store.ts`, `src/telemetry.ts` |
| Playback, audio graph, drawing, export | `src/engine.ts`, `src/pitch.ts` |
| Components (panel + AI tools each) | `src/components/*` |
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
