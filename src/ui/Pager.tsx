import { animate, motion, useDragControls, useMotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { store, useStore } from "../store";

const NO_SWIPE = "input, textarea, select, .no-swipe, .fcard, .radial, .paw, .scrim, .modal";

const WIDE = "(min-width: 1000px)";

function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia !== "undefined" && matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * Three screens: Tracks ◂ Video ▸ Talk. On a phone they sit side by side off-screen and you swipe
 * anywhere that is not a control. On a wide screen all three show at once.
 */
export function Pager({ children }: { children: [ReactNode, ReactNode, ReactNode] }) {
  const page = useStore((s) => s.page);
  const wide = useWide();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(390);
  const x = useMotionValue(-390);
  const drag = useDragControls();

  useEffect(() => {
    if (!ref.current) return; // wide layout has no swipe strip
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [wide]);
  // Only the swipe moves screens. Browsers scroll overflow:hidden boxes too (focus, scrollIntoView); undo that.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reset = () => {
      if (el.scrollLeft) el.scrollLeft = 0;
    };
    el.addEventListener("scroll", reset);
    return () => el.removeEventListener("scroll", reset);
  }, [wide]);
  useEffect(() => {
    const a = animate(x, -page * w, { type: "spring", stiffness: 380, damping: 40 });
    return () => a.stop();
  }, [page, w, x]);

  if (wide)
    return (
      <div className="panes">
        {children.map((c, i) => (
          <div key={i} className={"pane pane-" + ["tracks", "video", "talk"][i]}>
            {c}
          </div>
        ))}
      </div>
    );

  return (
    <div
      className="pager"
      ref={ref}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(NO_SWIPE)) return;
        drag.start(e);
      }}
    >
      <motion.div
        className="pager-strip"
        style={{ x, width: w * 3 }}
        drag="x"
        dragControls={drag}
        dragListener={false}
        dragDirectionLock
        dragConstraints={{ left: -2 * w, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const cur = store.get().page;
          let next: number = cur;
          if (info.offset.x < -w * 0.22 || info.velocity.x < -500) next = Math.min(2, cur + 1);
          else if (info.offset.x > w * 0.22 || info.velocity.x > 500) next = Math.max(0, cur - 1);
          if (next !== cur) store.set({ page: next as 0 | 1 | 2, radial: null });
          else animate(x, -cur * w, { type: "spring", stiffness: 380, damping: 40 });
        }}
      >
        {children.map((c, i) => (
          <div key={i} className="pager-page" style={{ width: w }} aria-hidden={i !== page}>
            {c}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
