// Tap-to-talk. Uses the browser's speech recognition when it has one (Safari, Chrome). Otherwise it records
// the microphone and transcribes on the device with Whisper (src/speech/worker.ts).
// Listening stops by itself after a pause in speech, and never runs longer than MAX_MS.
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

const MAX_MS = 20000;
let onDone: ((text: string) => void) | null = null;
let stopNow: (() => void) | null = null;
let cancelled = false;
let watchdog = 0;

/** Start listening. `done` gets the transcript when the user stops talking (or taps to stop). */
export function startListening(done: (text: string) => void) {
  if (stopNow) return false;
  onDone = done;
  cancelled = false;
  store.set({ listening: true, heard: "", voiceNote: "" });
  // Until the microphone is live (the permission prompt can take a moment), then MAX_MS once it is.
  armWatchdog(12000);
  return Ctor() ? browserSpeech() : recordAndTranscribe();
}

function armWatchdog(ms: number) {
  clearTimeout(watchdog);
  watchdog = window.setTimeout(() => stopNow?.(), ms);
}

/** Stop now and send what was heard. */
export function stopListening() {
  stopNow?.();
}

/** Stop now and send nothing. */
export function cancelListening() {
  if (!stopNow) return;
  cancelled = true;
  stopNow();
}

export const isListening = () => !!stopNow;

function finish(text: string) {
  clearTimeout(watchdog);
  if (cancelled) text = "";
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
  rec.continuous = false; // ends by itself after a pause
  (rec as unknown as { onaudiostart: () => void }).onaudiostart = () => armWatchdog(MAX_MS);
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
  let ended = false;
  rec.onend = () => {
    if (ended) return;
    ended = true;
    finish(failed ? "" : store.get().heard || finalText);
  };
  // Some recognizers never report the end (seen on iPhone): finish ourselves shortly after asking to stop.
  stopNow = () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    setTimeout(() => rec.onend(), 1500);
  };
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

// Silence detection runs on the audio thread, so a busy page (model loading, video decoding) cannot make it
// miss a pause. It posts "stop" after 1.3 s of quiet following speech, or "none" after 7 s with no speech.
const VAD_WORKLET = `
class Vad extends AudioWorkletProcessor {
  constructor() { super(); this.t = 0; this.spoke = false; this.quiet = 0; this.done = false; }
  process(inputs) {
    if (this.done) return false;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    const rms = Math.sqrt(sum / ch.length), dt = ch.length / sampleRate;
    this.t += dt;
    if (rms > 0.02) { this.spoke = true; this.quiet = 0; }
    else if (this.spoke) { this.quiet += dt; if (this.quiet > 1.3) { this.done = true; this.port.postMessage("stop"); } }
    else if (this.t > 7) { this.done = true; this.port.postMessage("none"); }
    return true;
  }
}
registerProcessor("vad", Vad);
`;

async function watchSilence(stream: MediaStream, stop: () => void) {
  const ac = new AudioContext();
  try {
    await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([VAD_WORKLET], { type: "application/javascript" })));
    const node = new AudioWorkletNode(ac, "vad");
    node.port.onmessage = (e) => {
      if (e.data === "none") cancelled = true;
      void ac.close();
      stop();
    };
    ac.createMediaStreamSource(stream).connect(node);
    if (ac.state === "suspended") await ac.resume();
  } catch {
    void ac.close(); // no worklets: the MAX_MS limit still ends listening
  }
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
      armWatchdog(MAX_MS);
      void watchSilence(s, () => stopNow?.());
      rec = new MediaRecorder(s);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        if (cancelled) return finish("");
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
