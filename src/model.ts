// Project data. Plain JSON only: the AI reads it, the store snapshots it, telemetry logs it.

export type MediaKind = "video" | "audio" | "image";

export interface Media {
  id: string;
  name: string;
  kind: MediaKind;
  duration: number; // seconds (images: 0)
  width: number;
  height: number;
}

export type TransitionType = "none" | "fade" | "dip-black" | "slide-left" | "slide-up" | "zoom" | "wipe";

export interface Filters {
  brightness: number; // 1 = normal
  contrast: number; // 1 = normal
  saturation: number; // 1 = normal
  blur: number; // px
  hue: number; // degrees
  sepia: number; // 0..1
}

export interface Clip {
  id: string;
  mediaId: string;
  in: number; // source seconds
  out: number; // source seconds
  speed: number; // 1 = normal
  volume: number; // 0..2
  filters: Filters;
  transition: { type: TransitionType; duration: number }; // transition INTO this clip
  zoom: number; // 1 = cover fit
}

export interface Voiceover {
  id: string;
  mediaId: string;
  start: number; // timeline seconds
  in: number;
  out: number;
  volume: number;
}

export interface VoiceTrack {
  volume: number; // 0..2, applies to clip audio + voiceovers
  muted: boolean;
  pitch: number; // semitones, -12..12
  voiceovers: Voiceover[];
}

export interface MusicTrack {
  mediaId: string | null;
  offset: number; // where in the song to start (seconds)
  volume: number;
  fadeIn: number;
  fadeOut: number;
  duck: boolean; // lower music under voiceovers
}

export type TextStyle = "title" | "caption" | "lower-third" | "label";
export type TextAnim = "none" | "fade" | "pop" | "slide-up" | "typewriter" | "bounce";

export interface TextItem {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number; // 0..1 center
  y: number; // 0..1 center
  size: number; // fraction of canvas height
  color: string;
  bg: string | null;
  style: TextStyle;
  anim: TextAnim;
  font: "sans" | "serif" | "mono" | "display";
}

export type MotionPreset =
  | "confetti"
  | "progress-bar"
  | "vignette"
  | "flash"
  | "zoom-punch"
  | "shake"
  | "letterbox"
  | "grain"
  | "light-leak";

export interface MotionItem {
  id: string;
  preset: MotionPreset;
  start: number;
  end: number;
  color: string;
  intensity: number; // 0..1
}

export type Aspect = "9:16" | "1:1" | "4:5" | "16:9";

export interface Project {
  aspect: Aspect;
  background: string;
  clips: Clip[];
  voice: VoiceTrack;
  music: MusicTrack;
  texts: TextItem[];
  motions: MotionItem[];
}

export const IMAGE_DEFAULT_DURATION = 3;

export const defaultFilters = (): Filters => ({
  brightness: 1,
  contrast: 1,
  saturation: 1,
  blur: 0,
  hue: 0,
  sepia: 0,
});

export const emptyProject = (): Project => ({
  aspect: "9:16",
  background: "#000000",
  clips: [],
  voice: { volume: 1, muted: false, pitch: 0, voiceovers: [] },
  music: { mediaId: null, offset: 0, volume: 0.6, fadeIn: 0.5, fadeOut: 1.5, duck: true },
  texts: [],
  motions: [],
});

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 8);

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const aspectSize = (a: Aspect): [number, number] =>
  ({ "9:16": [720, 1280], "1:1": [1080, 1080], "4:5": [864, 1080], "16:9": [1280, 720] })[a] as [number, number];

export const clipLength = (c: Clip) => Math.max(0.05, (c.out - c.in) / c.speed);

export interface Placed {
  clip: Clip;
  index: number;
  start: number;
  end: number;
}

export function layout(p: Project): Placed[] {
  let t = 0;
  return p.clips.map((clip, index) => {
    const start = t;
    t += clipLength(clip);
    return { clip, index, start, end: t };
  });
}

export const totalDuration = (p: Project) => {
  const l = layout(p);
  const video = l.length ? l[l.length - 1].end : 0;
  const vo = p.voice.voiceovers.reduce((m, v) => Math.max(m, v.start + (v.out - v.in)), 0);
  const tx = p.texts.reduce((m, x) => Math.max(m, x.end), 0);
  return Math.max(video, vo, tx, 0);
};

