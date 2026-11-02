import { FILTER_PRESETS, clamp, defaultFilters, type Filters, type TransitionType } from "../model";
import { ClipPicker, Chips, Empty, Row, Slider, useActiveClip } from "../ui/controls";
import { clipTarget, editFor, mapClips, resolveClips, type ComponentDef } from "./types";

// ---------- transitions ----------
const editT = editFor("transitions");
const TYPES: TransitionType[] = ["none", "fade", "dip-black", "slide-left", "slide-up", "zoom", "wipe"];

function setTransition(src: "ai" | "user", ids: string[], type?: TransitionType, duration?: number, merge = false) {
  editT(
    "set_transition",
    src,
    { ids, type, duration },
    (p) =>
      mapClips(p, ids, (c) => ({
        ...c,
        transition: { type: type ?? c.transition.type, duration: clamp(duration ?? c.transition.duration, 0.1, 2) },
      })),
    merge,
  );
}

function TransitionsPanel() {
  const active = useActiveClip();
  if (!active) return <Empty>Add at least two clips to use transitions.</Empty>;
  const c = active.clip;
  return (
    <div className="stack">
      <ClipPicker />
      {active.index === 0 && <p className="dim small">The first clip has nothing before it; transitions play into clips 2 and later.</p>}
      <Chips options={TYPES} value={c.transition.type} onChange={(t) => setTransition("user", [c.id], t)} />
      <Slider
        label="Length"
        min={0.1}
        max={2}
        step={0.05}
        value={c.transition.duration}
        format={(v) => v.toFixed(2) + "s"}
        onChange={(v) => setTransition("user", [c.id], undefined, v, true)}
      />
      <button className="btn small" onClick={() => setTransition("user", resolveClips("all"), c.transition.type, c.transition.duration)}>
        Use on every clip
      </button>
    </div>
  );
}

export const transitionsComponent: ComponentDef = {
  id: "transitions",
  title: "Transitions",
  icon: "⧉",
  about: "How each clip enters from the previous one: " + TYPES.join(", ") + ".",
  tools: [
    {
      name: "set_transition",
      description: "Set the transition INTO clips (from the previous clip).",
      params: { target: clipTarget, type: { type: "string", enum: TYPES }, duration: { type: "number", description: "0.1-2 s" } },
      required: ["target", "type"],
      run: (a) => {
        const ids = resolveClips(a.target);
        setTransition("ai", ids, a.type, a.duration);
        return `Set ${a.type} on ${ids.length} clip(s)`;
      },
    },
  ],
  Panel: TransitionsPanel,
};

// ---------- color ----------
const editC = editFor("color");
const PRESETS = Object.keys(FILTER_PRESETS);

function setFilters(src: "ai" | "user", tool: string, ids: string[], patch: Partial<Filters>, merge = false) {
  editC(tool, src, { ids, ...patch }, (p) => mapClips(p, ids, (c) => ({ ...c, filters: { ...c.filters, ...patch } })), merge);
}

function ColorPanel() {
  const active = useActiveClip();
  if (!active) return <Empty>No clips to color yet.</Empty>;
  const c = active.clip;
  const f = c.filters;
  const s = (k: keyof Filters, label: string, min: number, max: number, fmt?: (v: number) => string) => (
    <Slider
      label={label}
      min={min}
      max={max}
      value={f[k]}
      format={fmt}
      onChange={(v) => setFilters("user", "set_filters", [c.id], { [k]: v }, true)}
    />
  );
  return (
    <div className="stack">
      <ClipPicker />
      <Chips
        options={PRESETS}
        value={null}
        onChange={(k) => setFilters("user", "apply_look", [c.id], { ...defaultFilters(), ...FILTER_PRESETS[k] })}
      />
      {s("brightness", "Brightness", 0.3, 2)}
      {s("contrast", "Contrast", 0.3, 2)}
      {s("saturation", "Saturation", 0, 3)}
      {s("hue", "Tint (hue)", -180, 180, (v) => Math.round(v) + "°")}
      {s("sepia", "Warmth (sepia)", 0, 1)}
      {s("blur", "Blur", 0, 20, (v) => v.toFixed(1) + "px")}
      <Row>
        <button className="btn small" onClick={() => setFilters("user", "set_filters", resolveClips("all"), f)}>
          Copy to all clips
        </button>
        <button className="btn small" onClick={() => setFilters("user", "set_filters", [c.id], defaultFilters())}>
          Reset
        </button>
      </Row>
    </div>
  );
}

export const colorComponent: ComponentDef = {
  id: "color",
  title: "Color & filters",
  icon: "🎨",
  about: "Per-clip color grading: brightness, contrast, saturation, hue, sepia, blur, and looks: " + PRESETS.join(", ") + ".",
  tools: [
    {
      name: "apply_look",
      description: "Apply a preset color look to clips.",
      params: { target: clipTarget, look: { type: "string", enum: PRESETS } },
      required: ["target", "look"],
      run: (a) => {
        const ids = resolveClips(a.target);
        setFilters("ai", "apply_look", ids, { ...defaultFilters(), ...FILTER_PRESETS[a.look] });
        return `Applied ${a.look} to ${ids.length} clip(s)`;
      },
    },
    {
      name: "set_filters",
      description:
        "Set individual color values on clips. brightness/contrast 0.3-2 (1=normal), saturation 0-3, hue -180..180, sepia 0-1, blur 0-20.",
      params: {
        target: clipTarget,
        brightness: { type: "number" },
        contrast: { type: "number" },
        saturation: { type: "number" },
        hue: { type: "number" },
        sepia: { type: "number" },
        blur: { type: "number" },
      },
      required: ["target"],
      run: (a) => {
        const ids = resolveClips(a.target);
        const patch: Partial<Filters> = {};
        for (const k of ["brightness", "contrast", "saturation", "hue", "sepia", "blur"] as const) if (a[k] != null) patch[k] = +a[k];
        setFilters("ai", "set_filters", ids, patch);
        return `Updated ${ids.length} clip(s)`;
      },
    },
  ],
  Panel: ColorPanel,
};
