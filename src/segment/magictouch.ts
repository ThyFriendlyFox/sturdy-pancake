// Tap-to-cut-out with MediaPipe's Interactive Segmenter ("Magic Touch"): a 6 MB model built for exactly this.
// It runs on the GPU through WebGL when it can (tens of ms per frame on a phone), otherwise on the CPU.
// Frames never leave the device; the model downloads once and the browser caches it.
import { FilesetResolver, InteractiveSegmenter } from "@mediapipe/tasks-vision";
import { largestComponent } from "./maskmath";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";
const RUNTIME = "/mediapipe"; // copied from node_modules at build (scripts/copy-mediapipe.mjs)

let ready: Promise<{ seg: InteractiveSegmenter; delegate: "GPU" | "CPU" }> | null = null;

async function download(onProgress: (p: number) => void): Promise<Uint8Array> {
  const r = await fetch(MODEL_URL);
  if (!r.ok || !r.body) throw new Error("Could not download the cut-out tool");
  const total = Number(r.headers.get("content-length")) || 6_300_000;
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(Math.min(0.99, got / total));
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return buf;
}

/** `cpuOnly` after a crash on this device: the CPU path uses less memory than the GPU one. */
export function loadSegmenter(cpuOnly: boolean, onProgress: (p: number) => void) {
  ready ??= (async () => {
    const [fs, model] = await Promise.all([FilesetResolver.forVisionTasks(RUNTIME), download(onProgress)]);
    files = fs;
    modelBuf = model;
    const make = (delegate: "GPU" | "CPU") =>
      InteractiveSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetBuffer: model, delegate },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    if (!cpuOnly) {
      try {
        return { seg: await make("GPU"), delegate: "GPU" as const };
      } catch {
        /* no WebGL2: use the CPU */
      }
    }
    return { seg: await make("CPU"), delegate: "CPU" as const };
  })();
  ready.catch(() => (ready = null)); // allow a retry after a failed download
  return ready;
}

export interface Cutout {
  mask: Uint8Array; // 255 = subject
  width: number;
  height: number;
  delegate: string;
  ms: number;
}

/** Cut out the thing at `point` (0..1) of `frame`. */
export async function segment(frame: HTMLCanvasElement, point: [number, number], cpuOnly: boolean): Promise<Cutout> {
  const r = run(await loadSegmenter(cpuOnly, () => {}), frame, point);
  // Some GPUs are slower than the CPU (software WebGL, old phones): time the first GPU run and keep the faster.
  if (r.delegate === "GPU" && !compared && r.ms > 150) {
    compared = true;
    const cpu = await createCpu();
    const c = run({ seg: cpu, delegate: "CPU" }, frame, point);
    if (c.ms < r.ms) {
      const old = await ready!;
      ready = Promise.resolve({ seg: cpu, delegate: "CPU" as const });
      old.seg.close();
      return c;
    }
    cpu.close();
  }
  compared = true;
  return r;
}

let compared = false;
let files: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let modelBuf: Uint8Array | null = null;
const createCpu = () =>
  InteractiveSegmenter.createFromOptions(files!, {
    baseOptions: { modelAssetBuffer: modelBuf!, delegate: "CPU" },
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });

function run(
  { seg, delegate }: { seg: InteractiveSegmenter; delegate: string },
  frame: HTMLCanvasElement,
  point: [number, number],
): Cutout {
  const t0 = performance.now();
  let out: Cutout | null = null;
  seg.segment(frame, { keypoint: { x: point[0], y: point[1] } }, (r) => {
    const m = r.categoryMask;
    if (!m) return;
    const w = m.width,
      h = m.height;
    const cat = m.getAsUint8Array();
    // The subject's category is whatever the tapped pixel got (versions disagree on 0 vs 1).
    const px = Math.min(w - 1, Math.max(0, Math.round(point[0] * (w - 1))));
    const py = Math.min(h - 1, Math.max(0, Math.round(point[1] * (h - 1))));
    const subject = cat[py * w + px];
    const raw = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) raw[i] = cat[i] === subject ? 255 : 0;
    out = { mask: largestComponent(raw, w, h), width: w, height: h, delegate, ms: 0 };
    m.close();
  });
  if (!out) throw new Error("Nothing found there");
  (out as Cutout).ms = Math.round(performance.now() - t0);
  return out;
}
