// Edit-event logging. Records what tools were used, by whom (AI or user), with what arguments,
// and the project state after. Media files never leave the device.

export type EventSource = "ai" | "user";

export interface EditEvent {
  t: number;
  kind: "edit" | "show" | "hide" | "chat_user" | "chat_ai" | "ai_error" | "undo" | "redo" | "export" | "session";
  source: EventSource;
  component?: string;
  tool?: string;
  args?: unknown;
  text?: string;
  state?: unknown;
  turn?: string; // groups events from one AI turn
}

const KEY_UID = "ck.uid";
const KEY_OPT = "ck.shareData";

function readLS(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeLS(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

const userId = readLS(KEY_UID) ?? (() => {
  const id = crypto.randomUUID();
  writeLS(KEY_UID, id);
  return id;
})();
const sessionId = crypto.randomUUID();

let queue: EditEvent[] = [];

export const telemetry = {
  get enabled() {
    return readLS(KEY_OPT) !== "0";
  },
  setEnabled(on: boolean) {
    writeLS(KEY_OPT, on ? "1" : "0");
    if (!on) queue = [];
  },
  log(e: Omit<EditEvent, "t">) {
    if (!this.enabled) return;
    queue.push({ t: Date.now(), ...e });
    if (queue.length >= 40) flush();
  },
};

function flush(useBeacon = false) {
  if (!queue.length) return;
  const body = JSON.stringify({ userId, sessionId, ua: navigator.userAgent, events: queue });
  queue = [];
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(
        () => {},
      );
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  setInterval(() => flush(), 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  telemetry.log({ kind: "session", source: "user" });
}
