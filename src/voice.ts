// Hold-to-talk with the browser's speech recognition (Safari and Chrome on phones).
import { store } from "./store";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

const Ctor = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const voiceSupported = () => typeof window !== "undefined" && !!Ctor();

let rec: Rec | null = null;
let finalText = "";
let onDone: ((text: string) => void) | null = null;

/** Start listening. `done` gets the full transcript when the user lets go. */
export function startListening(done: (text: string) => void) {
  const C = Ctor();
  if (!C || rec) return false;
  finalText = "";
  onDone = done;
  rec = new C();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    store.set({ heard: (finalText + interim).trim() });
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") store.toast("Microphone is blocked. Allow it in the browser settings.");
  };
  rec.onend = () => {
    const text = (store.get().heard || finalText).trim();
    rec = null;
    store.set({ listening: false, heard: "" });
    const cb = onDone;
    onDone = null;
    if (text) cb?.(text);
  };
  store.set({ listening: true, heard: "" });
  try {
    rec.start();
  } catch {
    rec = null;
    store.set({ listening: false });
    return false;
  }
  return true;
}

export function stopListening() {
  rec?.stop();
}
