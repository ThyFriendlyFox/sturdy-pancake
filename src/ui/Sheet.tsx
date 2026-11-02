import { motion, useDragControls } from "motion/react";
import type { ReactNode } from "react";

export const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;

/** Bottom sheet: slides up, swipe down (or tap outside) to close. Render inside <AnimatePresence>. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const drag = useDragControls();
  return (
    <motion.div className="modal" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={spring}
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 600) onClose();
        }}
      >
        <div className="grabber" onPointerDown={(e) => drag.start(e)}>
          <span />
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
