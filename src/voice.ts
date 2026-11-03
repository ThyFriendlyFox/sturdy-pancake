// Hold-to-talk. Uses the browser's speech recognition when it has one (Safari, Chrome). Otherwise it records
// the microphone and transcribes on the device with Whisper (src/speech/worker.ts).
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

/** Some way to turn speech into text exists: the browser's, or recording plus on-device Whisper. */
export const voiceSupported = () =>
  typeof window !== "undefined" && (!!Ctor() || (!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"));

let onDone: ((text: string) => void) | null = null;
let stopNow: (() => void) | null = null;

/** Start listening. `done` gets the full transcript when the user lets go. */
export function startListening(done: (text: string) => void) {
  if (stopNow) return false;
  onDone = done;
  store.set({ listening: true, heard: "", voiceNote: "" });
  return Ctor() ? browserSpeech() : recordAndTranscribe();
}

export function stopListening() {
  stopNow?.();
}

function finish(text: string) {
  stopNow = null;
  store.set({ listening: false, heard: "", voiceNote: "" });
  const cb = onDone;
  onDone = null;
  if (text.trim()) cb?.(text.trim());
}

// ---------- browser speech recognition ----------
function browserSpeech() {
  const rec = new (Ctor()!)();
  let finalText = "";
  let failed = false;
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
    failed = true;
    if (e.error === "not-allowed") store.toast("Microphone is blocked. Allow it in the browser settings.");
  };
  rec.onend = () => finish(failed ? "" : store.get().heard || finalText);
  stopNow = () => rec.stop();
  try {
    rec.start();
    return true;
  } catch {
    stopNow = null;
    return recordAndTranscribe();
  }
}

// ---------- record, then Whisper on the device ----------
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: { text?: string; error?: string }) => void>();
function whisper(audio?: Float32Array): Promise<{ text?: string; error?: string }> {
  worker ??= (() => {
    const w = new Worker(new URL("./speech/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      if (e.data.id === 0) return store.set({ voiceNote: `Getting speech-to-text ready · ${Math.round(e.data.progress * 100)}%` });
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    return w;
  })();
  const id = ++seq;
  return new Promise((res) => {
    pending.set(id, res);
    worker!.postMessage({ id, audio }, audio ? [audio.buffer] : []);
  });
}

/** Mono 16 kHz samples, the input Whisper expects. */
async function toPcm16k(blob: Blob): Promise<Float32Array> {
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
  void ac.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

function recordAndTranscribe() {
  let stream: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let released = false;
  const chunks: Blob[] = [];
  void whisper(); // start loading the model while the user talks
  stopNow = () => {
    released = true;
    if (rec && rec.state !== "inactive") rec.stop();
    else if (!rec) finish("");
  };
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => {
      stream = s;
      if (released) {
        s.getTracks().forEach((t) => t.stop());
        return finish("");
      }
      rec = new MediaRecorder(s);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        store.set({ voiceNote: "Writing down what you said…" });
        try {
          const pcm = await toPcm16k(new Blob(chunks, { type: rec!.mimeType }));
          if (pcm.length < 16000 * 0.3) return finish("");
          const r = await whisper(pcm);
          if (r.error) store.toast("Could not turn that into text");
          finish(r.text ?? "");
        } catch {
          store.toast("Could not turn that into text");
          finish("");
        }
      };
      rec.start();
    })
    .catch(() => {
      store.toast("Microphone is blocked. Allow it in the browser settings.");
      finish("");
    });
  return true;
}
