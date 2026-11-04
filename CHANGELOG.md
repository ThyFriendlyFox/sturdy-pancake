# Changelog

All notable changes to CutKit are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-11-04
### Changed
- Tapping the video opens a menu of everyday edits: Trim, Text, Music, Look, Effects, Export, Add clips and Voice. The app still listens on the same tap.

### Removed
- Masking: tapping a thing to cut it out, following it through the clip, and the 9 effects built on it. Saved masks are deleted from the device on the next visit.

## [0.5.0] - 2026-11-03
### Changed
- Cut-outs use Google's MediaPipe Magic Touch, a 6 MB model made for tap-to-select. On a CPU-only test machine one frame takes about 0.5 s instead of 20 s. It uses the phone's GPU when that is faster.
- Following a tapped thing samples 10 frames per second instead of 2.5, so effects stay on it more closely.
- The download for cut-outs is 6 MB instead of about 50 MB.

### Fixed
- Voice: the end of speech is detected on the audio thread, so a busy page no longer makes it miss a pause.

## [0.4.1] - 2026-11-03
### Fixed
- Tapping the video on iPhone could crash and reload the page: cutting a thing out used too much memory. iPhone now uses a lighter model setup, and each frame's working memory is freed at once.
- After a crash during a cut-out, the app says what happened and switches to the lighter setup. After a second crash it turns cut-outs off; tapping still opens the menu and listens.
- After a reload on iPhone, the video showed black. Now it says "Tap to show your video", and that tap brings the picture back.

## [0.4.0] - 2026-11-03
### Changed
- Tap to talk: tapping the video opens the paw menu and listens at once. Listening stops by itself when you stop talking. Tap the paw's center to stop early.
- With no video, tap anywhere: the menu offers Add clips, Music and Copy an edit.
- Tracks has Clips and Export buttons.

### Removed
- The corner paw.

### Fixed
- Swipes work anywhere, including over the chat, and move exactly 1 screen. They no longer drop on a busy page or drift after the browser scrolls.
- Videos load and draw on iPhone: hidden videos are now in the page and played once, which iPhone needs.
- A browser that cannot play a video's format says so, instead of loading forever.
- "Listening" can no longer stay on screen forever.
- No more text selection or the iPhone Copy / Look Up callout while tapping and swiping.

## [0.3.3] - 2026-11-03
### Fixed
- Holding the paw to talk slid the screen over to the talk screen. It now stays on the video.
- Voice works without the browser's speech recognition (for example a site saved to the iPhone home screen): it records and writes down your words on the phone.

### Removed
- Home-screen app mode and the offline cache. The cache could open an old copy of the app. Phones that have it lose it on their next visit. Adding the site to the home screen still works as a normal bookmark.

## [0.3.2] - 2026-11-03
### Added
- Adding a video shows each step: reading it, loading the first frame, and saving it to this phone with the MB done.
- The first tap shows the cut-out tool's download progress.

### Changed
- The video shows as soon as it is read. Saving to the phone continues in the background.
- The cut-out tool downloads 5 s after the video is on screen, not at once.
- Following a subject pauses while the video plays.

### Fixed
- The editor redrew the video 60 times a second even when paused, through a color filter it did not need. With the CPU slowed 4×, the paused editor went from 6 to 60 frames per second.

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
