# DEVLOG.md — the live devlog

The plain history of this project. A person who knows nothing about the
code reads this file and knows what happened, in order, with no jargon.
Append only. Never rewrite an old entry — a wrong entry gets a
correction entry, not an edit.

Write every entry in the voice of `TONE.md`.

## Entry shape

Every entry has the same shape:

```
## YYYY-MM-DD — <one line: what happened>

<What we did. What worked. What broke. What we learned.
3–10 short sentences. Plain words. Past tense for what happened,
present tense for how things now stand.>

Evidence: <commit / tag / gate run / screenshot>
```

## When to write

- Every WEEKLY.md cycle writes one entry at step 5 (before merge).
- A failed or abandoned attempt gets an entry too. The devlog records
  what happened, not what succeeded. A week with no shipped feature
  still gets its entry.
- Out-of-band work (security patch, gate repair, big triage) gets one.
- SETUP.md writes the first entry: "Installed the agent kit."

## What does not go here

- Code detail that belongs in commit messages.
- Promises about the future — that is ROADMAP.md.
- State claims — that is STATUS.md. The devlog is the story; STATUS is
  the snapshot.

---

<!-- Entries below, newest first. -->

## 2026-11-03 — Load progress, and a 10× faster paused editor (0.3.2)

The human said loading a video showed no progress and the app felt slow. I measured first. With the CPU slowed 4× and a 31 MB 1080p clip, the paused editor ran at 6 frames per second, and the main thread was blocked 2.9 s of every 3 s.

A profile pointed at one call: drawing the video. The engine redrew it every frame, even when paused, through a color filter with all values at 1, and that filter forces a slow path. Now the engine draws only when something changes, skips untouched filters, and caps playback drawing at 30 fps. Paused went to 60 fps with 0 ms blocked. Playing went from 5 to 15 fps; the rest is software decoding in the test browser, and half resolution only reached 18 fps, so I kept full resolution.

Loading now shows each step, and the video appears before it is saved. Saving runs in 4 MB pieces to report MB done. The cut-out model downloads 5 s after the video is up, with progress shown on the first tap. Following pauses during playback. The full end-to-end run passed, and following finished in 94 s instead of 145 s.

Evidence: perf runs in the PR; `e2e/magic.cjs`, 0 errors; `npm run verify` green, 10 tests.

## 2026-11-03 — Desktop shows all three screens (0.3.1)

The human asked for the desktop version to show the 3 screens side by side. At 1000 px and wider, the pager renders Tracks, the video and the talk screen as 3 columns. Swiping, screen dots and the mini video players are off there, and the floating card centers over the video. Below 1000 px the swipe pager returns. I verified the 0.3.0 release on the live site first: the full `e2e/magic.cjs` run passed there with 0 errors.

Evidence: Playwright at 1440×900 shows 3 panes; a fake-AI edit appears in all 3; at 390×844 the pager returns; 0 errors.

## 2026-11-03 — Shipped the magic UI (0.3.0)

The human approved 11 mockups and asked to build them and merge to `main`. The video now fills the screen. A paw in the corner holds the menu, and holding it talks to the AI. Swiping right shows every track; swiping left shows the talk screen.

Tapping a thing in the video cuts it out on the phone with SlimSAM in a web worker. Then the app follows it through the clip, one mask every 0.4 s, and 9 effects draw from those masks. In the test the dog was isolated 33 s after the tap, model download included.

Four things broke on the way. The test browser reported WebGPU but had no GPU, so the model failed until the worker checked for a real adapter. A fading scrim swallowed the next tap on the video. Playback froze, then went black: the clock ran slower than the video, the engine seeked the video back, and seeks show black frames. Now the video drives the clock, and the last frame stays up during a seek. Following is slow without WebGPU: 20 s per mask on this 2-core machine.

Evidence: `e2e/magic.cjs` with a 3.5 s cut of the human's dog video, 0 errors; `npm run verify` green, 10 tests.


## 2026-11-02 — Installed the agent kit

I installed the agent kit in `agent-kit/`. CutKit is a phone video editor driven by a chat AI. The AI edits through 13 components and opens only the ones the user needs. It is live at https://cutkit-amber.vercel.app.

Earlier today we built the editor and added Motion animations. Two bugs showed up in browser tests. A `scrollIntoView` promise crashed React effects. A Motion `popLayout` list needed a forwarded ref. Both are fixed and listed in the AGENTS.md landmine map.

I added Prettier and a `verify` script, and formatted the code. The gate passes: lint, build, 4 tests. The queue holds 4 items, marked provisional. The browser end-to-end gate goes first, because the next features need it for evidence.

The repo has no `main` branch yet. All work is on `claude/cutkit`, and production deploys from it.

Evidence: `npm run verify` green on the install commit; Playwright run at `167e9aa`.

