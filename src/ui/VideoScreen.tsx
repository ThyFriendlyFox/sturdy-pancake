import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSession, useBusy } from "../ai/session";
import { Engine, getEngine, setEngine } from "../engine";
import { totalDuration } from "../model";
import { store, useStore } from "../store";
import { CardHost } from "./CardHost";
import { ImportProgress } from "./ImportProgress";
import { fmtTime } from "./controls";
import { Icon } from "./icons";
import { Mirror } from "./Mirror";
import { listen, RadialPaw } from "./Paw";
import { cancelListening } from "../voice";
import { spring } from "./Sheet";

function Progress() {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const dur = useStore((s) => totalDuration(s.project));
  const ref = useRef<HTMLDivElement>(null);
  const seek = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    getEngine()?.seek(Math.max(0, Math.min(1, (x - r.left) / r.width)) * dur);
  };
  return (
    <div className="progress-row no-swipe">
      <motion.button
        className="play"
        aria-label={playing ? "Pause" : "Play"}
        whileTap={{ scale: 0.85 }}
        onClick={() => {
          const e = getEngine();
          if (e?.playing) e.pause();
          else {
            store.set({ radial: null });
            void e?.play();
          }
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={playing ? "p" : "l"}
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
            transition={spring}
          >
            <Icon name={playing ? "pause" : "play"} size={18} stroke={2.2} />
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <span className="mono">{fmtTime(time)}</span>
      <div
        className="bar"
        ref={ref}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && seek(e.clientX)}
      >
        <div className="bar-fill" style={{ width: `${dur ? (time / dur) * 100 : 0}%` }} />
      </div>
      <span className="mono">{fmtTime(dur)}</span>
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(
      () => store.get().toast === toast && store.set({ toast: null }),
      toast.undo ? 5000 : Math.max(3500, toast.text.length * 60),
    );
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.at}
          className="toast no-swipe"
          initial={{ y: -20, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={spring}
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                store.undo();
                store.set({ toast: null });
              }}
            >
              Undo
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** What the user is saying, live, and the AI's short answer after. */
function VoiceLayer() {
  const listening = useStore((s) => s.listening);
  const heard = useStore((s) => s.heard);
  const note = useStore((s) => s.voiceNote);
  const busy = useBusy();
  const msgs = useSession();
  const page = useStore((s) => s.page);
  const [caption, setCaption] = useState<string | null>(null);
  const seen = useRef(msgs.length);
  useEffect(() => {
    const fresh = msgs.slice(seen.current);
    seen.current = msgs.length;
    const said = fresh.filter((m) => m.role === "ai" && m.text).at(-1);
    if (said && page === 1) {
      setCaption(said.text);
      const t = setTimeout(() => setCaption(null), 6000);
      return () => clearTimeout(t);
    }
  }, [msgs, page]);
  return (
    <AnimatePresence>
      {listening && (
        <motion.div
          key="listen"
          className="voice"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={spring}
        >
          <div className="wave" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <motion.i
                key={i}
                animate={{ scaleY: [0.3, 1, 0.4, 0.8, 0.3] }}
                transition={{ duration: 0.9 + (i % 4) * 0.15, repeat: Infinity, delay: i * 0.05 }}
              />
            ))}
            <span>{note || "Listening"}</span>
          </div>
          <p className="heard">{heard ? `“${heard}”` : "Say what to change"}</p>
        </motion.div>
      )}
      {!listening && busy && page === 1 && (
        <motion.div
          key="busy"
          className="thinking"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.i key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }} />
          ))}
        </motion.div>
      )}
      {!listening && !busy && caption && (
        <motion.button
          key="cap"
          className="caption"
          onClick={() => store.set({ page: 2 })}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          {caption}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** True while clips exist but the one under the playhead has no frame to show (iPhone before the first tap). */
function useNoFrame() {
  const has = useStore((s) => s.project.clips.length > 0);
  const [noFrame, setNoFrame] = useState(false);
  useEffect(() => {
    if (!has) return setNoFrame(false);
    const t = setInterval(() => setNoFrame(!getEngine()?.hasFrame()), 500);
    return () => clearInterval(t);
  }, [has]);
  return noFrame;
}

function TapHint() {
  const noFrame = useNoFrame();
  const idle = useStore((s) => !s.radial && !s.listening && s.visible.length === 0);
  const show = noFrame || idle;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="tap-hint"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0 } }}
          transition={{ delay: 0.6 }}
        >
          {noFrame ? "Tap to show your video" : "Tap anything and say what to change"}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function VideoScreen() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const empty = useStore((s) => s.project.clips.length === 0);
  const importing = useStore((s) => !!s.importing);
  const radialOpen = useStore((s) => !!s.radial);
  const [size, setSize] = useState({ w: 390, h: 844 });
  const down = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (canvas.current && !getEngine()) setEngine(new Engine(canvas.current));
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(root.current!);
    return () => ro.disconnect();
  }, []);

  // A tap opens the paw menu and starts listening in the same tap (iPhone allows the microphone only there).
  const onTap = (clientX: number, clientY: number) => {
    const e = getEngine();
    if (!e || !canvas.current) return;
    if (store.get().radial) {
      cancelListening();
      return store.set({ radial: null });
    }
    // No frame yet (iPhone after a reload): this tap only wakes the video.
    if (!empty && !e.hasFrame()) {
      e.prime();
      return;
    }
    e.pause();
    const box = root.current!.getBoundingClientRect();
    store.set({ radial: { x: clientX - box.left, y: clientY - box.top } });
    listen();
  };

  return (
    <div className="screen video-screen" ref={root}>
      <Mirror className="backdrop" fps={6} scale={0.03} />
      <canvas
        ref={canvas}
        className="stage"
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY, t: Date.now() })}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && Date.now() - d.t < 450) void onTap(e.clientX, e.clientY);
        }}
      />
      <div className="dots" aria-label="Screen 2 of 3">
        <button aria-label="Tracks" onClick={() => store.set({ page: 0 })} />
        <button className="on" aria-label="Video" />
        <button aria-label="Talk" onClick={() => store.set({ page: 2 })} />
      </div>
      <i className="edge left" aria-hidden="true" />
      <i className="edge right" aria-hidden="true" />

      {empty ? (
        !importing &&
        !radialOpen && (
          <div className="empty-hint">
            <motion.span className="big" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>
              <Icon name="plus" size={40} />
            </motion.span>
            Tap anywhere to start
          </div>
        )
      ) : (
        <>
          <TapHint />
          <Progress />
        </>
      )}
      <RadialPaw width={size.w} height={size.h} />
      <Toast />
      <ImportProgress />
      <VoiceLayer />
      <CardHost />
    </div>
  );
}
