# SECURITY.md

- Report vulnerabilities privately via GitHub Security Advisories
  ("Report a vulnerability" on the Security tab of
  ThyFriendlyFox/sturdy-pancake). **Never open a public issue for a
  vulnerability.**
- Acknowledgment within 72 hours; fix-or-plan within 14 days;
  coordinated disclosure after a fix ships.
- Supported: the live site (https://cutkit-amber.vercel.app) and the
  latest minor release.
- Clips, songs and recordings stay in the browser (IndexedDB). A change
  that sends user media off the device is a security defect.
- AI keys stay in the browser (localStorage) and go only to the chosen
  AI provider. A change that sends a key to `/api/*` or logs it in edit
  data is a security defect.
- Edit data (`/api/events`) holds tool names, arguments, project state
  and chat text. It is stored in a private Vercel Blob store. It must
  never hold media bytes or keys, and it must honor the opt-out switch.
- Secrets never enter the repo — not code, config, fixtures, or history.
  `BLOB_READ_WRITE_TOKEN` lives only in Vercel project settings. Local
  dev uses an untracked `.env`.
- For the agent: security-shaped work overrides normal routing. A
  security fix may ship out-of-band as a patch release at any time,
  without waiting for the weekly cycle.