export function clipAt(p: Project, t: number): Placed | null {
  const l = layout(p);
  for (const pl of l) if (t >= pl.start && t < pl.end) return pl;
  return l.length && t >= l[l.length - 1].end - 1e-6 ? l[l.length - 1] : null;
}

/** Source time inside a clip for a timeline time. */
export const sourceTime = (pl: Placed, t: number) => clamp(pl.clip.in + (t - pl.start) * pl.clip.speed, pl.clip.in, pl.clip.out);

export function newClip(m: Media): Clip {
  const out = m.kind === "image" ? IMAGE_DEFAULT_DURATION : m.duration;
  return {
    id: uid("c_"),
    mediaId: m.id,
    in: 0,
    out,
    speed: 1,
    volume: 1,
    filters: defaultFilters(),
    transition: { type: "none", duration: 0.4 },
    zoom: 1,
  };
}

/** Split the clip under timeline time t into two. Returns the new project (unchanged if nothing to split). */
export function splitAt(p: Project, t: number): Project {
  const pl = clipAt(p, t);
  if (!pl) return p;
  const s = sourceTime(pl, t);
  if (s - pl.clip.in < 0.05 || pl.clip.out - s < 0.05) return p;
  const a: Clip = { ...pl.clip, out: s };
  const b: Clip = { ...pl.clip, id: uid("c_"), in: s, transition: { type: "none", duration: pl.clip.transition.duration } };
  const clips = [...p.clips];
  clips.splice(pl.index, 1, a, b);
  return { ...p, clips };
}

/** Remove timeline range [a, b) from the video track, splitting clips as needed. */
export function deleteRange(p: Project, a: number, b: number): Project {
  if (b <= a) return p;
  let q = splitAt(splitAt(p, b), a);
  const keep = layout(q).filter((pl) => !(pl.start >= a - 1e-3 && pl.end <= b + 1e-3));
  q = { ...q, clips: keep.map((k) => k.clip) };
  return q;
}

export const FILTER_PRESETS: Record<string, Partial<Filters>> = {
  none: defaultFilters(),
  warm: { brightness: 1.05, contrast: 1.05, saturation: 1.15, hue: -8, sepia: 0.15 },
  cool: { brightness: 1, contrast: 1.05, saturation: 0.95, hue: 12, sepia: 0 },
  "black-white": { saturation: 0, contrast: 1.2, sepia: 0, hue: 0 },
  vintage: { brightness: 1.05, contrast: 0.9, saturation: 0.75, sepia: 0.45, hue: 0 },
  vivid: { brightness: 1.05, contrast: 1.15, saturation: 1.45, sepia: 0, hue: 0 },
  moody: { brightness: 0.85, contrast: 1.25, saturation: 0.8, sepia: 0.1, hue: 0 },
};

export const filterCss = (f: Filters) =>
  `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturation}) hue-rotate(${f.hue}deg) sepia(${f.sepia})` +
  (f.blur > 0 ? ` blur(${f.blur}px)` : "");

/** Short JSON the AI sees each turn. */
export function describe(p: Project, media: Media[], time: number, selectedClipId: string | null) {
  const l = layout(p);
  return {
    playhead: +time.toFixed(2),
    duration: +totalDuration(p).toFixed(2),
    aspect: p.aspect,
    selectedClipId,
    media: media.map((m) => ({ id: m.id, name: m.name, kind: m.kind, duration: +m.duration.toFixed(2) })),
    clips: l.map(({ clip: c, start, end }) => ({
      id: c.id,
      mediaId: c.mediaId,
      timeline: [+start.toFixed(2), +end.toFixed(2)],
      source: [+c.in.toFixed(2), +c.out.toFixed(2)],
      speed: c.speed,
      volume: c.volume,
      zoom: c.zoom,
      transition: c.transition.type === "none" ? undefined : c.transition,
      filters: JSON.stringify(c.filters) === JSON.stringify(defaultFilters()) ? undefined : c.filters,
    })),
    voice: p.voice,
    music: p.music,
    texts: p.texts,
    motions: p.motions,
  };
}
