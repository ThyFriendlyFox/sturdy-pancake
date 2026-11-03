import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSession, useBusy } from "../ai/session";
import { Engine, getEngine, setEngine } from "../engine";
import { totalDuration } from "../model";
import { store, useStore } from "../store";
import { hitSubject, isolate, useModelProgress, warmup } from "../subjects";
import { SubjectStatusLine, Thumb } from "../components/subject";
import { CardHost } from "./CardHost";
import { ImportProgress } from "./ImportProgress";
import { fmtTime } from "./controls";
import { Icon } from "./icons";
import { Mirror } from "./Mirror";
import { listen, RadialPaw, setPendingSubject } from "./Paw";
import { cancelListening } from "../voice";
import { spring } from "./Sheet";

/** Screen point → canvas point (0..1), honoring object-fit: contain. */
function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  const k = Math.min(r.width / canvas.width, r.height / canvas.height);
  const w = canvas.width * k,
    h = canvas.height * k;
  const x = (clientX - r.left - (r.width - w) / 2) / w,
    y = (clientY - r.top - (r.height - h) / 2) / h;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

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

function SubjectChip() {
  const id = useStore((s) => s.selectedSubjectId);
  const s = useStore((st) => st.project.subjects.find((x) => x.id === id));
  return (
    <AnimatePresence>
      {s && (
        <motion.div
          className="subject-chip no-swipe"
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          transition={spring}
        >
          <Thumb id={s.id} size={32} />
          <span className="stack" style={{ gap: 1, minWidth: 0 }}>
            <b className="ellipsis">{s.name}</b>
            <SubjectStatusLine id={s.id} />
          </span>
          <button className="icon-btn" aria-label="Done" onClick={() => store.set({ selectedSubjectId: null, radial: null })}>
            <Icon name="x" size={16} stroke={2} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => store.get().toast === toast && store.set({ toast: null }), toast.undo ? 5000 : 3500);
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

/** Under the paw ring while the model works: download progress the first time, then "Finding it". */
function FindingLabel() {
  const radial = useStore((s) => s.radial);
  const p = useModelProgress();
  if (!radial?.finding) return null;
  return (
    <motion.div className="finding" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      {p < 1 ? `Getting the cut-out tool ready · ${Math.round(p * 100)}%` : "Finding it…"}
      {p < 1 && (
        <span className="import-bar">
          <motion.span
            style={{ display: "block", height: "100%", background: "var(--accent)" }}
            animate={{ width: `${Math.max(4, p * 100)}%` }}
          />
        </span>
      )}
    </motion.div>
  );
}

function TapHint() {
  const show = useStore((s) => s.project.subjects.length === 0 && !s.radial && !s.listening && s.visible.length === 0);
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
          Tap anything and say what to change
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
  // Fetch the cut-out model only after the video is up, so it does not compete with loading it.
  useEffect(() => {
    if (empty) return;
    const t = setTimeout(warmup, 5000);
    return () => clearTimeout(t);
  }, [empty]);

  // A tap opens the paw menu and starts listening in the same tap (iPhone allows the microphone only there).
  const onTap = (clientX: number, clientY: number) => {
    const e = getEngine();
    if (!e || !canvas.current) return;
    if (store.get().radial) {
      cancelListening();
      return store.set({ radial: null });
    }
    const box = root.current!.getBoundingClientRect();
    const at = { x: clientX - box.left, y: clientY - box.top };
    const open = (subjectId: string | null, finding: boolean) => store.set({ radial: { ...at, subjectId, finding } });
    if (empty) {
      open(null, false);
      setPendingSubject(Promise.resolve(null));
      listen();
      return;
    }
    e.pause();
    const p = canvasPoint(canvas.current, clientX, clientY);
    const hit = p && e.toSource(e.t, p.x, p.y);
    const existing = hit ? hitSubject(hit.clipId, hit.sourceT, hit.point) : null;
    if (!hit || existing) {
      if (existing) store.set({ selectedSubjectId: existing });
      open(existing, false);
      setPendingSubject(Promise.resolve(existing));
      listen();
      return;
    }
    open(null, true);
    store.set({ selectedSubjectId: null });
    setPendingSubject(
      isolate(hit.clipId, hit.sourceT, hit.point, "user").then(
        (id) => {
          if (store.get().radial) open(id, false);
          store.set({ selectedSubjectId: id });
          return id;
        },
        (err) => {
          if (store.get().radial) open(null, false);
          store.toast((err as Error).message || "Could not find anything there");
          return null;
        },
      ),
    );
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
          <SubjectChip />
          <TapHint />
          <Progress />
          <FindingLabel />
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
