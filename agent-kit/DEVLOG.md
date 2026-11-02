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

## 2026-11-02 — Installed the agent kit

I installed the agent kit in `agent-kit/`. CutKit is a phone video editor driven by a chat AI. The AI edits through 13 components and opens only the ones the user needs. It is live at https://cutkit-amber.vercel.app.

Earlier today we built the editor and added Motion animations. Two bugs showed up in browser tests. A `scrollIntoView` promise crashed React effects. A Motion `popLayout` list needed a forwarded ref. Both are fixed and listed in the AGENTS.md landmine map.

I added Prettier and a `verify` script, and formatted the code. The gate passes: lint, build, 4 tests. The queue holds 4 items, marked provisional. The browser end-to-end gate goes first, because the next features need it for evidence.

The repo has no `main` branch yet. All work is on `claude/cutkit`, and production deploys from it.

Evidence: `npm run verify` green on the install commit; Playwright run at `167e9aa`.

