import { useRef, useState } from "react";
import { clamp, totalDuration, uid } from "../model";
import { importBlob, pickFiles } from "../media";
import { store, useStore } from "../store";
import { Chips, Empty, Slider, Toggle, fmtTime } from "../ui/controls";
import { editFor, type ComponentDef } from "./types";

// ---------- voice track ----------
const editV = editFor("voice");

function addVoiceover(src: "ai" | "user", mediaId: string, start: number) {
  const m = store.get().media.find((x) => x.id === mediaId);
  if (!m) return "No such media";
  const id = uid("vo_");
  editV("add_voiceover", src, { mediaId, start }, (p) => ({
    ...p,
    voice: { ...p.voice, voiceovers: [...p.voice.voiceovers, { id, mediaId, start: Math.max(0, start), in: 0, out: m.duration, volume: 1 }] },
  }));
  return `Added voiceover ${id}`;
}

function Recorder() {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const startAt = useRef(0);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const m = await importBlob(new Blob(chunks, { type: r.mimeType }), "Voiceover " + new Date().toLocaleTimeString());
        if (m) addVoiceover("user", m.id, startAt.current);
        setRec(null);
      };
      startAt.current = store.get().time;
      r.start();
      setRec(r);
    } catch {
      alert("Microphone not available");
    }
  };
  return rec ? (
    <button className="btn danger wide" onClick={() => rec.stop()}>■ Stop recording</button>
  ) : (
    <button className="btn wide" onClick={start}>🎙 Record voiceover at playhead</button>
  );
}

function VoicePanel() {
  const voice = useStore((s) => s.project.voice);
  const media = useStore((s) => s.media);
  const set = (patch: Partial<typeof voice>, tool = "set_voice", merge = false) =>
    editV(tool, "user", patch, (p) => ({ ...p, voice: { ...p.voice, ...patch } }), merge);
  return (
    <div className="stack">
      <p className="dim small">The sound from your clips plus any voiceovers.</p>
      <Slider label="Voice volume" min={0} max={2} value={voice.volume} format={(v) => Math.round(v * 100) + "%"} onChange={(v) => set({ volume: v }, "set_voice", true)} />
      <Toggle label="Mute voice track" value={voice.muted} onChange={(v) => set({ muted: v })} />
      <Recorder />
      <button
        className="btn small"
        onClick={async () => {
          const [m] = await pickFiles("audio/*");
          if (m) addVoiceover("user", m.id, store.get().time);
        }}
      >
        Import voiceover file
      </button>
      {voice.voiceovers.map((v) => (
        <div key={v.id} className="card-inner stack">
          <div className="row between">
            <span className="ellipsis">🎙 {media.find((m) => m.id === v.mediaId)?.name}</span>
            <button
              className="btn small danger"
              onClick={() => editV("remove_voiceover", "user", { id: v.id }, (p) => ({ ...p, voice: { ...p.voice, voiceovers: p.voice.voiceovers.filter((x) => x.id !== v.id) } }))}
            >
              Remove
            </button>
          </div>
          <Slider
            label="Starts at"
            min={0}
            max={Math.max(1, totalDuration(store.get().project))}
            step={0.05}
            value={v.start}
            format={fmtTime}
            onChange={(t) => editV("move_voiceover", "user", { id: v.id, start: t }, (p) => ({ ...p, voice: { ...p.voice, voiceovers: p.voice.voiceovers.map((x) => (x.id === v.id ? { ...x, start: t } : x)) } }), true)}
          />
          <Slider
            label="Volume"
            min={0}
            max={2}
            value={v.volume}
            format={(x) => Math.round(x * 100) + "%"}
            onChange={(n) => editV("set_voiceover_volume", "user", { id: v.id, volume: n }, (p) => ({ ...p, voice: { ...p.voice, voiceovers: p.voice.voiceovers.map((x) => (x.id === v.id ? { ...x, volume: n } : x)) } }), true)}
          />
        </div>
      ))}
    </div>
  );
}

export const voiceComponent: ComponentDef = {
  id: "voice",
  title: "Voice track",
  icon: "🗣",
  about: "The voice/dialogue audio: the clips' own sound plus recorded or imported voiceovers. Volume, mute, add/move/remove voiceovers. (Pitch is its own component.)",
  tools: [
    {
      name: "set_voice",
      description: "Set voice track volume (0-2) and/or mute.",
      params: { volume: { type: "number" }, muted: { type: "boolean" } },
      run: (a) => {
        const patch: Record<string, unknown> = {};
        if (a.volume != null) patch.volume = clamp(+a.volume, 0, 2);
        if (a.muted != null) patch.muted = !!a.muted;
        editV("set_voice", "ai", patch, (p) => ({ ...p, voice: { ...p.voice, ...patch } }));
        return "Voice updated";
      },
    },
    {
      name: "add_voiceover",
      description: "Place an audio media item as a voiceover starting at a timeline time.",
      params: { mediaId: { type: "string" }, start: { type: "number" } },
      required: ["mediaId", "start"],
      run: (a) => addVoiceover("ai", a.mediaId, +a.start),
    },
    {
      name: "update_voiceover",
      description: "Move a voiceover or change its volume.",
      params: { id: { type: "string" }, start: { type: "number" }, volume: { type: "number" } },
      required: ["id"],
      run: (a) => {
        editV("update_voiceover", "ai", a, (p) => ({
          ...p,
          voice: { ...p.voice, voiceovers: p.voice.voiceovers.map((x) => (x.id === a.id ? { ...x, start: a.start ?? x.start, volume: a.volume ?? x.volume } : x)) },
        }));
        return "Updated";
      },
    },
    {
      name: "remove_voiceover",
      description: "Remove a voiceover.",
      params: { id: { type: "string" } },
      required: ["id"],
      run: (a) => {
        editV("remove_voiceover", "ai", a, (p) => ({ ...p, voice: { ...p.voice, voiceovers: p.voice.voiceovers.filter((x) => x.id !== a.id) } }));
        return "Removed";
      },
    },
  ],
  Panel: VoicePanel,
};

