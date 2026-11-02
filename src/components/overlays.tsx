import { useState } from "react";
import { clamp, totalDuration, uid, type MotionItem, type MotionPreset, type TextAnim, type TextItem, type TextStyle } from "../model";
import { store, useStore } from "../store";
import { Chips, Empty, Slider, fmtTime } from "../ui/controls";
import { editFor, type ComponentDef } from "./types";

// ---------- text ----------
const editX = editFor("text");
const STYLES: TextStyle[] = ["title", "caption", "lower-third", "label"];
const ANIMS: TextAnim[] = ["none", "fade", "pop", "slide-up", "typewriter", "bounce"];
const FONTS: TextItem["font"][] = ["sans", "serif", "mono", "display"];

const STYLE_DEFAULTS: Record<TextStyle, Partial<TextItem>> = {
  title: { x: 0.5, y: 0.42, size: 0.07, bg: null, anim: "pop", font: "display" },
  caption: { x: 0.5, y: 0.8, size: 0.04, bg: "rgba(0,0,0,0.65)", anim: "fade", font: "sans" },
  "lower-third": { x: 0.06, y: 0.84, size: 0.035, bg: "#ff3b6b", anim: "slide-up", font: "sans" },
  label: { x: 0.5, y: 0.12, size: 0.03, bg: "#ffffff", color: "#111111", anim: "fade", font: "sans" },
};

function makeText(a: Partial<TextItem>): TextItem {
  const style = (STYLES.includes(a.style as TextStyle) ? a.style : "title") as TextStyle;
  const t = store.get().time;
  const base: TextItem = { id: uid("t_"), text: "Text", start: t, end: t + 3, x: 0.5, y: 0.5, size: 0.06, color: "#ffffff", bg: null, style, anim: "fade", font: "sans", ...STYLE_DEFAULTS[style] };
  return sanitize({ ...base, ...stripUndef(a) });
}
const stripUndef = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const sanitize = (x: TextItem): TextItem => ({ ...x, size: clamp(x.size, 0.015, 0.2), x: clamp(x.x, 0, 1), y: clamp(x.y, 0, 1), end: Math.max(x.start + 0.2, x.end) });

const updateText = (src: "ai" | "user", id: string, patch: Partial<TextItem>, merge = false) =>
  editX("update_text", src, { id, ...patch }, (p) => ({ ...p, texts: p.texts.map((x) => (x.id === id ? sanitize({ ...x, ...stripUndef(patch) }) : x)) }), merge);

