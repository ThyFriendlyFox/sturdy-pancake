import type { ReactNode } from "react";
import { layout } from "../model";
import { store, useStore } from "../store";
import { getEngine } from "../engine";

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 0.01, format = (v) => v.toFixed(2), onChange } = props;
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <span className="mono">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export function Chips<T extends string>(props: { options: readonly T[]; value: T | null; onChange: (v: T) => void; label?: (v: T) => string }) {
  return (
    <div className="chips">
      {props.options.map((o) => (
        <button key={o} className={"chip" + (o === props.value ? " on" : "")} onClick={() => props.onChange(o)}>
          {props.label ? props.label(o) : o}
        </button>
      ))}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Picks which clip a panel edits. Defaults to the selected clip, else the one under the playhead. */
export function useActiveClip() {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selectedClipId);
  const time = useStore((s) => s.time);
  const l = layout(project);
  const byId = l.find((p) => p.clip.id === sel);
  const under = l.find((p) => time >= p.start && time < p.end) ?? l[l.length - 1];
  return byId ?? under ?? null;
}

export function ClipPicker() {
  const project = useStore((s) => s.project);
  const media = useStore((s) => s.media);
  const active = useActiveClip();
  if (!project.clips.length) return null;
  return (
    <div className="chips scroll">
      {project.clips.map((c, i) => (
        <button
          key={c.id}
          className={"chip" + (active?.clip.id === c.id ? " on" : "")}
          onClick={() => {
            store.set({ selectedClipId: c.id });
            const pl = layout(store.get().project).find((p) => p.clip.id === c.id);
            if (pl) getEngine()?.seek(pl.start + 0.01);
          }}
        >
          {i + 1}. {media.find((m) => m.id === c.mediaId)?.name ?? "clip"}
        </button>
      ))}
    </div>
  );
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};
