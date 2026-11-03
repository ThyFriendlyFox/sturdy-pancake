import { AnimatePresence, motion } from "motion/react";
import { componentById } from "../components";
import { store, useStore } from "../store";
import { spring } from "./Sheet";
import { Icon } from "./icons";

/**
 * Components appear here as a floating card over the video: the newest one in `visible` is on top.
 * Swipe it down (or tap ✕) to hide it. Other open components wait as tabs.
 */
export function CardHost() {
  const visible = useStore((s) => s.visible).filter((id) => componentById(id));
  const flash = useStore((s) => s.aiFlash);
  const id = visible.at(-1);
  const c = id ? componentById(id) : null;
  const byAi = !!id && flash.ids.includes(id) && Date.now() - flash.at < 60000;
  return (
    <AnimatePresence mode="popLayout">
      {c && (
        <motion.section
          key={c.id}
          className={"fcard" + (byAi ? " ai" : "")}
          initial={{ y: 420, opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 420, opacity: 0, transition: { duration: 0.22 } }}
          transition={spring}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            if (info.offset.y > 90 || info.velocity.y > 600) store.hide([c.id], "user");
          }}
          aria-label={c.title}
        >
          <div className="grabber" aria-hidden="true">
            <span />
          </div>
          <header>
            <span className="card-icon">{c.icon}</span>
            <b>{c.title}</b>
            {byAi && <span className="ai-badge">AI set this</span>}
            <button className="icon-btn" aria-label={`Close ${c.title}`} onClick={() => store.hide([c.id], "user")}>
              <Icon name="x" size={16} stroke={2} />
            </button>
          </header>
          {visible.length > 1 && (
            <div className="chips scroll card-tabs">
              {visible
                .slice(0, -1)
                .reverse()
                .map((v) => (
                  <button key={v} className="chip" onClick={() => store.show([v], "user")}>
                    {componentById(v)!.title}
                  </button>
                ))}
            </div>
          )}
          <div className="fcard-body" onPointerDown={(e) => e.stopPropagation()}>
            <c.Panel />
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
