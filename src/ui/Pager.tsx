import { animate, motion, useDragControls, useMotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { store, useStore } from "../store";

const NO_SWIPE = "input, textarea, select, .no-swipe, .fcard, .radial, .paw, .scrim, .modal";

/** Three screens side by side: Tracks ◂ Video ▸ Talk. Swipe anywhere that is not a control. */
export function Pager({ children }: { children: [ReactNode, ReactNode, ReactNode] }) {
  const page = useStore((s) => s.page);
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(390);
  const x = useMotionValue(-390);
  const drag = useDragControls();

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const a = animate(x, -page * w, { type: "spring", stiffness: 380, damping: 40 });
    return () => a.stop();
  }, [page, w, x]);

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