// ---------- pitch ----------
const editP = editFor("pitch");
const PITCH_PRESETS = { deep: -5, lower: -2, natural: 0, higher: 2, chipmunk: 7 } as const;

function PitchPanel() {
  const pitch = useStore((s) => s.project.voice.pitch);
  const set = (v: number, merge = false) => editP("set_voice_pitch", "user", { semitones: v }, (p) => ({ ...p, voice: { ...p.voice, pitch: v } }), merge);
  const name = (Object.keys(PITCH_PRESETS) as (keyof typeof PITCH_PRESETS)[]).find((k) => PITCH_PRESETS[k] === pitch) ?? null;
  return (
    <div className="stack">
      <Slider label="Voice pitch" min={-12} max={12} step={0.5} value={pitch} format={(v) => (v > 0 ? "+" : "") + v + " st"} onChange={(v) => set(v, true)} />
      <Chips options={Object.keys(PITCH_PRESETS) as (keyof typeof PITCH_PRESETS)[]} value={name} onChange={(k) => set(PITCH_PRESETS[k])} />
      <p className="dim small">Changes how high or low voices sound without changing speed. Press play to hear it.</p>
    </div>
  );
}

export const pitchComponent: ComponentDef = {
  id: "pitch",
  title: "Voice pitch",
  icon: "♯",
  about: "Pitch of the voice track in semitones (-12..12) without changing speed.",
  tools: [
    {
      name: "set_voice_pitch",
      description: "Shift the voice track pitch in semitones (-12..12, 0 = natural).",
      params: { semitones: { type: "number" } },
      required: ["semitones"],
      run: ({ semitones }) => {
        const v = clamp(+semitones, -12, 12);
        editP("set_voice_pitch", "ai", { semitones: v }, (p) => ({ ...p, voice: { ...p.voice, pitch: v } }));
        return `Pitch ${v} semitones`;
      },
    },
  ],
  Panel: PitchPanel,
};

// ---------- music ----------
const editM = editFor("music");

function MusicPanel() {
  const music = useStore((s) => s.project.music);
  const media = useStore((s) => s.media);
  const songs = media.filter((m) => m.kind === "audio");
  const song = songs.find((m) => m.id === music.mediaId);
  const set = (patch: Partial<typeof music>, merge = false) => editM("set_music", "user", patch, (p) => ({ ...p, music: { ...p.music, ...patch } }), merge);
  return (
    <div className="stack">
      <div className="chips scroll">
        <button className={"chip" + (!music.mediaId ? " on" : "")} onClick={() => set({ mediaId: null })}>No music</button>
        {songs.map((s) => (
          <button key={s.id} className={"chip" + (s.id === music.mediaId ? " on" : "")} onClick={() => set({ mediaId: s.id })}>
            ♪ {s.name}
          </button>
        ))}
        <button
          className="chip"
          onClick={async () => {
            const [m] = await pickFiles("audio/*");
            if (m) set({ mediaId: m.id });
          }}
        >
          + Add song
        </button>
      </div>
      {song ? (
        <>
          <Slider label="Start song at" min={0} max={Math.max(0, song.duration - 1)} step={0.1} value={music.offset} format={fmtTime} onChange={(v) => set({ offset: v }, true)} />
          <Slider label="Music volume" min={0} max={1.5} value={music.volume} format={(v) => Math.round(v * 100) + "%"} onChange={(v) => set({ volume: v }, true)} />
          <Slider label="Fade in" min={0} max={5} step={0.1} value={music.fadeIn} format={(v) => v.toFixed(1) + "s"} onChange={(v) => set({ fadeIn: v }, true)} />
          <Slider label="Fade out" min={0} max={5} step={0.1} value={music.fadeOut} format={(v) => v.toFixed(1) + "s"} onChange={(v) => set({ fadeOut: v }, true)} />
          <Toggle label="Lower music under voiceovers" value={music.duck} onChange={(v) => set({ duck: v })} />
        </>
      ) : (
        <Empty>Pick or add a song.</Empty>
      )}
    </div>
  );
}

export const musicComponent: ComponentDef = {
  id: "music",
  title: "Music",
  icon: "♪",
  about: "Background music track: which song, where in the song to start, volume, fade in/out, ducking under voiceovers.",
  tools: [
    {
      name: "set_music",
      description: "Configure background music. mediaId must be an audio media id (or null to remove).",
      params: {
        mediaId: { type: ["string", "null"] },
        offset: { type: "number", description: "Seconds into the song to start" },
        volume: { type: "number", description: "0-1.5" },
        fadeIn: { type: "number" },
        fadeOut: { type: "number" },
        duck: { type: "boolean" },
      },
      run: (a) => {
        const patch: Record<string, unknown> = {};
        for (const k of ["mediaId", "offset", "volume", "fadeIn", "fadeOut", "duck"]) if (a[k] !== undefined) patch[k] = a[k];
        if (patch.mediaId && !store.get().media.some((m) => m.id === patch.mediaId && m.kind === "audio")) return "Not an audio media id";
        editM("set_music", "ai", patch, (p) => ({ ...p, music: { ...p.music, ...patch } }));
        return "Music updated";
      },
    },
  ],
  Panel: MusicPanel,
};
