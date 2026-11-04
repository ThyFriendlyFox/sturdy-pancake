# VERIFICATION.md — one command answers "is this repo healthy"

`npm run verify` runs, in order:

1. Lint / format check — `npm run lint` (Prettier check + TypeScript)
2. Build — `npm run build`
3. Tests — `npm test` (Vitest: timeline math in `src/model.test.ts`)
4. Browser end-to-end — **not yet a gate.** `e2e/magic.cjs` runs the
   whole UI in a 390×844 viewport with a fake AI and a fake microphone. It runs by hand; ROADMAP item 1 puts it in CI.

## Rules

- CI runs **the same command** as local. No CI-only logic.
- A gate that can't run in some environment **skips loudly**, never
  passes silently.
- New behavior lands with its gate in the same PR whenever feasible.
- A feature's completion promise (ROADMAP.md) should be backed by a gate
  here whenever it can be — evidence that keeps proving itself beats
  evidence produced once.
- Fixing a flaky or broken gate is always in scope, for any task.
