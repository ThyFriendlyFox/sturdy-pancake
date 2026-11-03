# Configuration

CutKit reads user settings from the browser's localStorage. The user changes them in AI settings (⚙). The server reads 1 environment variable from Vercel project settings.

| Place | Holds |
|---|---|
| localStorage (per browser) | AI settings, project, edit-data switch, anonymous user id |
| IndexedDB `ck-media` (per browser) | Imported and recorded media files |
| IndexedDB `ck-masks` (per browser) | Subject masks and still cut-outs, per subject layer |
| Browser cache | SlimSAM weights (`Xenova/slimsam-77-uniform`) from Hugging Face |
| Vercel env | `BLOB_READ_WRITE_TOKEN` |

At first start, no AI is connected and the project is empty. A damaged localStorage value is ignored and the default is used. A missing media file leaves its clip blank; nothing crashes.

## Fields

| Field | Type | Default | Use |
|---|---|---|---|
| `ck.ai.provider` | `anthropic` \| `openai` \| `gemini` \| `openrouter` | none | AI provider. OpenRouter sign-in sets `openrouter`. |
| `ck.ai.apiKey` | string | none | Key sent only to the provider. |
| `ck.ai.model` | string | `claude-opus-5-5` (Claude), `gpt-5-mini` (OpenAI), `gemini-flash-latest` (Gemini), `anthropic/claude-sonnet-4.5` (OpenRouter) | Model id. Free text with suggestions. |
| `ck.shareData` | `"1"` \| `"0"` | on (unset = on) | Edit-data switch. `"0"` stops logging and drops the queue. |
| `ck.uid` | UUID | random at first start | Anonymous user id on edit events. |
| `ck.project.v1` | JSON | empty project | Saved project and media metadata. |
| `BLOB_READ_WRITE_TOKEN` | env, secret | set by the linked Blob store | Lets `/api/events` write. Without it, events go to the function log. |

## Fixed values in code

| Value | Where | Default |
|---|---|---|
| Max AI tool steps per message | `src/ai/agent.ts` `MAX_STEPS` | 14 |
| Claude effort | `src/ai/agent.ts` | `low` |
| Edit-data flush interval | `src/telemetry.ts` | 15 s, or 40 queued events |
| Max edit-data request | `api/events.ts` | 256 KB, 500 events |
| Undo depth | `src/store.ts` | 100 |
| Export bitrate | `src/engine.ts` | 8 Mbit/s, 30 fps |
| Segmentation model | `src/segment/worker.ts` `MODEL` | `Xenova/slimsam-77-uniform`; WebGPU fp32 if an adapter exists, else WASM q8 |
| Frame size sent to the model | `src/subjects.ts` `GRAB_SIDE` | 512 px long side |
| Follow step | `src/subjects.ts` `FOLLOW_STEP` | 0.4 s |
| Mask reach | `src/subjects.ts` `MAX_GAP` | 0.3 s; no mask closer than this means no effect drawn |
| Media save piece size | `src/media.ts` `CHUNK` | 4 MB |
| Model download delay | `src/ui/VideoScreen.tsx` | 5 s after the first clip is on screen |
| Playback draw cap | `src/engine.ts` `tick()` | 30 fps; paused draws only after a change |
| Hold-to-talk delay | `src/ui/Paw.tsx` `HOLD_MS` | 280 ms |
