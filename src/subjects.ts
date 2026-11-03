// Subject layers: tap a thing in the frame, the model cuts it out, then we follow it through the clip.
// Masks stay on the device (memory + IndexedDB). The project only stores the layer and its effects.
import { useSyncExternalStore } from "react";
import { defaultEffect, layout, uid, type EffectName, type SubjectLayer } from "./model";
import { mediaUrl } from "./media";
import { followTimes, maskStats, nearest, innerPoint, type MaskStats } from "./segment/maskmath";
import type { SegmentRequest, SegmentResponse } from "./segment/worker";
import { store } from "./store";
import type { EventSource } from "./telemetry";

const GRAB_SIDE = 512; // frames go to the model at this size (long side)
export const FOLLOW_STEP = 0.4; // seconds between masks
const MAX_GAP = 0.3; // draw effects only within this distance of a mask, so nothing sits misaligned

export interface Keyframe {
  t: number; // source seconds
  mask: HTMLCanvasElement; // white where the subject is
  stats: MaskStats;
}

interface Track {
  frames: Keyframe[]; // sorted by t
  still: HTMLCanvasElement | null; // RGBA cut-out at t0, for freeze and sticker
}

export interface SubjectStatus {
  phase: "finding" | "following" | "ready" | "failed";
  progress: number; // 0..1
  device?: string;
  error?: string;
}

const tracks = new Map<string, Track>();
let statuses: Record<string, SubjectStatus> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setStatus(id: string, s: SubjectStatus) {
  statuses = { ...statuses, [id]: s };
  emit();
}

export function useSubjectStatus(id: string | null): SubjectStatus | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => (id ? (statuses[id] ?? null) : null),
  );
}

// ---------- model worker ----------
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: SegmentResponse) => void>();
function call(req: Omit<SegmentRequest, "id">, transfer: Transferable[] = []): Promise<SegmentResponse> {
  worker ??= (() => {
    const w = new Worker(new URL("./segment/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<SegmentResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    return w;
  })();
  const id = ++seq;
  return new Promise((res) => {
    pending.set(id, res);
    worker!.postMessage({ id, ...req }, transfer);
  });
}

/** Start downloading the model early (e.g. when the first clip is added). */
export function warmup() {
  void call({ type: "warmup" });
}

// ---------- frame grabs (separate elements, so playback is untouched) ----------
const grabbers = new Map<string, HTMLVideoElement>();
async function grab(mediaId: string, t: number): Promise<HTMLCanvasElement> {
  const url = mediaUrl(mediaId);
  if (!url) throw new Error("Media not loaded");
  let v = grabbers.get(mediaId);
  if (!v) {
    v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    grabbers.set(mediaId, v);
    await new Promise<void>((r) => (v!.readyState >= 1 ? r() : v!.addEventListener("loadedmetadata", () => r(), { once: true })));
  }
  if (Math.abs(v.currentTime - t) > 0.001 || v.readyState < 2) {
    await new Promise<void>((r) => {
      const done = () => r();
      v!.addEventListener("seeked", done, { once: true });
      setTimeout(done, 2500);
      v!.currentTime = t;
    });
  }
  const s = Math.min(1, GRAB_SIDE / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(v.videoWidth * s));
  c.height = Math.max(1, Math.round(v.videoHeight * s));
  c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

function grabImage(mediaId: string): Promise<HTMLCanvasElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, GRAB_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      res(c);
    };
    img.onerror = () => rej(new Error("Image not loaded"));
    img.src = mediaUrl(mediaId) ?? "";
  });
}

async function segmentFrame(frame: HTMLCanvasElement, point: [number, number]) {
  const rgba = frame.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, frame.width, frame.height).data;
  const r = await call({ type: "segment", rgba, width: frame.width, height: frame.height, point }, [rgba.buffer]);
  if (!r.ok || !r.mask) throw new Error(r.error ?? "Segmentation failed");
  return r;
}

