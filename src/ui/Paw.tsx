import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { session } from "../ai/session";
import { getEngine } from "../engine";
import { clipAt, defaultEffect, layout, newClip, sourceTime, totalDuration, type EffectName } from "../model";
import { pickFiles } from "../media";
import { store, useStore } from "../store";
import { setEffect } from "../subjects";
import { thumbnail } from "../thumbs";
import { startListening, stopListening, voiceSupported } from "../voice";
import { EFFECT_LABEL } from "../components/subject";
import { Icon } from "./icons";
import { spring } from "./Sheet";

const HOLD_MS = 280;

/** Pointer handlers for the pad: tap does `onTap`, press-and-hold talks to the AI. */
export function useHoldToTalk(onTap: () => void) {
  const timer = useRef(0);
  const holding = useRef(false);
  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holding.current = false;
    timer.current = window.setTimeout(() => {
      holding.current = true;
      if (!session.connected) return session.connect();
      if (!voiceSupported()) return store.toast("This browser cannot use the microphone. Type on the talk screen.");
      startListening((text) => void session.ask(text));
    }, HOLD_MS);
  };
  const up = () => {
    clearTimeout(timer.current);
    if (holding.current) stopListening();
    else onTap();
    holding.current = false;
  };
  return { onPointerDown: down, onPointerUp: up, onPointerCancel: up, onContextMenu: (e: React.MouseEvent) => e.preventDefault() };
}

function addClips() {
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

function Filmstrip() {
  const project = useStore((s) => s.project);
  const media = useStore((s) => s.media);
  const time = useStore((s) => s.time);
  const dur = Math.max(0.01, totalDuration(project));
  const [thumbs, setThumbs] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const n = 6;
    Promise.all(
      Array.from({ length: n }, (_, i) => {
        const t = ((i + 0.5) / n) * dur;
        const pl = clipAt(project, t);
        const m = pl && media.find((x) => x.id === pl.clip.mediaId);
        return pl && m && m.kind !== "audio" ? thumbnail(m.id, sourceTime(pl, t), m.kind) : Promise.resolve("");
      }),
    ).then((t) => alive && setThumbs(t));
    return () => {
      alive = false;
    };
  }, [project.clips, media, dur]);
  const seek = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    getEngine()?.seek(Math.max(0, Math.min(1, (x - r.left) / r.width)) * dur);
  };
  return (
    <motion.div
      className="filmstrip"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={spring}
    >
      <div
        className="filmstrip-frames"
        ref={ref}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && seek(e.clientX)}
      >
        {thumbs.map((src, i) => (src ? <img key={i} src={src} alt="" draggable={false} /> : <span key={i} />))}
        <i className="filmstrip-head" style={{ left: `${(time / dur) * 100}%` }} />
      </div>
      <div className="filmstrip-cuts" aria-hidden="true">
        {layout(project)
          .slice(1)
          .map((pl) => (
            <i key={pl.clip.id} style={{ left: `${(pl.start / dur) * 100}%` }} />
          ))}
      </div>
    </motion.div>
  );
}

const TOES = [
  { id: "add", label: "Add clips", icon: "plus" },
  { id: "music", label: "Music", icon: "music" },
  { id: "color", label: "Look", icon: "look" },
  { id: "export", label: "Export", icon: "export" },
] as const;
// Open positions: an arc up and to the left of the pad (px from the pad's center).
// Open: an arc up and to the left of the pad. Closed: 4 toes over the top of the pad, like a paw print.
// Offsets in px from the pad's center.
const ARC = [
  [0, -132],
  [-79, -105],
  [-126, -39],
  [-124, 45],
];
const CLOSED = [
  [-42, -15],
  [-26, -37],
  [0, -45],
  [26, -37],
];

