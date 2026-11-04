import { getEngine } from "../engine";
import { totalDuration } from "../model";
import { store } from "../store";
import { colorComponent, transitionsComponent } from "./look";
import { cutsComponent } from "./cuts";
import { exportComponent, formatComponent } from "./output";
import { mediaComponent } from "./media";
import { motionComponent, textComponent } from "./overlays";
import { musicComponent, pitchComponent, voiceComponent } from "./audio";
import { timelineComponent } from "./timeline";
import { videoTrackComponent } from "./videotrack";
import { examplesComponent } from "./examples";
import type { ComponentDef, ToolDef } from "./types";

export const COMPONENTS: ComponentDef[] = [
  mediaComponent,
  timelineComponent,
  videoTrackComponent,
  cutsComponent,
  transitionsComponent,
  colorComponent,
  voiceComponent,
  pitchComponent,
  musicComponent,
  textComponent,
  motionComponent,
  formatComponent,
  exportComponent,
  examplesComponent,
];

export const componentById = (id: string) => COMPONENTS.find((c) => c.id === id);
const IDS = COMPONENTS.map((c) => c.id);

/** Tools not tied to a single component. */
const coreTools: ToolDef[] = [
  {
    name: "show_components",
    description:
      "Reveal editing components on the user's screen so they can adjust things by hand. Show only what the current task needs (usually 1-2).",
    params: { ids: { type: "array", items: { type: "string", enum: IDS } } },
    required: ["ids"],
    run: ({ ids }) => {
      const ok = (ids as string[]).filter((i) => IDS.includes(i));
      store.show(ok, "ai");
      return `Showing ${ok.join(", ")}`;
    },
  },
  {
    name: "hide_components",
    description: "Hide components the user no longer needs. Pass ['all'] to clear the screen.",
    params: { ids: { type: "array", items: { type: "string" } } },
    required: ["ids"],
    run: ({ ids }) => {
      const list = (ids as string[]).includes("all") ? store.get().visible : (ids as string[]);
      store.hide(list, "ai");
      return "Hidden";
    },
  },
  {
    name: "get_state",
    description:
      "Get the current project (clips, tracks, text, effects, playhead) as JSON. Call after edits if you need fresh ids or timings.",
    params: {},
    run: () => JSON.stringify(store.snapshot()),
  },
  {
    name: "undo",
    description: "Undo the last edit (by anyone).",
    params: {},
    run: () => (store.undo("ai") ? "Undone" : "Nothing to undo"),
  },
  {
    name: "view_frame",
    description: "Look at the rendered video frame at a timeline time (returns an image). Use to check framing, text placement or color.",
    params: { time: { type: "number" } },
    required: ["time"],
    run: async ({ time }) => {
      const e = getEngine();
      if (!e) return "Preview not ready";
      const t = Math.min(+time, Math.max(0, totalDuration(store.get().project) - 0.05));
      return { text: `Frame at ${t.toFixed(2)}s`, imageDataUrl: await e.snapshot(t) };
    },
  },
];

export const ALL_TOOLS: (ToolDef & { component: string })[] = [
  ...coreTools.map((t) => ({ ...t, component: "core" })),
  ...COMPONENTS.flatMap((c) => c.tools.map((t) => ({ ...t, component: c.id }))),
];
