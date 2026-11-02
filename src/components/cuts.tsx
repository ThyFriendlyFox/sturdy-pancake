import { useState } from "react";
import { clamp, deleteRange, layout, splitAt, totalDuration } from "../model";
import { store, useStore } from "../store";
import { ClipPicker, Empty, Slider, fmtTime, useActiveClip } from "../ui/controls";
import { editFor, mapClips, type ComponentDef } from "./types";

const edit = editFor("cuts");

function trim(src: "ai" | "user", clipId: string, inT: number | undefined, outT: number | undefined, merge = false) {
  const s = store.get();
  const c = s.project.clips.find((x) => x.id === clipId);
  if (!c) return "No such clip";
  const m = s.media.find((x) => x.id === c.mediaId);
  const max = m?.kind === "image" ? 600 : (m?.duration ?? c.out);
  const ni = clamp(inT ?? c.in, 0, max - 0.1);
  const no = clamp(outT ?? c.out, ni + 0.1, max);
  edit("trim_clip", src, { clipId, in: ni, out: no }, (p) => mapClips(p, [clipId], (x) => ({ ...x, in: ni, out: no })), merge);
  return `Clip now uses ${ni.toFixed(2)}–${no.toFixed(2)}s of its source`;
}

function Panel() {
  const active = useActiveClip();
  const media = useStore((s) => s.media);
  const time = useStore((s) => s.time);
  const dur = useStore((s) => totalDuration(s.project));
  const [range, setRange] = useState<[number, number] | null>(null);
  if (!active) return <Empty>No clips to cut yet.</Empty>;
  const c = active.clip;
  const m = media.find((x) => x.id === c.mediaId);
  const max = m?.kind === "image" ? Math.max(10, c.out * 2) : (m?.duration ?? c.out);
  return (
    <div className="stack">
      <ClipPicker />
      <Slider label="Start (trim in)" min={0} max={max} step={0.05} value={c.in} format={fmtTime} onChange={(v) => trim("user", c.id, v, undefined, true)} />
      <Slider label={m?.kind === "image" ? "Length" : "End (trim out)"} min={0} max={max} step={0.05} value={c.out} format={fmtTime} onChange={(v) => trim("user", c.id, undefined, v, true)} />
      <div className="row">
        <button className="btn" onClick={() => edit("split_at", "user", { time }, (p) => splitAt(p, time))}>
          ✂ Split at {fmtTime(time)}
        </button>
        <button className="btn" onClick={() => setRange(range ? null : [time, Math.min(dur, time + 1)])}>
          Cut out a section…
        </button>
      </div>
      {range && (
        <div className="stack card-inner">
          <Slider label="From" min={0} max={dur} step={0.05} value={range[0]} format={fmtTime} onChange={(v) => setRange([v, Math.max(v, range[1])])} />
          <Slider label="To" min={0} max={dur} step={0.05} value={range[1]} format={fmtTime} onChange={(v) => setRange([Math.min(v, range[0]), v])} />
          <button
            className="btn danger"
            onClick={() => {
              edit("delete_range", "user", { start: range[0], end: range[1] }, (p) => deleteRange(p, range[0], range[1]));
              setRange(null);
            }}
          >
            Delete {fmtTime(range[0])} – {fmtTime(range[1])}
          </button>
        </div>
      )}
    </div>
  );
}

export const cutsComponent: ComponentDef = {
  id: "cuts",
  title: "Cuts & trims",
  icon: "✂",
  about: "Trim a clip's in/out points, split a clip at a time, or delete a section of the timeline.",
  tools: [
    {
      name: "trim_clip",
      description: "Set which part of the source a clip uses (source seconds). For photos, out = display length.",
      params: { clipId: { type: "string" }, in: { type: "number" }, out: { type: "number" } },
      required: ["clipId"],
      run: (a) => trim("ai", a.clipId, a.in ?? undefined, a.out ?? undefined),
    },
    {
      name: "split_at",
      description: "Split the clip under a timeline time into two clips.",
      params: { time: { type: "number" } },
      required: ["time"],
      run: ({ time }) => {
        const before = store.get().project.clips.length;
        edit("split_at", "ai", { time }, (p) => splitAt(p, +time));
        return store.get().project.clips.length > before ? "Split" : "Nothing to split there";
      },
    },
    {
      name: "delete_range",
      description: "Delete a timeline range [start, end) from the video track (ripple delete).",
      params: { start: { type: "number" }, end: { type: "number" } },
      required: ["start", "end"],
      run: ({ start, end }) => {
        edit("delete_range", "ai", { start, end }, (p) => deleteRange(p, +start, +end));
        const l = layout(store.get().project);
        return `Deleted. ${l.length} clip(s), ${l.at(-1)?.end.toFixed(2) ?? 0}s long.`;
      },
    },
  ],
  Panel,
};
