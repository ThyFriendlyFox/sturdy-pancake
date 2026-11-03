import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { getEngine } from "../engine";
import { store, useStore } from "../store";
import { spring } from "./Sheet";

const mb = (n: number) => (n / 1e6 < 10 ? (n / 1e6).toFixed(1) : Math.round(n / 1e6).toString());

/** Shows each step of adding media: reading the file, the first frame on screen, saving to this phone. */
export function ImportProgress() {
  const job = useStore((s) => s.importing);
  const [frame, setFrame] = useState(false);

  // Watch for the first frame while a job is open.
  useEffect(() => {
    if (!job) return;
    setFrame(!!getEngine()?.hasFrame() && store.get().project.clips.length > 0);
    const t = setInterval(() => setFrame(!!getEngine()?.hasFrame() && store.get().project.clips.length > 0), 150);
    return () => clearInterval(t);
  }, [job?.at === undefined]);

  const files = job?.files ?? [];
  const reading = files.some((f) => f.phase === "reading");
  const saving = files.some((f) => f.phase === "saving");
  const visual = files.some((f) => f.phase !== "failed") && !files.every((f) => f.phase === "failed");
  const waitingFrame = visual && !reading && !frame;
  const finished = job && !reading && !saving && (frame || !visual);

  // Close a moment after everything is done.
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => store.get().importing === job && store.set({ importing: null }), 1400);
    return () => clearTimeout(t);
  }, [finished, job]);

  const total = files.reduce((a, f) => a + f.size, 0) || 1;
  const weight = (f: (typeof files)[number]) =>
    f.phase === "reading" ? 0.05 : f.phase === "saving" ? 0.15 + 0.85 * (f.saved / Math.max(1, f.size)) : 1;
  const pct = files.reduce((a, f) => a + weight(f) * (f.size / total), 0);
  const title = reading
    ? `Reading ${files.length > 1 ? files.length + " files" : "your video"}…`
    : waitingFrame
      ? "Loading the first frame…"
      : saving
        ? "Saving to this phone…"
        : files.every((f) => f.phase === "failed")
          ? "Could not read that file"
          : "Ready";

  return (
    <AnimatePresence>
      {job && (
        <motion.div
          className="import no-swipe"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, transition: { duration: 0.2 } }}
          transition={spring}
        >
          <div className="import-head">
            {finished ? (
              <motion.span className="import-check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}>
                ✓
              </motion.span>
            ) : (
              <span className="spinner small" />
            )}
            <b>{title}</b>
            <span className="mono dim">{Math.round(pct * 100)}%</span>
          </div>
          <div className="import-bar">
            <motion.div animate={{ width: `${Math.max(3, pct * 100)}%` }} transition={{ type: "spring", stiffness: 120, damping: 24 }} />
          </div>
          {files.slice(0, 3).map((f, i) => (
            <div key={i} className="import-row">
              <span className="ellipsis">{f.name}</span>
              <span className="dim small">
                {f.phase === "reading" && "Reading…"}
                {f.phase === "saving" && `Saving · ${mb(f.saved)} of ${mb(f.size)} MB`}
                {f.phase === "done" && `Saved · ${mb(f.size)} MB`}
                {f.phase === "unsaved" && "Not saved. Gone after a reload."}
                {f.phase === "failed" && "Cannot read this file"}
              </span>
            </div>
          ))}
          {files.length > 3 && <span className="dim small">+ {files.length - 3} more</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
