// Small frame thumbnails for the scrub strip and the tracks screen. Cached per media and time.
import { mediaUrl } from "./media";

const cache = new Map<string, Promise<string>>();
const videos = new Map<string, HTMLVideoElement>();
let queue: Promise<unknown> = Promise.resolve();

export function thumbnail(mediaId: string, t: number, kind: "video" | "image"): Promise<string> {
  const key = `${mediaId}@${t.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = mediaUrl(mediaId);
  if (!url) return Promise.resolve("");
  if (kind === "image") {
    cache.set(key, Promise.resolve(url));
    return cache.get(key)!;
  }
  const job = (queue = queue.then(async () => {
    let v = videos.get(mediaId);
    if (!v) {
      v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = url;
      videos.set(mediaId, v);
      await new Promise<void>((r) => (v!.onloadeddata = () => r()));
    }
    await new Promise<void>((r) => {
      v!.addEventListener("seeked", () => r(), { once: true });
      setTimeout(r, 1500);
      v!.currentTime = Math.max(0.01, t);
    });
    const c = document.createElement("canvas");
    c.height = 96;
    c.width = Math.round((96 * v.videoWidth) / Math.max(1, v.videoHeight)) || 54;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.6);
  })) as Promise<string>;
  cache.set(key, job);
  return job;
}
