import { motion } from "motion/react";
import { session } from "../ai/session";
import { defaultEffect, newClip, type EffectName } from "../model";
import { pickFiles } from "../media";
import { store, useStore } from "../store";
import { setEffect } from "../subjects";
import { cancelListening, isListening, startListening, stopListening, voiceSupported } from "../voice";
import { EFFECT_LABEL } from "../components/subject";
import { Icon } from "./icons";
import { spring } from "./Sheet";

/** Isolation started by the current tap, so speech can wait for it and name the tapped thing. */
let pendingSubject: Promise<string | null> = Promise.resolve(null);
export const setPendingSubject = (p: Promise<string | null>) => (pendingSubject = p);

/**
 * Start listening (tap-to-talk). Listening ends by itself after a pause; the words go to the AI, together
 * with the thing the user tapped once it is cut out. Returns false when there is no AI or no microphone.
 */
export function listen(): boolean {
  if (!session.connected || !voiceSupported() || isListening()) return false;
  return startListening(async (text) => {
    const id = await pendingSubject;
    if (id) store.set({ selectedSubjectId: id });
    store.set({ radial: null });
    void session.ask(text);
  });
}

/** Tap: start listening, or stop and send if already listening. No AI yet: ask to connect one. */
export function toggleTalk() {
  if (isListening()) return stopListening();
  if (!session.connected) return session.connect();
  if (!voiceSupported()) return store.toast("This browser cannot use the microphone. Type on the talk screen.");
  listen();
}

export function addClips() {
  void pickFiles().then((ms) => {
    const vids = ms.filter((m) => m.kind !== "audio");
    if (vids.length)
      store.edit("media", "add_clips", "user", { mediaIds: vids.map((m) => m.id) }, (p) => ({
        ...p,
        clips: [...p.clips, ...vids.map(newClip)],
      }));
    const song = ms.find((m) => m.kind === "audio");
    if (song) store.edit("music", "set_music", "user", { mediaId: song.id }, (p) => ({ ...p, music: { ...p.music, mediaId: song.id } }));
  });
}

interface Toe {
  id: string;
  label: string;
  icon: string;
  run: () => void;
}

const close = () => {
  cancelListening();
  store.set({ radial: null });
};

const START: Toe[] = [
  { id: "add", label: "Add clips", icon: "plus", run: () => (close(), addClips()) },
  {
    id: "music",
    label: "Music",
    icon: "music",
    run: () => {
      close();
      void pickFiles("audio/*").then(([m]) => {
        if (m) store.edit("music", "set_music", "user", { mediaId: m.id }, (p) => ({ ...p, music: { ...p.music, mediaId: m.id } }));
      });
    },
  },
  { id: "copy", label: "Copy an edit", icon: "clone", run: () => (close(), store.set({ page: 2 })) },
];

const EFFECTS: { effect: EffectName; icon: string }[] = [
  { effect: "follow", icon: "follow" },
  { effect: "glow", icon: "glow" },
  { effect: "spotlight", icon: "spotlight" },
  { effect: "freeze", icon: "freeze" },
  { effect: "clone", icon: "clone" },
  { effect: "recolor", icon: "recolor" },
  { effect: "erase", icon: "erase" },
  { effect: "sticker", icon: "sticker" },
];

function effectToes(subjectId: string | null): Toe[] {
  return EFFECTS.map((e) => ({
    id: e.effect,
    label: EFFECT_LABEL[e.effect],
    icon: e.icon,
    run: () => {
      const s = store.get().project.subjects.find((x) => x.id === subjectId);
      close();
      if (!s) return;
      setEffect(s.id, e.effect, defaultEffect(e.effect, s.t0) as Record<string, unknown>, "user");
      store.show(["subject"], "user");
      store.toast(`${EFFECT_LABEL[e.effect]} added`, true);
    },
  }));
}

/** Paw menu around a tap. It listens as soon as it opens; the pad in the middle stops or restarts listening. */
export function RadialPaw({ width, height }: { width: number; height: number }) {
  const radial = useStore((s) => s.radial);
  const listening = useStore((s) => s.listening);
  const empty = useStore((s) => s.project.clips.length === 0);
  if (!radial) return null;
  const toes = empty ? START : effectToes(radial.subjectId);
  const R = toes.length > 4 ? 94 : 84;
  // Keep the whole ring on screen.
  const cx = Math.min(Math.max(radial.x, R + 40), width - R - 40);
  const cy = Math.min(Math.max(radial.y, R + 90), height - R - 150);
  const waiting = !empty && (radial.finding || !radial.subjectId);
  return (
    <div className="radial" style={{ left: cx, top: cy }}>
      {toes.map((t, i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / toes.length;
        return (
          <motion.div
            key={t.id}
            className="rtoe"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{ x: Math.cos(a) * R, y: Math.sin(a) * R, opacity: waiting ? 0.35 : 1, scale: 1 }}
            transition={{ ...spring, delay: 0.04 + i * 0.025 }}
          >
            <button aria-label={t.label} disabled={waiting} onClick={t.run}>
              <Icon name={t.icon} size={20} />
            </button>
            <span>{t.label}</span>
          </motion.div>
        );
      })}
      <motion.button
        className={"rpad" + (listening ? " listening" : "")}
        aria-label={listening ? "Stop listening and send" : "Talk"}
        onClick={toggleTalk}
        initial={{ scale: 0 }}
        animate={{ scale: listening ? [1, 1.12, 1] : 1 }}
        transition={listening ? { duration: 1.1, repeat: Infinity } : spring}
      >
        {radial.finding && !listening ? <span className="spinner" /> : <Icon name="mic" size={28} />}
      </motion.button>
    </div>
  );
}
