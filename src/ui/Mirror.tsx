import { useEffect, useRef } from "react";
import { getEngine } from "../engine";

/** A live copy of the preview canvas: the blurred backdrop and the mini players. */
export function Mirror({ className, fps = 12, scale = 0.25 }: { className?: string; fps?: number; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0,
      last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / fps) return;
      last = now;
      const src = getEngine()?.canvas,
        c = ref.current;
      if (!src || !c || !src.width) return;
      const w = Math.max(1, Math.round(src.width * scale)),
        h = Math.max(1, Math.round(src.height * scale));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      c.getContext("2d")!.drawImage(src, 0, 0, w, h);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, scale]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
