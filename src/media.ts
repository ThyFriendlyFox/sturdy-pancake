import { uid, type Media, type MediaKind } from "./model";
import { store } from "./store";

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
async function put(id: string, f: Blob) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction("files", "readwrite");
    tx.objectStore("files").put(f, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function get(id: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction("files").objectStore("files").get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
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

function probe(url: string, kind: MediaKind): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((res, rej) => {
    if (kind === "image") {
      const img = new Image();
      img.onload = () => res({ duration: 0, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => rej(new Error("Could not read image"));
      img.src = url;
      return;
    }
    const el = document.createElement(kind === "video" ? "video" : "audio") as HTMLMediaElement;
    el.preload = "metadata";
    el.muted = true;
    if (el instanceof HTMLVideoElement) el.playsInline = true;
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      const finish = (d: number) => res({ duration: d, width: v.videoWidth || 0, height: v.videoHeight || 0 });
      if (Number.isFinite(el.duration)) return finish(el.duration);
      // Some recordings report Infinity until seeked far.
      el.currentTime = 1e7;
      el.ontimeupdate = () => {
        el.ontimeupdate = null;
        finish(Number.isFinite(el.duration) ? el.duration : 10);
      };
    };
    el.onerror = () => rej(new Error("Could not read file"));
    el.src = url;
  });
}

export async function importFiles(files: FileList | File[]): Promise<Media[]> {
  const out: Media[] = [];
  for (const f of Array.from(files)) {
    const kind = kindOf(f);
    if (!kind) continue;
    const id = uid("m_");
    const url = URL.createObjectURL(f);
    try {
      const info = await probe(url, kind);
      await put(id, f).catch(() => {});
      urls.set(id, url);
      const m: Media = { id, name: f.name.replace(/\.[^.]+$/, "").slice(0, 40), kind, ...info };
      store.addMedia(m);
      out.push(m);
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  return out;
}

export async function importBlob(b: Blob, name: string): Promise<Media | null> {
  const ext = b.type.includes("mp4") ? "m4a" : "webm";
  const f = new File([b], `${name}.${ext}`, { type: b.type || "audio/webm" });
  const [m] = await importFiles([f]);
  return m ?? null;
}

export function pickFiles(accept = "video/*,audio/*,image/*"): Promise<Media[]> {
  return new Promise((res) => {
    const i = document.createElement("input");
    i.type = "file";
    i.multiple = true;
    i.accept = accept;
    i.onchange = () => (i.files ? importFiles(i.files).then(res) : res([]));
    i.click();
  });
}
