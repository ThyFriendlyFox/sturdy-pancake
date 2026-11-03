// Reads an example video on the device: a contact sheet for the AI to look at, where the shots change, and the tempo.
import { detectBeats } from "./beats";
import { mediaUrl } from "./media";
import { makeVideo, primeFrame, removeVideo } from "./videoEl";

export interface ExampleAnalysis {
  duration: number;
  cuts: number[]; // seconds where the shot changes
  avgShot: number;
  bpm: number | null;
  sheet: string; // JPEG data URL, 4×2 frames
  motion: number; // 0..1, how much the picture moves between samples
}

async function seek(v: HTMLVideoElement, t: number) {
  await new Promise<void>((r) => {
    const done = () => r();
    v.addEventListener("seeked", done, { once: true });
    setTimeout(done, 2000);
    v.currentTime = t;
  });
}

export async function analyzeExample(mediaId: string): Promise<ExampleAnalysis> {
  const url = mediaUrl(mediaId);
  if (!url) throw new Error("Example not loaded");
  const v = makeVideo(url);
  await primeFrame(v);
  const duration = v.duration;

  // Shot changes: compare tiny grayscale frames 5 times a second.
  const S = 48;
  const small = document.createElement("canvas");
  small.width = small.height = S;
  const sx = small.getContext("2d", { willReadFrequently: true })!;
  const step = 0.2;
  let prev: Uint8ClampedArray | null = null;
  const diffs: { t: number; d: number }[] = [];
  for (let t = 0; t < duration; t += step) {
    await seek(v, t);
    sx.drawImage(v, 0, 0, S, S);
    const px = sx.getImageData(0, 0, S, S).data;
    if (prev) {
      let d = 0;
      for (let i = 0; i < px.length; i += 4)
        d += Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]);
      diffs.push({ t, d: d / (S * S * 3 * 255) });
    }
    prev = px;
  }
  const sorted = diffs.map((x) => x.d).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const cuts = diffs.filter((x) => x.d > 0.12 && x.d > median * 3).map((x) => +x.t.toFixed(2));
  const shots = cuts.length + 1;

  // Contact sheet for the AI.
  const cols = 4,
    rows = 2,
    tw = 180;
  const th = Math.round((tw * v.videoHeight) / v.videoWidth) || 240;
  const sheet = document.createElement("canvas");
  sheet.width = cols * tw;
  sheet.height = rows * th;
  const shx = sheet.getContext("2d")!;
  for (let i = 0; i < cols * rows; i++) {
    await seek(v, ((i + 0.5) / (cols * rows)) * duration);
    shx.drawImage(v, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
  }

  let bpm: number | null = null;
  try {
    bpm = (await detectBeats(url)).bpm;
  } catch {
    /* no audio track */
  }
  removeVideo(v);
  return {
    duration: +duration.toFixed(2),
    cuts,
    avgShot: +(duration / shots).toFixed(2),
    bpm,
    sheet: sheet.toDataURL("image/jpeg", 0.75),
    motion: +(sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length)).toFixed(3),
  };
}
