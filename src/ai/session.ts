// One conversation shared by the talk screen and tap-to-talk on the video screen.
import { useSyncExternalStore } from "react";
import { store } from "../store";
import type { Agent } from "./agent";

export interface ChatMsg {
  id: number;
  role: "user" | "ai" | "tool";
  text: string;
  recipeId?: string;
}

let msgs: ChatMsg[] = [];
let busy = false;
let agent: Agent | null = null;
let nextId = 1;
let needConnect: () => void = () => {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const push = (role: ChatMsg["role"], text: string, recipeId?: string) => {
  msgs = [...msgs, { id: nextId++, role, text, recipeId }];
  emit();
};

export const session = {
  setAgent(a: Agent | null, onNeedConnect: () => void) {
    agent = a;
    needConnect = onNeedConnect;
  },
  connect() {
    needConnect();
  },
  get connected() {
    return !!agent;
  },
  /** Send a message. */
  async ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    if (!agent) return needConnect();
    push("user", t);
    busy = true;
    emit();
    const before = store.get().recipes.length;
    await agent.send(t, {
      onText: (x) => push("ai", x),
      onTool: (name) => push("tool", name.replace(/_/g, " ")),
    });
    const recipes = store.get().recipes;
    for (const r of recipes.slice(before)) push("ai", "", r.id);
    busy = false;
    emit();
  },
};

export function useSession() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => msgs,
  );
}
export function useBusy() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => busy,
  );
}