function maskCanvas(mask: Uint8Array, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = mask[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function cutout(frame: HTMLCanvasElement, mask: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = frame.width;
  c.height = frame.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(frame, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, c.width, c.height);
  return c;
}

// ---------- public API ----------

/**
 * Tap → subject. Cuts out the subject at the tap, adds a layer, then follows it through the clip in the background.
 * `point` is 0..1 of the source frame. Returns the new layer id, or throws.
 */
export async function isolate(clipId: string, t: number, point: [number, number], source: EventSource, name = "Subject"): Promise<string> {
  const clip = store.get().project.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error("No such clip");
  const media = store.get().media.find((m) => m.id === clip.mediaId);
  if (!media || media.kind === "audio") throw new Error("Nothing to isolate in this clip");
  const id = uid("s_");
  setStatus(id, { phase: "finding", progress: 0 });
  try {
    const frame = media.kind === "image" ? await grabImage(media.id) : await grab(media.id, t);
    const r = await segmentFrame(frame, point);
    const mask = maskCanvas(r.mask!, r.width!, r.height!);
    const stats = maskStats(r.mask!, r.width!, r.height!);
    if (stats.area < 0.002) throw new Error("Nothing found there");
    tracks.set(id, { frames: [{ t, mask, stats }], still: cutout(frame, mask) });
    const layer: SubjectLayer = { id, name, clipId, t0: t, point, effects: {} };
    store.edit("subject", "isolate", source, { clipId, t, point }, (p) => ({ ...p, subjects: [...p.subjects, layer] }));
    setStatus(id, { phase: media.kind === "image" ? "ready" : "following", progress: 0, device: r.device });
    if (media.kind !== "image") void follow(id, media.id, clip.in, clip.out, t, [stats.cx, stats.cy], r.device);
    return id;
  } catch (e) {
    setStatus(id, { phase: "failed", progress: 0, error: (e as Error).message });
    throw e;
  }
}

async function follow(id: string, mediaId: string, a: number, b: number, t0: number, start: [number, number], device?: string) {
  const { forward, backward } = followTimes(a, b, t0, FOLLOW_STEP);
  const total = forward.length + backward.length;
  let done = 0;
  for (const dir of [forward, backward]) {
    let point = start;
    for (const t of dir) {
      if (!tracks.has(id)) return; // removed
      try {
        const frame = await grab(mediaId, t);
        const r = await segmentFrame(frame, point);
        const stats = maskStats(r.mask!, r.width!, r.height!);
        if (stats.area > 0.002) {
          const kf = { t, mask: maskCanvas(r.mask!, r.width!, r.height!), stats };
          const tr = tracks.get(id)!;
          tr.frames.push(kf);
          tr.frames.sort((x, y) => x.t - y.t);
          point = innerPoint(r.mask!, r.width!, r.height!) ?? point;
        }
      } catch {
        /* skip this keyframe */
      }
      done++;
      setStatus(id, { phase: "following", progress: done / total, device });
    }
  }
  setStatus(id, { phase: "ready", progress: 1, device });
  void saveTrack(id);
}

export function keyframeAt(id: string, t: number, maxGap = MAX_GAP): Keyframe | null {
  const tr = tracks.get(id);
  if (!tr || !tr.frames.length) return null;
  const i = nearest(
    tr.frames.map((f) => f.t),
    t,
  );
  return Math.abs(tr.frames[i].t - t) <= maxGap ? tr.frames[i] : null;
}

/** Which subject (if any) covers a source point of a clip at a source time. */
export function hitSubject(clipId: string, t: number, point: [number, number]): string | null {
  const layers = store.get().project.subjects.filter((s) => s.clipId === clipId);
  for (const s of layers.reverse()) {
    const kf = keyframeAt(s.id, t);
    if (!kf) continue;
    const x = Math.floor(point[0] * kf.mask.width),
      y = Math.floor(point[1] * kf.mask.height);
    const a = kf.mask.getContext("2d", { willReadFrequently: true })!.getImageData(x, y, 1, 1).data[3];
    if (a > 127) return s.id;
  }
  return null;
}

export const stillOf = (id: string) => tracks.get(id)?.still ?? null;

/** Center of the subject in timeline time, for the docked card's pointer and the follow camera. */
export function subjectCenter(layer: SubjectLayer, timelineT: number) {
  const p = store.get().project;
  const pl = layout(p).find((x) => x.clip.id === layer.clipId);
  if (!pl) return null;
  const st = pl.clip.in + (Math.min(Math.max(timelineT, pl.start), pl.end) - pl.start) * pl.clip.speed;
  return keyframeAt(layer.id, st, Infinity)?.stats ?? null;
}

export function setEffect(id: string, effect: EffectName, value: Record<string, unknown> | null, source: EventSource, merge = false) {
  store.edit(
    "subject",
    value ? "set_effect" : "remove_effect",
    source,
    { id, effect, value },
    (p) => ({
      ...p,
      subjects: p.subjects.map((s) => {
        if (s.id !== id) return s;
        const effects = { ...s.effects };
        if (value) effects[effect] = { ...(effects[effect] ?? defaultEffect(effect, s.t0)), ...value } as never;
        else delete effects[effect];
        return { ...s, effects };
      }),
    }),
    { merge },
  );
}

export function removeSubject(id: string, source: EventSource) {
  store.edit("subject", "remove_subject", source, { id }, (p) => ({ ...p, subjects: p.subjects.filter((s) => s.id !== id) }));
  if (store.get().selectedSubjectId === id) store.set({ selectedSubjectId: null });
}

// ---------- persistence ----------
const DB = "ck-masks";
let dbp: Promise<IDBDatabase> | null = null;
const db = () =>
  (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("tracks");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
async function toCanvas(b: Blob) {
  const bmp = await createImageBitmap(b);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return c;
}

async function saveTrack(id: string) {
  const tr = tracks.get(id);
  if (!tr) return;
  try {
    const rec = {
      frames: await Promise.all(tr.frames.map(async (f) => ({ t: f.t, stats: f.stats, png: await toBlob(f.mask) }))),
      still: tr.still ? await toBlob(tr.still) : null,
    };
    const d = await db();
    d.transaction("tracks", "readwrite").objectStore("tracks").put(rec, id);
  } catch {
    /* storage full: masks are rebuilt by tapping again */
  }
}

export async function restoreSubjects() {
  const d = await db().catch(() => null);
  if (!d) return;
  for (const s of store.get().project.subjects) {
    if (tracks.has(s.id)) continue;
    const rec = await new Promise<any>((res) => {
      const r = d.transaction("tracks").objectStore("tracks").get(s.id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
    if (!rec) {
      setStatus(s.id, { phase: "failed", progress: 0, error: "Tap it again to rebuild" });
      continue;
    }
    const frames: Keyframe[] = await Promise.all(
      rec.frames.map(async (f: any) => ({ t: f.t, stats: f.stats, mask: await toCanvas(f.png) })),
    );
    tracks.set(s.id, { frames, still: rec.still ? await toCanvas(rec.still) : null });
    setStatus(s.id, { phase: "ready", progress: 1 });
  }
}
