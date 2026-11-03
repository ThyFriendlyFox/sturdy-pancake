# Changelog

All notable changes to CutKit are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.3.1] - 2026-11-03
### Added
- Desktop: on screens 1000 px and wider, Tracks, the video and the talk screen show side by side.

## [0.3.0] - 2026-11-03
### Added
- Video first: the video fills the screen. A paw in the corner opens Add clips, Music, Look and Export. Hold the paw to talk to the AI.
- Tap anything in the video to lift it out. It is cut out and followed through the clip on the phone. A paw menu around the tap adds Follow, Glow, Spotlight, Freeze, Clone, Recolor, Erase or Sticker.
- Components rise as a floating card when the AI or the user needs them. Swipe the card down to close it.
- Swipe right for Tracks: every track on one timeline. Tap a track to open its component in place.
- Swipe left to talk: chat, voice, and a small copy of the video.
- Copy an edit: add an example video, and the AI lists the moves it found. Pick the moves and apply them.
- Voice input with the browser's speech recognition.
- Agent kit in `agent-kit/`: roadmap, contract, docs, CI workflows.
- `npm run lint`, `npm run format` and `npm run verify`.

### Changed
- The video drives the playback clock, so slow decoding no longer causes black frames.
- The old component dock and chat bar are gone.

## [0.2.0] - 2026-11-02
### Added
- Animations: component cards spring in and out, cards the AI opens glow, sheets slide up and close with a swipe, chat messages and AI actions pop in.

## [0.1.0] - 2026-11-02
### Added
- Chat with an AI that edits the video. Connect with OpenRouter sign-in or a Claude, OpenAI or Gemini key.
- 13 components, hidden until needed: media, timeline, video track, cuts and trims, transitions, color, voice track, voice pitch, music, text, motion graphics, format, export.
- Playback and export in the browser. Media stays on the phone.
- Add to home screen (PWA).
- Edit data: edits and chat turns are stored privately to train the AI. Users can turn it off in AI settings.
