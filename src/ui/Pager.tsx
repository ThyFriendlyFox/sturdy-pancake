import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { store, useStore } from "../store";

// Controls that need sideways drags themselves. Everything else swipes; up/down scrolling stays native.
const NO_SWIPE = "input, textarea, select, .no-swipe, .fcard, .radial, .modal";
const WIDE = "(min-width: 1000px)";
const SPRING = { type: "spring", stiffness: 380, damping: 40 } as const;

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
 * Three screens: Tracks ◂ Video ▸ Talk. On a phone, swipe anywhere that is not a control; one swipe moves
 * one screen. Pointer events are handled directly (not per animation frame), so swipes still register when
 * the page is busy. On a wide screen all three show at once.
 */
export function Pager({ children }: { children: [ReactNode, ReactNode, ReactNode] }) {
  const page = useStore((s) => s.page);
  const wide = useWide();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(390);
  const x = useMotionValue(-390);

  useEffect(() => {
    if (!ref.current) return; // wide layout has no swipe strip
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [wide]);
  // Only swipes move screens. Browsers scroll overflow boxes too (focus, scrollIntoView); undo that.
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
    const a = animate(x, -page * w, SPRING);
    return () => a.stop();
  }, [page, w, x]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || (e.target as HTMLElement).closest(NO_SWIPE)) return;
    const start = { x: e.clientX, y: e.clientY, t: performance.now() };
    const from = store.get().page;
    let mode: "undecided" | "swipe" | "scroll" = "undecided";
    let lastX = start.x;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      lastX = ev.clientX;
      const dx = ev.clientX - start.x,
        dy = ev.clientY - start.y;
      if (mode === "undecided") {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) mode = "swipe";
        else if (Math.abs(dy) > 10) mode = "scroll";
      }
      if (mode === "swipe") {
        // Follow the finger, with resistance past the first and last screen.
        let pos = -from * w + dx;
        if (pos > 0) pos *= 0.3;
        if (pos < -2 * w) pos = -2 * w + (pos + 2 * w) * 0.3;
        x.set(pos);
      }
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (mode !== "swipe") return;
      // A cancelled pointer (the browser took over, e.g. text selection or scrolling) still counts: use the
      // last position the finger reached.
      const dx = (ev.type === "pointerup" ? ev.clientX : lastX) - start.x;
      const speed = dx / Math.max(1, performance.now() - start.t); // px per ms
      let next: number = from;
      if (dx < -w * 0.2 || speed < -0.5) next = Math.min(2, from + 1);
      else if (dx > w * 0.2 || speed > 0.5) next = Math.max(0, from - 1);
      if (next !== from) store.set({ page: next as 0 | 1 | 2, radial: null });
      else animate(x, -from * w, SPRING);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

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
    <div className="pager" ref={ref} onPointerDown={onPointerDown}>
      <motion.div className="pager-strip" style={{ x, width: w * 3 }}>
        {children.map((c, i) => (
          <div key={i} className="pager-page" style={{ width: w }} aria-hidden={i !== page}>
            {c}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
