// On-device speech to text (Whisper tiny), used when the browser has no speech recognition.
import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
const MODEL = "Xenova/whisper-tiny";

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string }>;
let asr: Promise<Asr> | null = null;
const loaded = new Map<string, [number, number]>();

function load() {
  asr ??= pipeline("automatic-speech-recognition", MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file || !p.total) return;
      loaded.set(p.file, [p.loaded ?? 0, p.total]);
      let a = 0,
        b = 0;
      for (const [x, y] of loaded.values()) {
        a += x;
        b += y;
      }
      (self as unknown as Worker).postMessage({ id: 0, progress: a / b });
    },
  }) as unknown as Promise<Asr>;
  return asr;
}

self.onmessage = async (e: MessageEvent<{ id: number; audio?: Float32Array; warmup?: boolean }>) => {
  const { id, audio } = e.data;
  try {
    const run = await load();
    if (!audio) return (self as unknown as Worker).postMessage({ id, text: "" });
    const out = await run(audio, { chunk_length_s: 30, return_timestamps: false });
    (self as unknown as Worker).postMessage({ id, text: (out.text ?? "").trim() });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message ?? String(err) });
  }
};
