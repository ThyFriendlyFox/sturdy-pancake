import { uid, type Media, type MediaKind } from "./model";
import { store } from "./store";
import { makeVideo, mediaErrorText, removeVideo, waitFor } from "./videoEl";

// Media files live in IndexedDB on this device. Only metadata goes in the project.

const DB = "ck-media";
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function put(id: string, f: Blob | Chunked) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction("files", "readwrite");
    tx.objectStore("files").put(f, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function getRaw(id: string): Promise<unknown> {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction("files").objectStore("files").get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// Large files are saved in pieces so the save can report progress. The record under `id` is written last,
// so a half-saved file is never read back as whole.
const CHUNK = 4 * 1024 * 1024;
interface Chunked {
  chunks: number;
  type: string;
}
async function get(id: string): Promise<Blob | undefined> {
  const rec = await getRaw(id);
  if (rec instanceof Blob) return rec;
  const c = rec as Chunked | undefined;
  if (!c?.chunks) return undefined;
  const parts = await Promise.all(Array.from({ length: c.chunks }, (_, i) => getRaw(`${id}#${i}`) as Promise<Blob>));
  if (parts.some((p) => !(p instanceof Blob))) return undefined;
  return new Blob(parts, { type: c.type });
}
async function save(id: string, f: Blob, onBytes: (n: number) => void) {
  const n = Math.max(1, Math.ceil(f.size / CHUNK));
  for (let i = 0; i < n; i++) {
    const part = f.slice(i * CHUNK, Math.min(f.size, (i + 1) * CHUNK));
    await put(`${id}#${i}`, part);
    onBytes(Math.min(f.size, (i + 1) * CHUNK));
  }
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction("files", "readwrite");
    tx.objectStore("files").put({ chunks: n, type: f.type } satisfies Chunked, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

const urls = new Map<string, string>();
export const mediaUrl = (id: string) => urls.get(id);

export async function restoreMedia() {
  for (const m of store.get().media) {
    if (urls.has(m.id)) continue;
    const b = await get(m.id).catch(() => undefined);
    if (b) urls.set(m.id, URL.createObjectURL(b));
  }
}

function kindOf(f: File): MediaKind | null {
  if (f.type.startsWith("video/")) return "video";
  if (f.type.startsWith("audio/")) return "audio";
  if (f.type.startsWith("image/")) return "image";
  if (/\.(mp4|mov|webm|m4v)$/i.test(f.name)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name)) return "audio";
  return null;
}

async function probe(url: string, kind: MediaKind): Promise<{ duration: number; width: number; height: number }> {
  if (kind === "image")
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res({ duration: 0, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => rej(new Error("Could not read this image"));
      img.src = url;
    });
  if (kind === "audio")
    return new Promise((res, rej) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => res({ duration: Number.isFinite(a.duration) ? a.duration : 10, width: 0, height: 0 });
      a.onerror = () => rej(new Error(mediaErrorText(a)));
      a.src = url;
    });
  // In the page, muted and playsinline, or iPhone never loads it.
  const v = makeVideo(url);
  try {
    await waitFor(v, ["loadedmetadata"], 15000);
    if (v.readyState < 1) throw new Error("This browser could not open this video");
    let d = v.duration;
    if (!Number.isFinite(d)) {
      // Some recordings report Infinity until seeked far.
      v.currentTime = 1e7;
      await waitFor(v, ["timeupdate", "seeked"], 3000);
      d = Number.isFinite(v.duration) ? v.duration : 10;
    }
    if (!v.videoWidth) throw new Error("This browser cannot show this video's picture. Try Safari on iPhone, or a video saved as H.264.");
    return { duration: d, width: v.videoWidth, height: v.videoHeight };
  } finally {
    removeVideo(v);
  }
}

/**
 * Reads files and adds them as media. Resolves as soon as each file's length and size are known, so the clip
 * shows right away; saving to the device continues in the background. Progress goes to `store.importing`.
 */
export async function importFiles(files: FileList | File[], role?: "example"): Promise<Media[]> {
  const list = Array.from(files).filter((f) => kindOf(f));
  if (!list.length) return [];
  const job = list.map((f) => ({
    name: f.name.replace(/\.[^.]+$/, "").slice(0, 40),
    size: f.size,
    phase: "reading" as ImportPhase,
    saved: 0,
    error: "",
  }));
  const update = (i: number, patch: Partial<(typeof job)[number]>) => {
    job[i] = { ...job[i], ...patch };
    store.set({ importing: { files: [...job], at: Date.now() } });
  };
  store.set({ importing: { files: [...job], at: Date.now() } });
  const out: Media[] = [];
  const toSave: { i: number; id: string; f: File }[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const kind = kindOf(f)!;
    const id = uid("m_");
    const url = URL.createObjectURL(f);
    try {
      const info = await probe(url, kind);
      urls.set(id, url);
      const m: Media = { id, name: job[i].name, kind, ...info, ...(role ? { role } : {}) };
      store.addMedia(m);
      out.push(m);
      update(i, { phase: "saving" });
      toSave.push({ i, id, f });
    } catch (e) {
      URL.revokeObjectURL(url);
      update(i, { phase: "failed", error: (e as Error).message });
    }
  }
  void (async () => {
    for (const { i, id, f } of toSave) {
      try {
        await save(id, f, (n) => update(i, { saved: n }));
        update(i, { phase: "done", saved: f.size });
      } catch {
        update(i, { phase: "unsaved" }); // works this session; gone after a reload
      }
    }
  })();
  return out;
}

export type ImportPhase = "reading" | "saving" | "done" | "unsaved" | "failed";

export async function importBlob(b: Blob, name: string): Promise<Media | null> {
  const ext = b.type.includes("mp4") ? "m4a" : "webm";
  const f = new File([b], `${name}.${ext}`, { type: b.type || "audio/webm" });
  const [m] = await importFiles([f]);
  return m ?? null;
}

export function pickFiles(accept = "video/*,audio/*,image/*", role?: "example"): Promise<Media[]> {
  return new Promise((res) => {
    const i = document.createElement("input");
    i.type = "file";
    i.multiple = true;
    i.accept = accept;
    i.onchange = () => (i.files ? importFiles(i.files, role).then(res) : res([]));
    i.click();
  });
}
