# Components

A component is one editing unit: a Panel the user drives by hand and tools the AI calls. All components start hidden. The AI shows the ones a task needs. CutKit has 13 components. The registry is `src/components/index.ts`.

| Id | Title | AI tools |
|---|---|---|
| `media` | Media | none — the AI shows it and asks the user to add files |
| `timeline` | Timeline | `seek`, `play_pause`, `select_clip` |
| `video_track` | Video track | `add_clip`, `remove_clip`, `move_clip`, `duplicate_clip`, `set_clip_props` |
| `cuts` | Cuts & trims | `trim_clip`, `split_at`, `delete_range` |
| `transitions` | Transitions | `set_transition` |
| `color` | Color & filters | `apply_look`, `set_filters` |
| `voice` | Voice track | `set_voice`, `add_voiceover`, `update_voiceover`, `remove_voiceover` |
| `pitch` | Voice pitch | `set_voice_pitch` |
| `music` | Music | `set_music` |
| `text` | Text & captions | `add_text`, `update_text`, `remove_text` |
| `motion` | Motion graphics | `add_motion`, `update_motion`, `remove_motion` |
| `format` | Format | `set_format` |
| `export` | Export | none — only the user starts a render |

Core tools (not tied to one component): `show_components`, `hide_components`, `get_state`, `undo`, `view_frame`.

## Writing a new component

1. Create `src/components/<name>.tsx`. Export a `ComponentDef`: `id`, `title`, `icon`, `about` (the AI reads it), `tools`, `Panel`.
2. Write each edit as one op function that calls `editFor("<id>")(tool, source, args, fn, merge)`. The Panel calls it with `"user"`; the tool calls it with `"ai"`.
3. Give each tool a JSON-schema `params` object and a `run()` that returns a short result string.
4. Add the component to `COMPONENTS` in `src/components/index.ts`.
5. Add its row to this file, any new project fields to `src/model.ts` with defaults in `emptyProject()`, and drawing to `src/engine.ts` if it changes the picture.
6. Prove it: a unit test for new model math, and a Playwright run where the AI tool and the Panel both change the project.
