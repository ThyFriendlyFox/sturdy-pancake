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
import { keyframeAt, onSubjectsChange, stillOf } from "./subjects";
import type { SubjectLayer } from "./model";

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

  /** Bumped on every drawn frame; mirrors copy only when it changes. */
  frame = 0;
  private dirty = true;
  private lastDraw = 0;
  /** Ask for a redraw while paused (project edits, seeks, new masks, a decoded frame). */
  invalidate = () => {
    this.dirty = true;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    store.subscribe(this.invalidate);
    onSubjectsChange(this.invalidate);
    document.fonts?.ready.then(this.invalidate);
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

  /** True when the clip under the playhead has a frame to show. */
  hasFrame() {
    const pl = clipAt(this.project, this.t);
    return !pl || !!this.sourceFor(pl.clip);
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
    for (const [id, el] of this.videos) if (!ids.has(id)) el.pause(), this.videos.delete(id);
    for (const c of p.clips) {
      const m = store.get().media.find((x) => x.id === c.mediaId);
      if (!m) continue;
      const url = mediaUrl(m.id);
      if (!url) continue;
      if (m.kind === "image") {
        if (!this.images.has(m.id)) {
          const img = new Image();
          img.onload = this.invalidate;
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
        v.addEventListener("seeked", this.invalidate);
        v.addEventListener("loadeddata", this.invalidate);
        this.videos.set(c.id, v);
        this.route(v, this.voiceBus);
      }
    }
    const voIds = new Set(p.voice.voiceovers.map((v) => v.id));
    for (const [id, el] of this.vo) if (!voIds.has(id)) el.pause(), this.vo.delete(id);
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
      // The playing video is the clock: if decoding runs slow, follow it instead of seeking (seeks show black frames).
      const pl = clipAt(p, this.t - dt);
      const el = pl && this.videos.get(pl.clip.id);
      if (pl && el && !el.paused && !el.seeking && el.readyState >= 2) {
        const tv = pl.start + (el.currentTime - pl.clip.in) / pl.clip.speed;
        if (tv > pl.start && tv < pl.end - 0.02 && Math.abs(tv - this.t) < 1) this.t = tv;
      }
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

    // Paused: draw only when something changed. Playing: at most ~30 fps (video frames are 30 fps or less).
    const anim = this.playing || this.exporting;
    if ((anim && now - this.lastDraw >= 30) || (!anim && this.dirty)) {
      this.dirty = false;
      this.lastDraw = now;
      this.draw(t);
      this.frame++;
    }
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

  /** Where a clip's source lands on the canvas. Subject masks are drawn into the same rect. */
  private rectFor(c: Clip, src: CanvasImageSource, dx = 0, dy = 0, scale = 1) {
    const W = this.canvas.width,
      H = this.canvas.height;
    const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth;
    const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight;
    if (!sw || !sh) return null;
    const s = Math.max(W / sw, H / sh) * c.zoom * scale;
    const w = sw * s,
      h = sh * s;
    return { x: (W - w) / 2 + dx, y: (H - h) / 2 + dy, w, h };
  }

  private drawClip(c: Clip, alpha = 1, dx = 0, dy = 0, scale = 1) {
    const src = this.sourceFor(c);
    if (!src) return;
    const r = this.rectFor(c, src, dx, dy, scale);
    if (!r) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = filterCss(c.filters);
    ctx.drawImage(src, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  /** Canvas point (0..1) → the clip under the playhead and the same point in its source frame (0..1). */
  toSource(t: number, x: number, y: number) {
    const pl = clipAt(this.project, t);
    if (!pl) return null;
    const src = this.sourceFor(pl.clip);
    const r = src && this.rectFor(pl.clip, src);
    if (!r) return null;
    const sx = (x * this.canvas.width - r.x) / r.w,
      sy = (y * this.canvas.height - r.y) / r.h;
    if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return null;
    return { clipId: pl.clip.id, sourceT: sourceTime(pl, t), point: [sx, sy] as [number, number] };
  }

  /** Source point (0..1) of a clip → canvas point (0..1), ignoring camera moves. */
  toCanvas(clipId: string, sx: number, sy: number) {
    const c = this.project.clips.find((x) => x.id === clipId);
    const src = c && this.sourceFor(c);
    const r = c && src && this.rectFor(c, src);
    if (!r) return null;
    return { x: (r.x + sx * r.w) / this.canvas.width, y: (r.y + sy * r.h) / this.canvas.height };
  }

  // ---------- subject layers ----------
  private cut = document.createElement("canvas");
  private tmp = document.createElement("canvas");
  private trails = new Map<string, { t: number; frames: HTMLCanvasElement[] }>();
  private stickers = new Map<string, HTMLCanvasElement>();
  private followCam = { x: 0, y: 0, z: 1 };
  private drewOnce = false;

  private fit(c: HTMLCanvasElement) {
    if (c.width !== this.canvas.width || c.height !== this.canvas.height) {
      c.width = this.canvas.width;
      c.height = this.canvas.height;
    }
    const x = c.getContext("2d")!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "source-over";
    x.filter = "none";
    x.globalAlpha = 1;
    x.clearRect(0, 0, c.width, c.height);
    return x;
  }

  /** Follow camera: zoom in and keep the followed subject centered (smoothed). */
  private followOffset(p: Project, t: number, W: number, H: number) {
    const pl = clipAt(p, t);
    const target = { x: 0, y: 0, z: 1 };
    const s = pl && p.subjects.find((x) => x.clipId === pl.clip.id && x.effects.follow);
    if (pl && s) {
      const kf = keyframeAt(s.id, sourceTime(pl, t));
      const src = this.sourceFor(pl.clip);
      const z = s.effects.follow!.zoom;
      const r = src && this.rectFor(pl.clip, src, 0, 0, z);
      if (kf && r) {
        target.z = z;
        target.x = Math.max(-(r.w - W) / 2, Math.min((r.w - W) / 2, (0.5 - kf.stats.cx) * r.w));
        target.y = Math.max(-(r.h - H) / 2, Math.min((r.h - H) / 2, (0.5 - kf.stats.cy) * r.h));
      }
    }
    const k = this.playing ? 0.12 : 1;
    this.followCam.x += (target.x - this.followCam.x) * k;
    this.followCam.y += (target.y - this.followCam.y) * k;
    this.followCam.z += (target.z - this.followCam.z) * k;
    return this.followCam;
  }

  private drawSubjects(p: Project, t: number, camX: number, camY: number, camScale: number) {
    const pl = clipAt(p, t);
    if (!pl) return;
    const layers = p.subjects.filter((s) => s.clipId === pl.clip.id && Object.keys(s.effects).length);
    if (!layers.length) return;
    const src = this.sourceFor(pl.clip);
    const r = src && this.rectFor(pl.clip, src, camX, camY, camScale);
    if (!src || !r) return;
    const st = sourceTime(pl, t);
    for (const s of layers) {
      const kf = keyframeAt(s.id, st);
      if (!kf && !s.effects.freeze && !s.effects.sticker) continue;
      this.drawSubject(s, kf?.mask ?? null, src, r, pl.clip, t);
    }
  }

  private drawSubject(
    s: SubjectLayer,
    mask: HTMLCanvasElement | null,
    src: CanvasImageSource,
    r: { x: number; y: number; w: number; h: number },
    clip: Clip,
    t: number,
  ) {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;
    const fx = s.effects;
    if (mask) this.drawMasked(s, mask, src, r, clip, t);
    const still = fx.freeze || fx.sticker ? stillOf(s.id) : null;
    if (fx.freeze && still) ctx.drawImage(still, r.x, r.y, r.w, r.h);
    if (fx.sticker && still) {
      const st = this.stickerFor(s.id, still);
      const k = (fx.sticker.scale * H) / st.height;
      ctx.save();
      ctx.translate(fx.sticker.x * W, fx.sticker.y * H);
      ctx.rotate((fx.sticker.rotate * Math.PI) / 180);
      ctx.drawImage(st, (-st.width * k) / 2, (-st.height * k) / 2, st.width * k, st.height * k);
      ctx.restore();
    }
  }

  /** Effects that follow the live subject: they need this frame's mask. */
  private drawMasked(
    s: SubjectLayer,
    mask: HTMLCanvasElement,
    src: CanvasImageSource,
    r: { x: number; y: number; w: number; h: number },
    clip: Clip,
    t: number,
  ) {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;
    const fx = s.effects;
    // Cut-out of the subject in canvas space.
    const cx = this.fit(this.cut);
    cx.filter = filterCss(clip.filters);
    cx.drawImage(src, r.x, r.y, r.w, r.h);
    // The mask comes from a ~512 px frame; a small blur hides the stair-steps when it is scaled up.
    cx.filter = `blur(${Math.max(1, r.w / mask.width / 1.5).toFixed(1)}px)`;
    cx.globalCompositeOperation = "destination-in";
    cx.drawImage(mask, r.x, r.y, r.w, r.h);
    cx.filter = "none";

    if (fx.erase) {
      const tx = this.fit(this.tmp);
      tx.filter = `blur(${fx.erase.blur}px)`;
      tx.drawImage(src, r.x - 40, r.y, r.w + 80, r.h);
      tx.filter = "blur(10px)";
      tx.globalCompositeOperation = "destination-in";
      for (const [ox, oy] of [
        [0, 0],
        [8, 0],
        [-8, 0],
        [0, 8],
        [0, -8],
      ])
        tx.drawImage(mask, r.x + ox, r.y + oy, r.w, r.h);
      ctx.drawImage(this.tmp, 0, 0);
    }
    if (fx.spotlight) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${fx.spotlight.dim})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      if (!fx.erase) ctx.drawImage(this.cut, 0, 0);
    }
    if (fx.recolor && !fx.erase) {
      ctx.save();
      ctx.filter = `hue-rotate(${fx.recolor.hue}deg) saturate(1.4)`;
      ctx.drawImage(this.cut, 0, 0);
      ctx.restore();
    }
    if (fx.trail) {
      let tr = this.trails.get(s.id);
      if (!tr || Math.abs(t - tr.t) > 0.4 || t < tr.t) tr = { t, frames: [] };
      if (this.playing && t - tr.t >= 0.06) {
        const c = document.createElement("canvas");
        c.width = W / 2;
        c.height = H / 2;
        c.getContext("2d")!.drawImage(this.cut, 0, 0, W / 2, H / 2);
        tr.frames.push(c);
        if (tr.frames.length > fx.trail.length) tr.frames.shift();
        tr.t = t;
      } else if (!this.playing) tr.t = t;
      this.trails.set(s.id, tr);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      tr.frames.forEach((c, i) => {
        ctx.globalAlpha = ((i + 1) / (tr!.frames.length + 1)) * 0.55;
        ctx.filter = `grayscale(1) brightness(1.4) drop-shadow(0 0 8px ${fx.trail!.color})`;
        ctx.drawImage(c, 0, 0, W, H);
      });
      ctx.restore();
    }
    if (fx.clone) {
      const { dx, dy, scale } = fx.clone;
      ctx.save();
      ctx.translate(W / 2 + dx * W, H / 2 + dy * H);
      ctx.scale(scale, scale);
      ctx.drawImage(this.cut, -W / 2, -H / 2);
      ctx.restore();
    }
    if (fx.glow) {
      const breathe = 1 - fx.glow.breathing * 0.5 * (1 + Math.sin(t * Math.PI * 1.4));
      const blur = 6 + 34 * fx.glow.strength * breathe;
      ctx.save();
      ctx.shadowColor = fx.glow.color;
      ctx.shadowBlur = blur;
      ctx.drawImage(this.cut, 0, 0);
      ctx.shadowBlur = blur * 0.45;
      ctx.drawImage(this.cut, 0, 0);
      ctx.shadowColor = "rgba(255,255,255,0.9)";
      ctx.shadowBlur = 3;
      ctx.drawImage(this.cut, 0, 0);
      ctx.restore();
    }
  }

  /** Frozen cut-out cropped to its edges, with a white sticker border. */
  private stickerFor(id: string, still: HTMLCanvasElement) {
    const hit = this.stickers.get(id);
    if (hit) return hit;
    const d = still.getContext("2d")!.getImageData(0, 0, still.width, still.height).data;
    let x0 = still.width,
      y0 = still.height,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < still.height; y++)
      for (let x = 0; x < still.width; x++)
        if (d[(y * still.width + x) * 4 + 3] > 20) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    const pad = 10;
    const c = document.createElement("canvas");
    c.width = Math.max(1, x1 - x0 + pad * 2);
    c.height = Math.max(1, y1 - y0 + pad * 2);
    const x = c.getContext("2d")!;
    // White edge: the silhouette drawn white in a ring, then the cut-out on top.
    const sil = document.createElement("canvas");
    sil.width = c.width;
    sil.height = c.height;
    const sx = sil.getContext("2d")!;
    sx.drawImage(still, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
    sx.globalCompositeOperation = "source-in";
    sx.fillStyle = "#fff";
    sx.fillRect(0, 0, c.width, c.height);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) x.drawImage(sil, Math.cos(a) * 6, Math.sin(a) * 6);
    x.drawImage(still, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
    this.stickers.set(id, c);
    return c;
  }

  draw(t: number) {
    const p = this.project;
    const [W, H] = aspectSize(p.aspect);
    const { canvas, ctx } = this;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    // Mid-seek the element has no frame: keep the last drawn frame on screen instead of flashing black.
    const now = clipAt(p, t);
    if (now && !this.sourceFor(now.clip) && !this.exporting && this.drewOnce) return;
    this.drewOnce = true;
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

    const fc = this.followOffset(p, t, W, H);
    camX += fc.x;
    camY += fc.y;
    camScale *= fc.z;

    const pl = clipAt(p, t);
    let inTransition = false;
    if (pl) {
      const c = pl.clip;
      const tr = c.transition;
      const prev = pl.index > 0 ? p.clips[pl.index - 1] : null;
      const k = tr.duration > 0 ? (t - pl.start) / tr.duration : 1;
      if (prev && tr.type !== "none" && k < 1) {
        inTransition = true;
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
    if (!inTransition) this.drawSubjects(p, t, camX, camY, camScale);

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