function TextPanel() {
  const texts = useStore((s) => s.project.texts);
  const dur = useStore((s) => Math.max(1, totalDuration(s.project)));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = texts.find((x) => x.id === openId) ?? texts.at(-1);
  return (
    <div className="stack">
      <div className="row">
        {STYLES.map((s) => (
          <button
            key={s}
            className="btn small"
            onClick={() => {
              const x = makeText({ style: s, text: s === "lower-third" ? "Your Name" : s === "caption" ? "Caption text" : "Title" });
              editX("add_text", "user", x, (p) => ({ ...p, texts: [...p.texts, x] }));
              setOpenId(x.id);
            }}
          >
            + {s}
          </button>
        ))}
      </div>
      {!texts.length && <Empty>No text yet.</Empty>}
      {texts.length > 1 && (
        <div className="chips scroll">
          {texts.map((x) => (
            <button key={x.id} className={"chip" + (x.id === open?.id ? " on" : "")} onClick={() => setOpenId(x.id)}>
              {x.text.slice(0, 16)}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="stack card-inner">
          <textarea value={open.text} rows={2} onChange={(e) => updateText("user", open.id, { text: e.target.value }, true)} />
          <Chips options={STYLES} value={open.style} onChange={(s) => updateText("user", open.id, { style: s, ...STYLE_DEFAULTS[s] })} />
          <Chips options={ANIMS} value={open.anim} onChange={(a) => updateText("user", open.id, { anim: a })} />
          <Chips options={FONTS} value={open.font} onChange={(f) => updateText("user", open.id, { font: f })} />
          <div className="row">
            <label className="color">Text <input type="color" value={open.color} onChange={(e) => updateText("user", open.id, { color: e.target.value }, true)} /></label>
            <label className="color">
              Box <input type="color" value={open.bg && open.bg.startsWith("#") ? open.bg : "#000000"} onChange={(e) => updateText("user", open.id, { bg: e.target.value }, true)} />
            </label>
            <button className="btn small" onClick={() => updateText("user", open.id, { bg: null })}>No box</button>
          </div>
          <Slider label="Size" min={0.015} max={0.2} step={0.005} value={open.size} format={(v) => Math.round(v * 1000) / 10 + "%"} onChange={(v) => updateText("user", open.id, { size: v }, true)} />
          <Slider label="Up / down" min={0} max={1} value={open.y} format={(v) => Math.round(v * 100) + "%"} onChange={(v) => updateText("user", open.id, { y: v }, true)} />
          <Slider label="Left / right" min={0} max={1} value={open.x} format={(v) => Math.round(v * 100) + "%"} onChange={(v) => updateText("user", open.id, { x: v }, true)} />
          <Slider label="Show from" min={0} max={dur} step={0.05} value={open.start} format={fmtTime} onChange={(v) => updateText("user", open.id, { start: v, end: Math.max(open.end, v + 0.2) }, true)} />
          <Slider label="Show until" min={0} max={dur} step={0.05} value={open.end} format={fmtTime} onChange={(v) => updateText("user", open.id, { end: v }, true)} />
          <button className="btn small danger" onClick={() => editX("remove_text", "user", { id: open.id }, (p) => ({ ...p, texts: p.texts.filter((x) => x.id !== open.id) }))}>
            Delete text
          </button>
        </div>
      )}
    </div>
  );
}

const textProps = {
  text: { type: "string" },
  start: { type: "number" },
  end: { type: "number" },
  style: { type: "string", enum: STYLES },
  anim: { type: "string", enum: ANIMS },
  font: { type: "string", enum: FONTS },
  x: { type: "number", description: "0-1 horizontal center" },
  y: { type: "number", description: "0-1 vertical center (0=top)" },
  size: { type: "number", description: "fraction of video height, 0.015-0.2" },
  color: { type: "string", description: "CSS color" },
  bg: { type: ["string", "null"], description: "box color or null" },
};

export const textComponent: ComponentDef = {
  id: "text",
  title: "Text & captions",
  icon: "T",
  about: "Titles, captions, lower-thirds and labels with animations (" + ANIMS.join(", ") + ").",
  tools: [
    {
      name: "add_text",
      description: "Add a text overlay. Style sets sensible position/size defaults.",
      params: textProps,
      required: ["text", "start", "end"],
      run: (a) => {
        const x = makeText(a);
        editX("add_text", "ai", x, (p) => ({ ...p, texts: [...p.texts, x] }));
        return `Added text ${x.id}`;
      },
    },
    {
      name: "update_text",
      description: "Change any field of an existing text overlay.",
      params: { id: { type: "string" }, ...textProps },
      required: ["id"],
      run: ({ id, ...rest }) => (updateText("ai", id, rest), "Updated"),
    },
    {
      name: "remove_text",
      description: "Remove a text overlay.",
      params: { id: { type: "string" } },
      required: ["id"],
      run: ({ id }) => (editX("remove_text", "ai", { id }, (p) => ({ ...p, texts: p.texts.filter((x) => x.id !== id) })), "Removed"),
    },
  ],
  Panel: TextPanel,
};

// ---------- motion graphics ----------
const editG = editFor("motion");
const PRESETS: MotionPreset[] = ["confetti", "flash", "zoom-punch", "shake", "vignette", "letterbox", "grain", "light-leak", "progress-bar"];
const WHOLE_VIDEO: MotionPreset[] = ["vignette", "letterbox", "grain", "progress-bar"];

function makeMotion(a: Partial<MotionItem>): MotionItem {
  const preset = (PRESETS.includes(a.preset as MotionPreset) ? a.preset : "confetti") as MotionPreset;
  const t = store.get().time;
  const whole = WHOLE_VIDEO.includes(preset);
  const dur = totalDuration(store.get().project);
  const len = preset === "flash" ? 0.4 : preset === "zoom-punch" || preset === "shake" ? 0.5 : 2.5;
  return {
    id: uid("g_"),
    preset,
    start: a.start ?? (whole ? 0 : t),
    end: a.end ?? (whole ? Math.max(dur, 1) : t + len),
    color: a.color ?? (preset === "light-leak" ? "#ff9a3c" : preset === "progress-bar" ? "#ff3b6b" : "#ffffff"),
    intensity: clamp(a.intensity ?? 0.7, 0, 1),
  };
}

function MotionPanel() {
  const motions = useStore((s) => s.project.motions);
  const dur = useStore((s) => Math.max(1, totalDuration(s.project)));
  const update = (id: string, patch: Partial<MotionItem>, merge = false) =>
    editG("update_motion", "user", { id, ...patch }, (p) => ({ ...p, motions: p.motions.map((m) => (m.id === id ? { ...m, ...patch } : m)) }), merge);
  return (
    <div className="stack">
      <div className="chips">
        {PRESETS.map((pr) => (
          <button
            key={pr}
            className="chip"
            onClick={() => {
              const m = makeMotion({ preset: pr });
              editG("add_motion", "user", m, (p) => ({ ...p, motions: [...p.motions, m] }));
            }}
          >
            + {pr}
          </button>
        ))}
      </div>
      {!motions.length && <Empty>Tap an effect to add it at the playhead.</Empty>}
      {motions.map((m) => (
        <div key={m.id} className="card-inner stack">
          <div className="row between">
            <b>✦ {m.preset}</b>
            <span className="row">
              <input type="color" value={m.color} onChange={(e) => update(m.id, { color: e.target.value }, true)} />
              <button className="btn small danger" onClick={() => editG("remove_motion", "user", { id: m.id }, (p) => ({ ...p, motions: p.motions.filter((x) => x.id !== m.id) }))}>
                Remove
              </button>
            </span>
          </div>
          <Slider label="Strength" min={0} max={1} value={m.intensity} format={(v) => Math.round(v * 100) + "%"} onChange={(v) => update(m.id, { intensity: v }, true)} />
          <Slider label="From" min={0} max={dur} step={0.05} value={m.start} format={fmtTime} onChange={(v) => update(m.id, { start: v, end: Math.max(m.end, v + 0.1) }, true)} />
          <Slider label="Until" min={0} max={dur} step={0.05} value={m.end} format={fmtTime} onChange={(v) => update(m.id, { end: Math.max(m.start + 0.1, v) }, true)} />
        </div>
      ))}
    </div>
  );
}

export const motionComponent: ComponentDef = {
  id: "motion",
  title: "Motion graphics",
  icon: "✦",
  about: "Animated effects over the video: " + PRESETS.join(", ") + ". zoom-punch and shake move the camera; vignette/letterbox/grain/progress-bar default to the whole video.",
  tools: [
    {
      name: "add_motion",
      description: "Add a motion graphic effect over a time range.",
      params: {
        preset: { type: "string", enum: PRESETS },
        start: { type: "number" },
        end: { type: "number" },
        color: { type: "string" },
        intensity: { type: "number", description: "0-1" },
      },
      required: ["preset"],
      run: (a) => {
        const m = makeMotion(a);
        editG("add_motion", "ai", m, (p) => ({ ...p, motions: [...p.motions, m] }));
        return `Added ${m.preset} ${m.id} (${m.start.toFixed(2)}-${m.end.toFixed(2)}s)`;
      },
    },
    {
      name: "update_motion",
      description: "Change a motion graphic.",
      params: { id: { type: "string" }, start: { type: "number" }, end: { type: "number" }, color: { type: "string" }, intensity: { type: "number" } },
      required: ["id"],
      run: ({ id, ...rest }) => {
        const patch = stripUndef(rest) as Partial<MotionItem>;
        editG("update_motion", "ai", { id, ...patch }, (p) => ({ ...p, motions: p.motions.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
        return "Updated";
      },
    },
    {
      name: "remove_motion",
      description: "Remove a motion graphic.",
      params: { id: { type: "string" } },
      required: ["id"],
      run: ({ id }) => (editG("remove_motion", "ai", { id }, (p) => ({ ...p, motions: p.motions.filter((m) => m.id !== id) })), "Removed"),
    },
  ],
  Panel: MotionPanel,
};
