// Runs SlimSAM in a worker: one tap point in, one subject mask out. Everything stays on the device;
// only the model weights are downloaded (once, then cached by the browser).
import { AutoProcessor, RawImage, SamModel, env, type PreTrainedModel, type Processor } from "@huggingface/transformers";
import { largestComponent } from "./maskmath";

env.allowLocalModels = false;

const MODEL = "Xenova/slimsam-77-uniform";

let ready: Promise<{ model: PreTrainedModel; processor: Processor; device: string }> | null = null;

// Download progress for the model files, reported to the page as { id: 0, progress }.
const loaded = new Map<string, [number, number]>();
function onProgress(p: { status: string; file?: string; loaded?: number; total?: number }) {
  if (p.status !== "progress" || !p.file || !p.total) return;
  loaded.set(p.file, [p.loaded ?? 0, p.total]);
  let a = 0,
    b = 0;
  for (const [x, y] of loaded.values()) {
    a += x;
    b += y;
  }
  (self as unknown as Worker).postMessage({ id: 0, ok: true, progress: a / b });
}

/**
 * `light`: WASM with 8-bit weights only. Used on iPhone and after a crash: WebGPU with 32-bit weights used
 * enough memory for iOS to kill the page.
 */
function load(light: boolean) {
  ready ??= (async () => {
    const processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback: onProgress });
    // Some browsers expose navigator.gpu but have no usable adapter (no GPU, blocklisted driver).
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    const hasGpu = !light && !!gpu && !!(await gpu.requestAdapter().catch(() => null));
    if (hasGpu) {
      try {
        const model = await SamModel.from_pretrained(MODEL, { device: "webgpu", dtype: "fp32", progress_callback: onProgress });
        return { model, processor, device: "webgpu" };
      } catch {
        /* fall back to wasm */
      }
    }
    const model = await SamModel.from_pretrained(MODEL, { device: "wasm", dtype: "q8", progress_callback: onProgress });
    return { model, processor, device: "wasm" };
  })();
  return ready;
}

export interface SegmentRequest {
  id: number;
  type: "segment" | "warmup";
  rgba?: Uint8ClampedArray;
  width?: number;
  height?: number;
  point?: [number, number]; // 0..1
  light?: boolean;
}

export interface SegmentResponse {
  id: number;
  ok: boolean;
  error?: string;
  mask?: Uint8Array;
  width?: number;
  height?: number;
  score?: number;
  device?: string;
  ms?: number;
  progress?: number; // model download, 0..1 (id 0)
}

self.onmessage = async (e: MessageEvent<SegmentRequest>) => {
  const req = e.data;
  const post = (r: Omit<SegmentResponse, "id">, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage({ id: req.id, ...r }, transfer);
  try {
    const { model, processor, device } = await load(!!req.light);
    if (req.type === "warmup") return post({ ok: true, device });
    const t0 = performance.now();
    const w = req.width!,
      h = req.height!;
    const image = new RawImage(req.rgba!, w, h, 4);
    const pt = [req.point![0] * w, req.point![1] * h];
    const inputs = await (processor as any)(image, { input_points: [[pt]], input_labels: [[1]] });
    const out = await (model as any)(inputs);
    const masks = await (processor as any).post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
    const scores: Float32Array = out.iou_scores.data;
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    const m = masks[0][0];
    const [, H, W] = m.dims as number[];
    const raw = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) raw[i] = m.data[best * W * H + i] ? 255 : 0;
    // Free tensors now, not at the next GC: on WebGPU they hold GPU memory, and each frame allocates more.
    for (const t of [...Object.values(inputs), ...Object.values(out), ...masks.flat()])
      (t as { dispose?: () => void } | undefined)?.dispose?.();
    const mask = largestComponent(raw, W, H);
    post({ ok: true, mask, width: W, height: H, score: scores[best], device, ms: Math.round(performance.now() - t0) }, [mask.buffer]);
  } catch (err) {
    post({ ok: false, error: (err as Error).message ?? String(err) });
  }
};
