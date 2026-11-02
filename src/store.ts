import { useSyncExternalStore } from "react";
import { describe, emptyProject, type Media, type Project } from "./model";
import { telemetry, type EventSource } from "./telemetry";

export interface State {
  project: Project;
  media: Media[];
  visible: string[]; // component ids shown, newest last
  selectedClipId: string | null;
  time: number;
  playing: boolean;
}

const SAVE_KEY = "ck.project.v1";

function load(): Partial<State> {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw);
    return { project: { ...emptyProject(), ...s.project }, media: s.media ?? [] };
  } catch {
    return {};
  }
}

let state: State = {
  project: emptyProject(),
  media: [],
  visible: [],
  selectedClipId: null,
  time: 0,
  playing: false,
  ...load(),
};

const listeners = new Set<() => void>();
const past: Project[] = [];
const future: Project[] = [];
let saveTimer = 0;

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ project: state.project, media: state.media }));
    } catch {
      /* quota */
    }
  }, 300);
}

let currentTurn: string | undefined;

export const store = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    emit();
  },
  /** Group following AI events under one turn id (for telemetry). */
  setTurn(id: string | undefined) {
    currentTurn = id;
  },
  /**
   * Every project change goes through here: undo history, persistence and edit logging.
   * `merge` lets slider drags collapse into one undo step and one log event per gesture.
   */
  edit(
    component: string,
    tool: string,
    source: EventSource,
    args: unknown,
    fn: (p: Project) => Project,
    opts: { merge?: boolean } = {},
  ) {
    const before = state.project;
    const after = fn(before);
    if (after === before) return;
    if (!opts.merge || lastMergeKey !== component + tool) {
      past.push(before);
      if (past.length > 100) past.shift();
    }
    lastMergeKey = opts.merge ? component + tool : "";
    future.length = 0;
    state = { ...state, project: after };
    persist();
    emit();
    logEdit(component, tool, source, args, !!opts.merge);
  },
  addMedia(m: Media) {
    state = { ...state, media: [...state.media, m] };
    persist();
    emit();
  },
  undo(source: EventSource = "user") {
    const p = past.pop();
    if (!p) return false;
    future.push(state.project);
    state = { ...state, project: p };
    lastMergeKey = "";
    persist();
    emit();
    telemetry.log({ kind: "undo", source, turn: currentTurn });
    return true;
  },
  redo(source: EventSource = "user") {
    const p = future.pop();
    if (!p) return false;
    past.push(state.project);
    state = { ...state, project: p };
    persist();
    emit();
    telemetry.log({ kind: "redo", source, turn: currentTurn });
    return true;
  },
  show(ids: string[], source: EventSource) {
    const visible = [...state.visible.filter((v) => !ids.includes(v)), ...ids];
    state = { ...state, visible };
    emit();
    ids.forEach((id) => telemetry.log({ kind: "show", source, component: id, turn: currentTurn }));
  },
  hide(ids: string[], source: EventSource) {
    state = { ...state, visible: state.visible.filter((v) => !ids.includes(v)) };
    emit();
    ids.forEach((id) => telemetry.log({ kind: "hide", source, component: id, turn: currentTurn }));
  },
  snapshot() {
    return describe(state.project, state.media, state.time, state.selectedClipId);
  },
  reset() {
    past.push(state.project);
    state = { ...state, project: emptyProject(), media: [], selectedClipId: null, time: 0, visible: [] };
    persist();
    emit();
  },
};

let lastMergeKey = "";

// Slider drags fire many edits; log one event per gesture, after it settles.
const pendingMerged = new Map<string, number>();
function logEdit(component: string, tool: string, source: EventSource, args: unknown, merged: boolean) {
  const send = () =>
    telemetry.log({ kind: "edit", source, component, tool, args, state: store.snapshot(), turn: source === "ai" ? currentTurn : undefined });
  if (!merged) return send();
  const k = component + tool;
  clearTimeout(pendingMerged.get(k));
  pendingMerged.set(k, window.setTimeout(send, 800));
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state));
}
