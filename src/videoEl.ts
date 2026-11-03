// Video elements that work on iPhone. iOS Safari loads and decodes only videos that are in the page, muted,
// marked playsinline, and (for canvas drawing) played once. Every hidden video in the app comes from here.

let host: HTMLDivElement | null = null;
function getHost() {
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1";
    document.body.appendChild(host);
  }
  return host;
}

export function makeVideo(src: string): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.preload = "auto";
  v.style.cssText = "width:2px;height:2px";
  getHost().appendChild(v);
  v.src = src;
  v.load();
  return v;
}

export function removeVideo(v: HTMLVideoElement) {
  v.pause();
  v.removeAttribute("src");
  v.load();
  v.remove();
}

/** Resolves on the first of `events`, rejects on a media error, resolves anyway after `ms`. */
export function waitFor(v: HTMLMediaElement, events: string[], ms: number): Promise<void> {
  return new Promise((res, rej) => {
    const done = () => {
      clear();
      res();
    };
    const fail = () => {
      clear();
      rej(new Error(mediaErrorText(v)));
    };
    const t = setTimeout(done, ms);
    const clear = () => {
      clearTimeout(t);
      events.forEach((ev) => v.removeEventListener(ev, done));
      v.removeEventListener("error", fail);
    };
    events.forEach((ev) => v.addEventListener(ev, done, { once: true }));
    v.addEventListener("error", fail, { once: true });
  });
}

export function mediaErrorText(v: HTMLMediaElement) {
  const code = v.error?.code;
  if (code === 4 || code === 3) return "This browser cannot play this video's format. Try Safari on iPhone, or a video saved as H.264.";
  return "Could not read this file";
}

/** Gets a decoded frame ready: iOS draws a video to a canvas only after it has played once. */
export async function primeFrame(v: HTMLVideoElement, at?: number) {
  if (v.readyState < 1) await waitFor(v, ["loadedmetadata"], 10000);
  if (v.readyState < 2) {
    const wasMuted = v.muted;
    v.muted = true;
    try {
      await v.play();
      v.pause();
    } catch {
      /* autoplay refused: the first user tap plays it */
    }
    v.muted = wasMuted;
    if (v.readyState < 2) await waitFor(v, ["loadeddata", "canplay"], 4000);
  }
  if (at !== undefined && Math.abs(v.currentTime - at) > 0.01) {
    v.currentTime = at;
    await waitFor(v, ["seeked"], 3000);
  }
}
