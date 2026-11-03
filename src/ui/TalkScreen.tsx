import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { session, useBusy, useSession } from "../ai/session";
import { RecipeCard } from "../components/examples";
import { pickFiles } from "../media";
import { store, useStore } from "../store";
import { useHoldToTalk } from "./Paw";
import { Icon } from "./icons";
import { Mirror } from "./Mirror";
import { spring } from "./Sheet";

const STARTERS_EMPTY = ["Help me get started", "I want to make a vlog"];
const STARTERS = [
  "Make it look warmer",
  "Add a title at the start",
  "Cut it to the beat",
  "Lower my voice pitch",
  "Add confetti at the end",
];

export function TalkScreen({ onSettings }: { onSettings: () => void }) {
  const msgs = useSession();
  const busy = useBusy();
  const recipes = useStore((s) => s.recipes);
  const hasClips = useStore((s) => s.project.clips.length > 0);
  const listening = useStore((s) => s.listening);
  const heard = useStore((s) => s.heard);
  const note = useStore((s) => s.voiceNote);
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const hold = useHoldToTalk(() => store.toast("Hold to talk"));

  // Scroll only the message list. scrollIntoView would also scroll the screen strip sideways onto this screen.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, busy, listening]);

  const send = (t: string) => {
    if (!t.trim()) return;
    setText("");
    void session.ask(t);
  };
  const attach = async () => {
    const [m] = await pickFiles("video/*", "example");
    if (m) send(`Copy the edit from this example video (media ${m.id}).`);
  };

  return (
    <div className="screen talk-screen">
      <div className="dots" aria-label="Screen 3 of 3">
        <button aria-label="Tracks" onClick={() => store.set({ page: 0 })} />
        <button aria-label="Video" onClick={() => store.set({ page: 1 })} />
        <button className="on" aria-label="Talk" />
      </div>
      <header className="talk-head">
        <button className="mini-card" onClick={() => store.set({ page: 1 })} aria-label="Back to the video">
          <Mirror className="mini-video" fps={8} scale={0.15} />
          <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1, textAlign: "left" }}>
            <b>Your video</b>
            <span className="dim small">Keeps playing · swipe right</span>
          </span>
        </button>
        <button className="icon-btn" aria-label="AI settings" onClick={onSettings}>
          <Icon name="gear" size={20} />
        </button>
      </header>

      <div className="talk-log no-swipe" ref={log}>
        <AnimatePresence initial={false}>
          {msgs.map((m) => {
            if (m.recipeId) {
              const r = recipes.find((x) => x.id === m.recipeId);
              return r ? (
                <motion.div key={m.id} layout="position" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
                  <RecipeCard r={r} />
                </motion.div>
              ) : null;
            }
            if (m.role === "tool")
              return (
                <motion.span
                  key={m.id}
                  layout="position"
                  className="act"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={spring}
                >
                  ✓ {m.text}
                </motion.span>
              );
            return (
              <motion.div
                key={m.id}
                layout="position"
                className={"msg " + m.role}
                style={{ originX: m.role === "user" ? 1 : 0 }}
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={spring}
              >
                {m.text}
              </motion.div>
            );
          })}
          {listening && (
            <motion.div key="heard" className="msg user listening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {heard || note || "Listening…"}
            </motion.div>
          )}
          {busy && (
            <motion.div key="typing" className="msg ai typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {[0, 1, 2].map((i) => (
                <motion.i key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {!msgs.length && (
          <div className="stack" style={{ marginTop: "auto" }}>
            <p className="talk-hello">What should we make?</p>
            <div className="chips">
              {(hasClips ? STARTERS : STARTERS_EMPTY).map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
              <button className="chip" onClick={attach}>
                Copy an edit from a video…
              </button>
            </div>
          </div>
        )}
      </div>

      <form
        className="talk-input no-swipe"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label className="field">
          <span className="sr">Message</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type, or hold the paw" enterKeyHint="send" />
          <button type="button" className="icon-btn" aria-label="Add an example video to copy" onClick={attach}>
            <Icon name="attach" size={18} />
          </button>
        </label>
        {text.trim() ? (
          <motion.button className="send" aria-label="Send" whileTap={{ scale: 0.85 }} disabled={busy}>
            <Icon name="send" size={20} stroke={2.2} />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            className={"pad small" + (listening ? " listening" : "")}
            aria-label="Hold to talk"
            {...hold}
            animate={{ scale: listening ? 1.15 : 1 }}
          >
            <Icon name="mic" size={24} />
          </motion.button>
        )}
      </form>
    </div>
  );
}
