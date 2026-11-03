import { useEffect, useRef, useState } from "react";
import { getEngine } from "../engine";
import { EFFECT_NAMES, clamp, defaultEffect, type EffectName, type SubjectLayer } from "../model";
import { store, useStore } from "../store";
import { isolate, removeSubject, setEffect, stillOf, useSubjectStatus } from "../subjects";
import { Chips, Empty, Slider } from "../ui/controls";
import { editFor, type ComponentDef } from "./types";

const edit = editFor("subject");
const SWATCHES = ["#8B7BFF", "#FF5A6E", "#5AD1FF", "#FFD25A", "#FFFFFF"];

export const EFFECT_LABEL: Record<EffectName, string> = {
  glow: "Glow",
  trail: "Trail",
  spotlight: "Spotlight",
  recolor: "Recolor",
  erase: "Erase",
  freeze: "Freeze",
  clone: "Clone",
  sticker: "Sticker",
  follow: "Follow",
};

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {SWATCHES.map((c) => (
        <button
          key={c}
          className={"swatch" + (c === value ? " on" : "")}
          style={{ background: c }}
          aria-label={c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function EffectControls({ s, name }: { s: SubjectLayer; name: EffectName }) {
  const fx = s.effects[name] as Record<string, number | string> | undefined;
  if (!fx) return null;
  const set = (patch: Record<string, unknown>, merge = true) => setEffect(s.id, name, patch, "user", merge);
  const pct = (v: number) => Math.round(v * 100) + "%";
  switch (name) {
    case "glow":
      return (
        <>
          <Swatches value={fx.color as string} onChange={(c) => set({ color: c }, false)} />
          <Slider label="Strength" min={0} max={1} value={fx.strength as number} format={pct} onChange={(v) => set({ strength: v })} />
          <Slider
            label="Breathing"
            min={0}
            max={1}
            value={fx.breathing as number}
            format={(v) => (v < 0.05 ? "Steady" : pct(v))}
            onChange={(v) => set({ breathing: v })}
          />
        </>
      );
    case "trail":
      return (
        <>
          <Swatches value={fx.color as string} onChange={(c) => set({ color: c }, false)} />
          <Slider
            label="Length"
            min={2}
            max={12}
            step={1}
            value={fx.length as number}
            format={(v) => v + " copies"}
            onChange={(v) => set({ length: v })}
          />
          <p className="dim small">Shows while the video plays.</p>
        </>
      );
    case "spotlight":
      return <Slider label="Darken the rest" min={0} max={0.95} value={fx.dim as number} format={pct} onChange={(v) => set({ dim: v })} />;
    case "recolor":
      return (
        <Slider
          label="Color shift"
          min={-180}
          max={180}
          step={1}
          value={fx.hue as number}
          format={(v) => Math.round(v) + "°"}
          onChange={(v) => set({ hue: v })}
        />
      );
    case "erase":
      return (
        <>
          <Slider
            label="Blur"
            min={8}
            max={60}
            step={1}
            value={fx.blur as number}
            format={(v) => Math.round(v) + "px"}
            onChange={(v) => set({ blur: v })}
          />
          <p className="dim small">Blurs the subject away. It does not rebuild what is behind it.</p>
        </>
      );
    case "freeze":
      return <p className="dim small">A still copy from {(fx.at as number).toFixed(1)}s stays in place while the video plays.</p>;
    case "clone":
      return (
        <>
          <Slider label="Left / right" min={-0.6} max={0.6} value={fx.dx as number} format={pct} onChange={(v) => set({ dx: v })} />
          <Slider label="Up / down" min={-0.4} max={0.4} value={fx.dy as number} format={pct} onChange={(v) => set({ dy: v })} />
          <Slider
            label="Size"
            min={0.3}
            max={1.5}
            value={fx.scale as number}
            format={(v) => v.toFixed(2) + "×"}
            onChange={(v) => set({ scale: v })}
          />
        </>
      );
    case "sticker":
      return (
        <>
          <Slider label="Left / right" min={0} max={1} value={fx.x as number} format={pct} onChange={(v) => set({ x: v })} />
          <Slider label="Up / down" min={0} max={1} value={fx.y as number} format={pct} onChange={(v) => set({ y: v })} />
          <Slider label="Size" min={0.1} max={0.8} value={fx.scale as number} format={pct} onChange={(v) => set({ scale: v })} />
          <Slider
            label="Tilt"
            min={-30}
            max={30}
            step={1}
            value={fx.rotate as number}
            format={(v) => Math.round(v) + "°"}
            onChange={(v) => set({ rotate: v })}
          />
        </>
      );
    case "follow":
      return (
        <Slider
          label="Zoom"
          min={1.1}
          max={3}
          value={fx.zoom as number}
          format={(v) => v.toFixed(2) + "×"}
          onChange={(v) => set({ zoom: v })}
        />
      );
  }
}

export function Thumb({ id, size = 30 }: { id: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const status = useSubjectStatus(id);
  useEffect(() => {
    const still = stillOf(id);
    const c = ref.current;
    if (!still || !c) return;
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, c.width, c.height);
    const k = Math.min(c.width / still.width, c.height / still.height);
    x.drawImage(still, (c.width - still.width * k) / 2, (c.height - still.height * k) / 2, still.width * k, still.height * k);
  }, [id, status?.phase]);
  return <canvas ref={ref} width={size * 2} height={size * 2} className="thumb" style={{ width: size, height: size }} />;
}

export function SubjectStatusLine({ id }: { id: string }) {
  const st = useSubjectStatus(id);
  if (!st) return null;
  if (st.phase === "finding") return <span className="dim small">Finding it…</span>;
  if (st.phase === "following")
    return <span className="dim small">Following through the clip · {Math.round(st.progress * 100)}% · on this phone</span>;
  if (st.phase === "failed") return <span className="dim small">{st.error}</span>;
  return <span className="dim small">Followed, whole clip</span>;
}

export function SubjectPanel({ subjectId }: { subjectId?: string }) {
  const subjects = useStore((s) => s.project.subjects);
  const selected = useStore((s) => s.selectedSubjectId);
  const s = subjects.find((x) => x.id === (subjectId ?? selected)) ?? subjects.at(-1);
  const active = s ? (EFFECT_NAMES.filter((n) => s.effects[n]) as EffectName[]) : [];
  const [tab, setTab] = useState<EffectName | null>(null);
  if (!s) return <Empty>Tap something in the video to lift it out.</Empty>;
  const current = tab && active.includes(tab) ? tab : (active.at(-1) ?? null);
  const inactive = EFFECT_NAMES.filter((n) => !s.effects[n]);
  return (
    <div className="stack">
      <div className="row between">
        <span className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
          <Thumb id={s.id} />
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <b className="ellipsis">{s.name}</b>
            <SubjectStatusLine id={s.id} />
          </span>
        </span>
        <button className="btn small danger" onClick={() => removeSubject(s.id, "user")}>
          Remove
        </button>
      </div>
      {active.length > 0 && <Chips options={active} value={current} label={(n) => EFFECT_LABEL[n]} onChange={(n) => setTab(n)} />}
      {current && (
        <div className="stack card-inner">
          <EffectControls s={s} name={current} />
          <button className="btn small" onClick={() => setEffect(s.id, current, null, "user")}>
            Turn off {EFFECT_LABEL[current].toLowerCase()}
          </button>
        </div>
      )}
      {inactive.length > 0 && (
        <div className="chips">
          {inactive.map((n) => (
            <button
              key={n}
              className="chip"
              onClick={() => {
                setEffect(s.id, n, defaultEffect(n, s.t0) as Record<string, unknown>, "user");
                setTab(n);
              }}
            >
              + {EFFECT_LABEL[n]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const effectSchema = {
  type: "object",
  description:
    "Effect settings. glow {color, strength 0-1, breathing 0-1}; trail {color, length 2-12}; spotlight {dim 0-0.95}; recolor {hue -180..180}; erase {blur 8-60}; freeze {at source seconds}; clone {dx, dy -0.6..0.6, scale}; sticker {x, y 0-1, scale 0.1-0.8, rotate}; follow {zoom 1.1-3}. Omit fields to use defaults. null turns the effect off.",
};

export const subjectComponent: ComponentDef = {
  id: "subject",
  title: "Subject",
  icon: "◎",
  about:
    "Things the user tapped in the video (subject layers). Each is cut out on the phone and followed through its clip. Effects: " +
    EFFECT_NAMES.join(", ") +
    ".",
  tools: [
    {
      name: "isolate_subject",
      description:
        "Cut out the thing at a point of the frame and follow it through its clip (like the user tapping it). x, y are 0-1 of the video frame as seen in view_frame. Takes a few seconds.",
      params: {
        time: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        name: { type: "string", description: "What it is, e.g. 'Dog'" },
      },
      required: ["time", "x", "y"],
      run: async (a) => {
        const e = getEngine();
        e?.seek(+a.time);
        await new Promise((r) => setTimeout(r, 400));
        const hit = e?.toSource(+a.time, clamp(+a.x, 0, 1), clamp(+a.y, 0, 1));
        if (!hit) return "No clip at that point";
        const id = await isolate(hit.clipId, hit.sourceT, hit.point, "ai", a.name || "Subject");
        store.set({ selectedSubjectId: id });
        return `Isolated ${id}. Following it through the clip in the background.`;
      },
    },
    {
      name: "set_subject_effect",
      description: "Turn on or change an effect on a subject layer, or turn it off with settings null.",
      params: { id: { type: "string" }, effect: { type: "string", enum: [...EFFECT_NAMES] }, settings: effectSchema },
      required: ["id", "effect"],
      run: (a) => {
        if (!store.get().project.subjects.some((s) => s.id === a.id)) return "No such subject";
        setEffect(a.id, a.effect, a.settings === null ? null : (a.settings ?? {}), "ai");
        return a.settings === null ? `Turned off ${a.effect}` : `${a.effect} on`;
      },
    },
    {
      name: "rename_subject",
      description: "Name a subject layer (what it is).",
      params: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
      run: (a) => {
        edit("rename_subject", "ai", a, (p) => ({
          ...p,
          subjects: p.subjects.map((s) => (s.id === a.id ? { ...s, name: String(a.name).slice(0, 30) } : s)),
        }));
        return "Renamed";
      },
    },
    {
      name: "remove_subject",
      description: "Remove a subject layer and its effects.",
      params: { id: { type: "string" } },
      required: ["id"],
      run: (a) => (removeSubject(a.id, "ai"), "Removed"),
    },
  ],
  Panel: () => <SubjectPanel />,
};
