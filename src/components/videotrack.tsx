import { clamp, newClip, uid } from "../model";
import { store, useStore } from "../store";
import { ClipPicker, Empty, Slider, useActiveClip } from "../ui/controls";
import { clipTarget, editFor, mapClips, resolveClips, type ComponentDef } from "./types";

const edit = editFor("video_track");

const ops = {
  move(src: "ai" | "user", clipId: string, toIndex: number) {
    edit("move_clip", src, { clipId, toIndex }, (p) => {
      const i = p.clips.findIndex((c) => c.id === clipId);
      if (i < 0) return p;
      const clips = [...p.clips];
      const [c] = clips.splice(i, 1);
      clips.splice(clamp(toIndex, 0, clips.length), 0, c);
      return { ...p, clips };
    });
  },
  remove(src: "ai" | "user", ids: string[]) {
    edit("remove_clip", src, { ids }, (p) => ({ ...p, clips: p.clips.filter((c) => !ids.includes(c.id)) }));
  },
  duplicate(src: "ai" | "user", clipId: string) {
    edit("duplicate_clip", src, { clipId }, (p) => {
      const i = p.clips.findIndex((c) => c.id === clipId);
      if (i < 0) return p;
      const clips = [...p.clips];
      clips.splice(i + 1, 0, { ...p.clips[i], id: uid("c_") });
      return { ...p, clips };
    });
  },
  set(src: "ai" | "user", tool: string, ids: string[], patch: { speed?: number; volume?: number; zoom?: number }, merge = false) {
    edit(tool, src, { ids, ...patch }, (p) => mapClips(p, ids, (c) => ({ ...c, ...patch })), merge);
  },
};

function Panel() {
  const clips = useStore((s) => s.project.clips);
  const active = useActiveClip();
  if (!clips.length) return <Empty>No clips yet. Open Media to add some.</Empty>;
  if (!active) return null;
  const c = active.clip;
  const i = active.index;
  return (
    <div className="stack">
      <ClipPicker />
      <div className="row">
        <button className="btn small" disabled={i === 0} onClick={() => ops.move("user", c.id, i - 1)}>← Move</button>
        <button className="btn small" disabled={i === clips.length - 1} onClick={() => ops.move("user", c.id, i + 1)}>Move →</button>
        <button className="btn small" onClick={() => ops.duplicate("user", c.id)}>Duplicate</button>
        <button className="btn small danger" onClick={() => ops.remove("user", [c.id])}>Delete</button>
      </div>
      <Slider label="Speed" min={0.25} max={4} step={0.05} value={c.speed} format={(v) => v.toFixed(2) + "×"} onChange={(v) => ops.set("user", "set_clip_speed", [c.id], { speed: v }, true)} />
      <Slider label="Clip volume" min={0} max={2} value={c.volume} format={(v) => Math.round(v * 100) + "%"} onChange={(v) => ops.set("user", "set_clip_volume", [c.id], { volume: v }, true)} />
      <Slider label="Zoom / crop" min={1} max={3} value={c.zoom} format={(v) => v.toFixed(2) + "×"} onChange={(v) => ops.set("user", "set_clip_zoom", [c.id], { zoom: v }, true)} />
    </div>
  );
}

export const videoTrackComponent: ComponentDef = {
  id: "video_track",
  title: "Video track",
  icon: "🎞",
  about: "The ordered list of video/photo clips. Add, remove, reorder, duplicate; set per-clip speed, volume and zoom.",
  tools: [
    {
      name: "add_clip",
      description: "Add a video or photo from the media library to the video track.",
      params: {
        mediaId: { type: "string" },
        index: { type: "integer", description: "0-based position; omit to append." },
        in: { type: "number", description: "Source start (s)" },
        out: { type: "number", description: "Source end (s); photos: display length" },
      },
      required: ["mediaId"],
      run: (a) => {
        const m = store.get().media.find((x) => x.id === a.mediaId);
        if (!m || m.kind === "audio") return "Not a video/photo media id";
        const c = newClip(m);
        if (a.in != null) c.in = clamp(+a.in, 0, m.duration || 1e4);
        if (a.out != null) c.out = m.kind === "image" ? Math.max(0.2, +a.out) : clamp(+a.out, c.in + 0.1, m.duration);
        edit("add_clip", "ai", a, (p) => {
          const clips = [...p.clips];
          clips.splice(a.index ?? clips.length, 0, c);
          return { ...p, clips };
        });
        return `Added clip ${c.id}`;
      },
    },
    {
      name: "remove_clip",
      description: "Remove clips from the video track.",
      params: { target: clipTarget },
      required: ["target"],
      run: ({ target }) => {
        const ids = resolveClips(target);
        ops.remove("ai", ids);
        return `Removed ${ids.length} clip(s)`;
      },
    },
    {
      name: "move_clip",
      description: "Move a clip to a new 0-based position.",
      params: { clipId: { type: "string" }, toIndex: { type: "integer" } },
      required: ["clipId", "toIndex"],
      run: ({ clipId, toIndex }) => (ops.move("ai", clipId, +toIndex), "Moved"),
    },
    {
      name: "duplicate_clip",
      description: "Duplicate a clip right after itself.",
      params: { clipId: { type: "string" } },
      required: ["clipId"],
      run: ({ clipId }) => (ops.duplicate("ai", clipId), "Duplicated"),
    },
    {
      name: "set_clip_props",
      description: "Set speed (0.25-4), volume (0-2) and/or zoom (1-3) for clips.",
      params: { target: clipTarget, speed: { type: "number" }, volume: { type: "number" }, zoom: { type: "number" } },
      required: ["target"],
      run: (a) => {
        const ids = resolveClips(a.target);
        const patch: Record<string, number> = {};
        if (a.speed != null) patch.speed = clamp(+a.speed, 0.25, 4);
        if (a.volume != null) patch.volume = clamp(+a.volume, 0, 2);
        if (a.zoom != null) patch.zoom = clamp(+a.zoom, 1, 3);
        ops.set("ai", "set_clip_props", ids, patch);
        return `Updated ${ids.length} clip(s)`;
      },
    },
  ],
  Panel,
};
