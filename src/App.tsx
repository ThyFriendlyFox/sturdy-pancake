import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Agent } from "./ai/agent";
import { finishOpenRouterLogin, loadSettings, type AiSettings } from "./ai/settings";
import { COMPONENTS, componentById } from "./components";
import { Engine, getEngine, setEngine } from "./engine";
import { newClip, totalDuration } from "./model";
import { pickFiles, restoreMedia } from "./media";
import { store, useStore } from "./store";
import { Chat } from "./ui/Chat";
import { Connect } from "./ui/Connect";
import { fmtTime } from "./ui/controls";
import { Sheet, spring } from "./ui/Sheet";

function Preview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const playing = useStore((s) => s.playing);
  const time = useStore((s) => s.time);
  const dur = useStore((s) => totalDuration(s.project));
  const empty = useStore((s) => s.project.clips.length === 0);
  useEffect(() => {
    if (ref.current && !getEngine()) setEngine(new Engine(ref.current));
  }, []);
  const toggle = () => {
    const e = getEngine();
    if (!e) return;
    if (e.playing) e.pause();
    else void e.play();
  };
  const addFirst = async () => {
    const ms = await pickFiles();
    const vids = ms.filter((m) => m.kind !== "audio");
    if (vids.length) store.edit("media", "add_clips", "user", { mediaIds: vids.map((m) => m.id) }, (p) => ({ ...p, clips: [...p.clips, ...vids.map(newClip)] }));
    const song = ms.find((m) => m.kind === "audio");
    if (song) store.edit("media", "use_as_music", "user", { mediaId: song.id }, (p) => ({ ...p, music: { ...p.music, mediaId: song.id } }));
  };
  return (
    <div className="preview">
      <canvas ref={ref} onClick={empty ? undefined : toggle} />
      <AnimatePresence mode="wait" initial={false}>
        {empty ? (
          <motion.button
            key="empty"
            className="preview-empty"
            onClick={addFirst}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <motion.span className="big" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
              ＋
            </motion.span>
            Add videos, photos or music
          </motion.button>
        ) : (
          <motion.div key="bar" className="preview-bar" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <motion.button className="icon-btn play" onClick={toggle} aria-label={playing ? "Pause" : "Play"} whileTap={{ scale: 0.8 }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={playing ? "pause" : "play"}
                  initial={{ scale: 0, rotate: -90, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0, rotate: 90, opacity: 0 }}
                  transition={spring}
                >
                  {playing ? "❚❚" : "▶"}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <input type="range" min={0} max={Math.max(dur, 0.01)} step={0.01} value={time} onChange={(e) => getEngine()?.seek(+e.target.value)} />
            <span className="mono small">
              {fmtTime(time)}/{fmtTime(dur)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const Card = forwardRef<HTMLElement, { id: string }>(function Card({ id }, ref) {
  const c = componentById(id)!;
  const flashAt = useStore((s) => (s.aiFlash.ids.includes(id) ? s.aiFlash.at : 0));
  return (
    <motion.section
      ref={ref}
      layout
      className="card"
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -60, scale: 0.9, transition: { duration: 0.18 } }}
      transition={spring}
    >
      {flashAt > 0 && (
        <motion.span
          key={flashAt}
          className="card-glow"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
      )}
      <motion.header layout="position">
        <motion.span className="card-icon" key={flashAt} initial={flashAt ? { rotate: -20, scale: 1.4 } : false} animate={{ rotate: 0, scale: 1 }} transition={spring}>
          {c.icon}
        </motion.span>
        <b>{c.title}</b>
        {flashAt > 0 && (
          <motion.span className="ai-badge" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
            ✦ AI
          </motion.span>
        )}
        <motion.button className="icon-btn" onClick={() => store.hide([id], "user")} aria-label="Close" whileTap={{ scale: 0.8, rotate: 90 }}>
          ✕
        </motion.button>
      </motion.header>
      <motion.div layout="position">
        <c.Panel />
      </motion.div>
    </motion.section>
  );
});

function Dock() {
  const visible = useStore((s) => s.visible).filter((id) => componentById(id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }), 60);
  }, [visible.length]);
  return (
    <div className="dock" ref={ref}>
      <AnimatePresence mode="popLayout">
        {!visible.length && (
          <motion.div key="empty" layout className="dock-empty dim small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Tools appear here when you need them. Ask the AI, or tap ☰ to open one yourself.
          </motion.div>
        )}
        {visible.map((id) => (
          <Card key={id} id={id} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toolbox({ onClose }: { onClose: () => void }) {
  const visible = useStore((s) => s.visible);
  return (
    <Sheet onClose={onClose}>
      <div className="row between">
        <h2>Components</h2>
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <motion.div className="grid" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.025, delayChildren: 0.08 } } }}>
        {COMPONENTS.map((c) => {
          const on = visible.includes(c.id);
          return (
            <motion.button
              key={c.id}
              className={"tile" + (on ? " on" : "")}
              variants={{ hidden: { opacity: 0, y: 16, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1, transition: spring } }}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                if (on) store.hide([c.id], "user");
                else store.show([c.id], "user");
                onClose();
              }}
            >
              <span className="tile-icon">{c.icon}</span>
              {c.title}
            </motion.button>
          );
        })}
      </motion.div>
    </Sheet>
  );
}

export function App() {
  const [settings, setSettings] = useState<AiSettings | null>(loadSettings);
  const [showConnect, setShowConnect] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [, force] = useState(0);
  const agent = useMemo(() => (settings ? new Agent(settings) : null), [settings]);

  useEffect(() => {
    restoreMedia().then(() => force((n) => n + 1));
    finishOpenRouterLogin()
      .then((s) => s && setSettings(s))
      .catch((e) => alert(e.message));
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="top">
          <motion.b className="logo" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
            CutKit
          </motion.b>
          <span className="grow" />
          {(
            [
              ["↶", "Undo", () => store.undo()],
              ["↷", "Redo", () => store.redo()],
              ["☰", "Components", () => setShowTools(true)],
            ] as const
          ).map(([icon, label, fn]) => (
            <motion.button key={label} className="icon-btn" onClick={fn} aria-label={label} whileTap={{ scale: 0.8 }}>
              {icon}
            </motion.button>
          ))}
          <motion.button
            className={"icon-btn" + (settings ? "" : " attn")}
            onClick={() => setShowConnect(true)}
            aria-label="AI settings"
            whileTap={{ scale: 0.8, rotate: 60 }}
            animate={settings ? { rotate: 0 } : { rotate: [0, 20, -20, 0] }}
            transition={settings ? spring : { duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
          >
            ⚙
          </motion.button>
        </header>
        <Preview />
        <Dock />
        <Chat agent={agent} onConnect={() => setShowConnect(true)} />
        <AnimatePresence>
          {showTools && <Toolbox key="tools" onClose={() => setShowTools(false)} />}
          {showConnect && (
            <Connect
              key="connect"
              current={settings}
              onClose={() => setShowConnect(false)}
              onDone={(s) => {
                setSettings(s);
                setShowConnect(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
