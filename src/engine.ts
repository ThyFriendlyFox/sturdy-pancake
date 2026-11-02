import {
  aspectSize,
  clamp,
  clipAt,
  filterCss,
  layout,
  sourceTime,
  totalDuration,
  type Clip,
  type MotionItem,
  type Project,
  type TextItem,
} from "./model";
import { mediaUrl } from "./media";
import { PITCH_WORKLET } from "./pitch";
import { store } from "./store";

type El = HTMLVideoElement | HTMLAudioElement;

const FONTS: Record<TextItem["font"], string> = {
  sans: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, Menlo, monospace",
  display: "Impact, 'Arial Black', system-ui, sans-serif",
};

const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const rand = (s: number) => {
  const x = Math.sin(s * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export class Engine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  t = 0;
  playing = false;
  exporting = false;
  private last = 0;
  private lastPush = 0;
  private videos = new Map<string, HTMLVideoElement>(); // clip id -> element
  private images = new Map<string, HTMLImageElement>(); // media id -> image
  private vo = new Map<string, HTMLAudioElement>(); // voiceover id -> element
  private music: HTMLAudioElement | null = null;
  private musicSrc = "";
  private ac: AudioContext | null = null;
  private gains = new Map<El, GainNode>();
  private voiceBus: GainNode | null = null;
  private pitchNode: AudioWorkletNode | null = null;
  private musicBus: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private onExportTick: ((p: number) => void) | null = null;
  private onExportDone: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    const loop = (now: number) => {
      this.tick(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  get project(): Project {
    return store.get().project;
  }

  // ---------- audio graph ----------
  private async ensureAudio() {
    if (this.ac) {
      if (this.ac.state === "suspended") await this.ac.resume();
      return;
    }
    const ac = new AudioContext();
    this.ac = ac;
    this.voiceBus = ac.createGain();
    this.musicBus = ac.createGain();
    const master = ac.createGain();
    this.recordDest = ac.createMediaStreamDestination();
    try {
      const url = URL.createObjectURL(new Blob([PITCH_WORKLET], { type: "application/javascript" }));
      await ac.audioWorklet.addModule(url);
      this.pitchNode = new AudioWorkletNode(ac, "pitch-shifter", { outputChannelCount: [2] });
      this.voiceBus.connect(this.pitchNode).connect(master);
    } catch {
      this.voiceBus.connect(master); // no worklet support: pitch unavailable
    }
    this.musicBus.connect(master);
    master.connect(ac.destination);
    master.connect(this.recordDest);
    for (const el of [...this.videos.values(), ...this.vo.values()]) this.route(el, this.voiceBus);
    if (this.music) this.route(this.music, this.musicBus);
  }

  private route(el: El, bus: GainNode | null) {
    if (!this.ac || !bus || this.gains.has(el)) return;
    try {
      const src = this.ac.createMediaElementSource(el);
      const g = this.ac.createGain();
      src.connect(g).connect(bus);
      this.gains.set(el, g);
    } catch {
      /* already routed */
    }
  }

  private setGain(el: El, v: number) {
    const g = this.gains.get(el);
    if (g) g.gain.value = v;
    else el.volume = clamp(v, 0, 1);
  }

  /** Call from a tap handler so iOS lets media play later. */
  async unlock() {
    await this.ensureAudio();
    for (const el of [...this.videos.values(), ...this.vo.values(), ...(this.music ? [this.music] : [])]) {
      const wasPaused = el.paused;
      el.play()
        .then(() => wasPaused && !this.playing && el.pause())
        .catch(() => {});
    }
  }

  // ---------- transport ----------
  async play() {
    await this.unlock();
    if (this.t >= totalDuration(this.project) - 0.05) this.t = 0;
    this.playing = true;
    store.set({ playing: true });
  }
  pause() {
    this.playing = false;
    this.allPause();
    store.set({ playing: false, time: this.t });
  }
  seek(t: number) {
    this.t = clamp(t, 0, totalDuration(this.project));
    store.set({ time: this.t });
  }
  private allPause() {
    for (const el of [...this.videos.values(), ...this.vo.values()]) el.pause();
    this.music?.pause();
  }

  // ---------- element sync ----------
  private syncElements(p: Project) {
    const ids = new Set(p.clips.map((c) => c.id));
    for (const [id, el] of this.videos) if (!ids.has(id)) (el.pause(), this.videos.delete(id));
    for (const c of p.clips) {
      const m = store.get().media.find((x) => x.id === c.mediaId);
      if (!m) continue;
      const url = mediaUrl(m.id);
      if (!url) continue;
      if (m.kind === "image") {
        if (!this.images.has(m.id)) {
          const img = new Image();
          img.src = url;
          this.images.set(m.id, img);
        }
      } else if (!this.videos.has(c.id)) {
        const v = document.createElement("video");
        v.playsInline = true;
        v.preload = "auto";
        v.crossOrigin = "anonymous";
        v.src = url;
        v.currentTime = c.in;
        this.videos.set(c.id, v);
        this.route(v, this.voiceBus);
      }
    }
    const voIds = new Set(p.voice.voiceovers.map((v) => v.id));
    for (const [id, el] of this.vo) if (!voIds.has(id)) (el.pause(), this.vo.delete(id));
    for (const v of p.voice.voiceovers) {
      const url = mediaUrl(v.mediaId);
      if (url && !this.vo.has(v.id)) {
        const a = new Audio(url);
        a.preload = "auto";
        this.vo.set(v.id, a);
        this.route(a, this.voiceBus);
      }
    }
    const murl = p.music.mediaId ? (mediaUrl(p.music.mediaId) ?? "") : "";
    if (murl !== this.musicSrc) {
      this.music?.pause();
      this.music = murl ? new Audio(murl) : null;
      this.musicSrc = murl;
      if (this.music) this.route(this.music, this.musicBus);
    }
  }

  private follow(el: El, target: number, rate: number, active: boolean) {
    if (!active) {
      if (!el.paused) el.pause();
      return;
    }
    if (this.playing) {
      if (el.playbackRate !== rate) el.playbackRate = rate;
      if (el.paused) el.play().catch(() => {});
      if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
    } else {
      if (!el.paused) el.pause();
      if (!el.seeking && Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
    }
  }

  private tick(now: number) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    const p = this.project;
    this.syncElements(p);
    const dur = totalDuration(p);
    if (this.playing) {
      this.t += dt;
      if (this.t >= dur) {
        this.t = dur;
        if (this.exporting) this.onExportDone?.();
        this.pause();
      }
    }
    if (this.t > dur) this.t = dur;

    const t = this.t;
    const placed = layout(p);
    const cur = clipAt(p, t);
    const voice = p.voice;
    for (const pl of placed) {
      const el = this.videos.get(pl.clip.id);
      if (!el) continue;
      const isCur = cur?.clip.id === pl.clip.id;
      if (isCur) this.follow(el, sourceTime(pl, t), pl.clip.speed, true);
      else {
        if (!el.paused) el.pause();
        // Park neighbours: next clip at its in-point, previous at its out-point (used by transitions).
        const park = cur && pl.index === cur.index + 1 ? pl.clip.in : cur && pl.index === cur.index - 1 ? pl.clip.out - 0.05 : null;
        if (park !== null && !el.seeking && Math.abs(el.currentTime - park) > 0.1) el.currentTime = park;
      }
      this.setGain(el, voice.muted ? 0 : pl.clip.volume * voice.volume);
    }
    let voActive = false;
    for (const v of voice.voiceovers) {
      const el = this.vo.get(v.id);
      if (!el) continue;
      const len = v.out - v.in;
      const active = t >= v.start && t < v.start + len;
      voActive ||= active;
      this.follow(el, v.in + (t - v.start), 1, active);
      this.setGain(el, voice.muted ? 0 : v.volume * voice.volume);
    }
    if (this.pitchNode) this.pitchNode.parameters.get("ratio")!.value = Math.pow(2, voice.pitch / 12);
    if (this.music) {
      const m = p.music;
      const st = m.offset + t;
      const active = dur > 0 && (!Number.isFinite(this.music.duration) || st < this.music.duration);
      this.follow(this.music, st, 1, active);
      let g = m.volume;
      if (m.fadeIn > 0) g *= clamp(t / m.fadeIn, 0, 1);
      if (m.fadeOut > 0) g *= clamp((dur - t) / m.fadeOut, 0, 1);
      if (m.duck && voActive) g *= 0.3;
      this.setGain(this.music, g);
    }

    this.draw(t);
    if (now - this.lastPush > 100 && (this.playing || store.get().time !== t)) {
      this.lastPush = now;
      store.set({ time: t });
    }
    if (this.exporting) this.onExportTick?.(dur ? t / dur : 1);
  }

  // ---------- drawing ----------
  private sourceFor(c: Clip): CanvasImageSource | null {
    const v = this.videos.get(c.id);
    if (v && v.readyState >= 2) return v;
    const img = this.images.get(c.mediaId);
    if (img && img.complete && img.naturalWidth) return img;
    return null;
  }

  private drawClip(c: Clip, alpha = 1, dx = 0, dy = 0, scale = 1) {
    const src = this.sourceFor(c);
    if (!src) return;
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;
    const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth;
    const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight;
    if (!sw || !sh) return;
    const s = Math.max(W / sw, H / sh) * c.zoom * scale;
    const w = sw * s,
      h = sh * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = filterCss(c.filters);
    ctx.drawImage(src, (W - w) / 2 + dx, (H - h) / 2 + dy, w, h);
    ctx.restore();
  }

  draw(t: number) {
    const p = this.project;
    const [W, H] = aspectSize(p.aspect);
    const { canvas, ctx } = this;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.save();
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, W, H);

    // Camera motions affect the video layer only.
    let camScale = 1,
      camX = 0,
      camY = 0;
    for (const m of p.motions) {
      if (t < m.start || t >= m.end) continue;
      const k = (t - m.start) / Math.max(0.01, m.end - m.start);
      if (m.preset === "zoom-punch") camScale *= 1 + 0.15 * m.intensity * Math.sin(Math.PI * k);
      if (m.preset === "shake") {
        camX += (rand(t * 60) - 0.5) * 30 * m.intensity;
        camY += (rand(t * 60 + 7) - 0.5) * 30 * m.intensity;
      }
    }

    const pl = clipAt(p, t);
    if (pl) {
      const c = pl.clip;
      const tr = c.transition;
      const prev = pl.index > 0 ? p.clips[pl.index - 1] : null;
      const k = tr.duration > 0 ? (t - pl.start) / tr.duration : 1;
      if (prev && tr.type !== "none" && k < 1) {
        const e = ease(k);
        switch (tr.type) {
          case "fade":
            this.drawClip(prev, 1, camX, camY, camScale);
            this.drawClip(c, e, camX, camY, camScale);
            break;
          case "dip-black":
            if (k < 0.5) this.drawClip(prev, 1 - k * 2, camX, camY, camScale);
            else this.drawClip(c, (k - 0.5) * 2, camX, camY, camScale);
            break;
          case "slide-left":
            this.drawClip(prev, 1, -W * e + camX, camY, camScale);
            this.drawClip(c, 1, W * (1 - e) + camX, camY, camScale);
            break;
          case "slide-up":
            this.drawClip(prev, 1, camX, -H * e + camY, camScale);
            this.drawClip(c, 1, camX, H * (1 - e) + camY, camScale);
            break;
          case "zoom":
            this.drawClip(prev, 1 - e, camX, camY, camScale * (1 + e * 0.5));
            this.drawClip(c, e, camX, camY, camScale * (1.3 - 0.3 * e));
            break;
          case "wipe":
            this.drawClip(prev, 1, camX, camY, camScale);
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, W * e, H);
            ctx.clip();
            this.drawClip(c, 1, camX, camY, camScale);
            ctx.restore();
            break;
        }
      } else this.drawClip(c, 1, camX, camY, camScale);
    }

    for (const m of p.motions) if (t >= m.start && t < m.end) this.drawMotion(m, t, W, H, totalDuration(p));
    for (const x of p.texts) if (t >= x.start && t < x.end) this.drawText(x, t, W, H);
    ctx.restore();
  }

  private drawMotion(m: MotionItem, t: number, W: number, H: number, dur: number) {
    const { ctx } = this;
    const k = (t - m.start) / Math.max(0.01, m.end - m.start);
    const I = m.intensity;
    ctx.save();
    switch (m.preset) {
      case "vignette": {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${0.85 * I})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case "flash":
        ctx.fillStyle = m.color;
        ctx.globalAlpha = I * Math.pow(1 - k, 2);
        ctx.fillRect(0, 0, W, H);
        break;
      case "progress-bar":
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(0, 0, W, 10);
        ctx.fillStyle = m.color;
        ctx.fillRect(0, 0, W * (dur ? t / dur : 0), 10);
        break;
      case "letterbox": {
        const b = H * 0.12 * I * ease(Math.min(1, k * 4));
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, b);
        ctx.fillRect(0, H - b, W, b);
        break;
      }
      case "grain":
        ctx.globalAlpha = 0.18 * I;
        for (let i = 0; i < 900; i++) {
          ctx.fillStyle = rand(i + t * 97) > 0.5 ? "#fff" : "#000";
          ctx.fillRect(rand(i * 3 + t * 31) * W, rand(i * 7 + t * 17) * H, 2, 2);
        }
        break;
      case "light-leak": {
        const x = W * (0.2 + 0.6 * k),
          y = H * 0.3;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.7);
        g.addColorStop(0, m.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.55 * I * Math.sin(Math.PI * k);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case "confetti": {
        const colors = [m.color, "#ffd23f", "#3bceac", "#ee4266", "#540d6e", "#ffffff"];
        const n = Math.round(140 * I);
        const life = m.end - m.start;
        for (let i = 0; i < n; i++) {
          const x0 = rand(i) * W;
          const delay = rand(i + 50) * 0.3 * life;
          const local = t - m.start - delay;
          if (local < 0) continue;
          const y = -20 + local * (H * (0.35 + rand(i + 9) * 0.4));
          const x = x0 + Math.sin(local * 3 + i) * 40;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(local * (2 + rand(i + 3) * 6));
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillRect(-8, -4, 16, 8);
          ctx.restore();
        }
        break;
      }
      default:
        break; // camera presets handled in draw()
    }
    ctx.restore();
  }

  private drawText(x: TextItem, t: number, W: number, H: number) {
    const { ctx } = this;
    const local = t - x.start;
    const remain = x.end - t;
    const inK = clamp(local / 0.4, 0, 1);
    const outK = clamp(remain / 0.3, 0, 1);
    let alpha = 1,
      scale = 1,
      dy = 0,
      text = x.text;
    switch (x.anim) {
      case "fade":
        alpha = Math.min(inK, outK);
        break;
      case "pop":
        scale = inK < 1 ? 0.6 + 0.4 * ease(inK) + Math.sin(inK * Math.PI) * 0.12 : 1;
        alpha = Math.min(1, inK * 3) * outK;
        break;
      case "slide-up":
        dy = (1 - ease(inK)) * H * 0.05;
        alpha = inK * outK;
        break;
      case "bounce":
        dy = -Math.abs(Math.sin(local * 4)) * H * 0.012;
        alpha = outK;
        break;
      case "typewriter":
        text = x.text.slice(0, Math.ceil(x.text.length * clamp(local / Math.max(0.3, x.text.length * 0.05), 0, 1)));
        break;
    }
    const size = Math.round(x.size * H);
    const weight = x.style === "title" || x.font === "display" ? 800 : 650;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${size}px ${FONTS[x.font]}`;
    ctx.textAlign = x.style === "lower-third" ? "left" : "center";
    ctx.textBaseline = "middle";
    const lines = wrap(ctx, text, W * 0.86);
    const lh = size * 1.18;
    const cx = x.style === "lower-third" ? W * 0.06 : x.x * W;
    const cy = x.y * H + dy;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    const top = (-(lines.length - 1) * lh) / 2;
    if (x.bg) {
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
      const padX = size * 0.4,
        padY = size * 0.25;
      ctx.fillStyle = x.bg;
      const bx = ctx.textAlign === "left" ? -padX : -widest / 2 - padX;
      roundRect(ctx, bx, top - lh / 2 - padY, widest + padX * 2, lines.length * lh + padY * 2, size * 0.25);
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = size * 0.2;
      ctx.lineWidth = Math.max(2, size * 0.08);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      lines.forEach((l, i) => ctx.strokeText(l, 0, top + i * lh));
    }
    ctx.fillStyle = x.color;
    ctx.shadowBlur = 0;
    lines.forEach((l, i) => ctx.fillText(l, 0, top + i * lh));
    ctx.restore();
  }

  // ---------- frame capture for the AI ----------
  async snapshot(t: number, maxW = 384): Promise<string> {
    const was = this.playing;
    if (was) this.pause();
    this.seek(t);
    const pl = clipAt(this.project, t);
    const el = pl ? this.videos.get(pl.clip.id) : undefined;
    if (el && pl) {
      el.currentTime = sourceTime(pl, t);
      await new Promise<void>((r) => {
        const done = () => r();
        el.addEventListener("seeked", done, { once: true });
        setTimeout(done, 1200);
      });
    }
    this.draw(t);
    const s = Math.min(1, maxW / this.canvas.width);
    const c = document.createElement("canvas");
    c.width = Math.round(this.canvas.width * s);
    c.height = Math.round(this.canvas.height * s);
    c.getContext("2d")!.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.75);
  }

  // ---------- export ----------
  async export(onProgress: (p: number) => void): Promise<Blob> {
    const dur = totalDuration(this.project);
    if (dur <= 0) throw new Error("Nothing to export yet");
    await this.ensureAudio();
    this.pause();
    this.seek(0);
    const stream = this.canvas.captureStream(30);
    this.recordDest?.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const types = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    const mimeType = types.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // Let parked elements reach their first frames.
    await new Promise((r) => setTimeout(r, 400));
    return new Promise((resolve, reject) => {
      rec.onstop = () => {
        this.exporting = false;
        this.onExportTick = this.onExportDone = null;
        resolve(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
      };
      rec.onerror = () => reject(new Error("Recording failed"));
      this.onExportTick = onProgress;
      this.onExportDone = () => setTimeout(() => rec.state !== "inactive" && rec.stop(), 150);
      this.exporting = true;
      rec.start(250);
      void this.play();
    });
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > max && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let engine: Engine | null = null;
export const getEngine = () => engine;
export const setEngine = (e: Engine) => (engine = e);