/** The paw in the corner. Tap: menu. Hold: talk. */
export function CornerPaw() {
  const [open, setOpen] = useState(false);
  const listening = useStore((s) => s.listening);
  const hasClips = useStore((s) => s.project.clips.length > 0);
  const hold = useHoldToTalk(() => setOpen((o) => !o));
  const act = (id: string) => {
    setOpen(false);
    if (id === "add") addClips();
    else store.show([id], "user");
  };
  return (
    <>
      <AnimatePresence>{open && hasClips && <Filmstrip key="strip" />}</AnimatePresence>
      {/* No exit animation: a fading scrim would still swallow the next tap on the video. */}
      {open && (
        <motion.button
          className="scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      <div className="paw">
        {TOES.map((t, i) => (
          <motion.button
            key={t.id}
            className={"toe" + (open ? " open" : "")}
            aria-label={t.label}
            tabIndex={open ? 0 : -1}
            onClick={() => (open ? act(t.id) : setOpen(true))}
            animate={{
              x: (open ? ARC : CLOSED)[i][0],
              y: (open ? ARC : CLOSED)[i][1],
              width: open ? 56 : 24,
              height: open ? 56 : 28,
              marginLeft: open ? -28 : -12,
              marginTop: open ? -28 : -14,
            }}
            transition={{ ...spring, delay: open ? i * 0.03 : 0 }}
            whileTap={{ scale: 0.88 }}
          >
            <AnimatePresence>
              {open && (
                <motion.span
                  className="toe-inner"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Icon name={t.icon} size={22} />
                  <span className="toe-label">{t.label}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
        <motion.button
          className={"pad" + (listening ? " listening" : "") + (open ? " open" : "")}
          aria-label="Tap for menu, hold to talk"
          {...hold}
          animate={{ scale: listening ? 1.18 : open ? 1.08 : 1 }}
          transition={spring}
        >
          <Icon name="mic" size={open ? 28 : 24} />
        </motion.button>
        <AnimatePresence>
          {open && (
            <motion.span className="pad-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Hold to talk
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

const RADIAL: { effect: EffectName; icon: string }[] = [
  { effect: "follow", icon: "follow" },
  { effect: "glow", icon: "glow" },
  { effect: "spotlight", icon: "spotlight" },
  { effect: "freeze", icon: "freeze" },
  { effect: "clone", icon: "clone" },
  { effect: "recolor", icon: "recolor" },
  { effect: "erase", icon: "erase" },
  { effect: "sticker", icon: "sticker" },
];

/** Paw menu around a tap: 8 effect toes, the pad in the middle talks about the tapped thing. */
export function RadialPaw({ width, height }: { width: number; height: number }) {
  const radial = useStore((s) => s.radial);
  const listening = useStore((s) => s.listening);
  const hold = useHoldToTalk(() => {
    store.set({ radial: null });
    if (radial?.subjectId) store.show(["subject"], "user");
  });
  if (!radial) return null;
  const R = 94;
  // Keep the whole ring on screen.
  const cx = Math.min(Math.max(radial.x, R + 34), width - R - 34);
  const cy = Math.min(Math.max(radial.y, R + 90), height - R - 150);
  const pick = (effect: EffectName) => {
    const s = store.get().project.subjects.find((x) => x.id === radial.subjectId);
    if (!s) return;
    setEffect(s.id, effect, defaultEffect(effect, s.t0) as Record<string, unknown>, "user");
    store.set({ radial: null });
    store.show(["subject"], "user");
    store.toast(`${EFFECT_LABEL[effect]} added`, true);
  };
  return (
    <div className="radial" style={{ left: cx, top: cy }}>
      {RADIAL.map((r, i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / RADIAL.length;
        return (
          <motion.div
            key={r.effect}
            className="rtoe"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{ x: Math.cos(a) * R, y: Math.sin(a) * R, opacity: radial.finding ? 0.35 : 1, scale: 1 }}
            transition={{ ...spring, delay: 0.04 + i * 0.025 }}
          >
            <button aria-label={EFFECT_LABEL[r.effect]} disabled={radial.finding} onClick={() => pick(r.effect)}>
              <Icon name={r.icon} size={20} />
            </button>
            <span>{EFFECT_LABEL[r.effect]}</span>
          </motion.div>
        );
      })}
      <motion.button
        className={"rpad" + (listening ? " listening" : "")}
        aria-label="Hold and say what to do with it"
        disabled={radial.finding}
        {...hold}
        initial={{ scale: 0 }}
        animate={{ scale: listening ? 1.15 : 1 }}
        transition={spring}
      >
        {radial.finding ? <span className="spinner" /> : <Icon name="mic" size={28} />}
      </motion.button>
    </div>
  );
}
