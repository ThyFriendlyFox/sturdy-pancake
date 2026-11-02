import type { FC } from "react";
import { layout, type Clip, type Project } from "../model";
import { store } from "../store";
import type { EventSource } from "../telemetry";

export type Json = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  params: Record<string, Json>;
  required?: string[];
  run: (args: any) => string | ToolOutput | Promise<string | ToolOutput>;
}

/** A tool result that also carries an image (e.g. a frame grab). */
export interface ToolOutput {
  text: string;
  imageDataUrl?: string;
}

/**
 * An editing component: a hidden-by-default panel the user can drive by hand,
 * plus tools the AI can call to drive the same edits.
 */
export interface ComponentDef {
  id: string;
  title: string;
  icon: string;
  about: string; // what it controls; shown to the AI
  tools: ToolDef[];
  Panel: FC;
}

export const editFor =
  (component: string) =>
  (tool: string, src: EventSource, args: unknown, fn: (p: Project) => Project, merge = false) =>
    store.edit(component, tool, src, args, fn, { merge });

/** Resolve a clip target the AI or a panel passes: id, "all", "selected", "current", or 1-based index. */
export function resolveClips(target: unknown): string[] {
  const s = store.get();
  const clips = s.project.clips;
  const t = String(target ?? "current");
  if (t === "all") return clips.map((c) => c.id);
  if (t === "selected" && s.selectedClipId) return [s.selectedClipId];
  if (/^\d+$/.test(t)) {
    const c = clips[+t - 1];
    return c ? [c.id] : [];
  }
  if (clips.some((c) => c.id === t)) return [t];
  const under = layout(s.project).find((p) => s.time >= p.start && s.time < p.end) ?? layout(s.project).at(-1);
  return under ? [under.clip.id] : [];
}

export const mapClips = (p: Project, ids: string[], fn: (c: Clip) => Clip): Project => ({
  ...p,
  clips: p.clips.map((c) => (ids.includes(c.id) ? fn(c) : c)),
});

export const clipTarget: Json = {
  type: "string",
  description: 'Clip id, 1-based clip number, "all", or "current" (clip under the playhead).',
};
