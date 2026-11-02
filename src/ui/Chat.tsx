import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Agent } from "../ai/agent";
import { useStore } from "../store";
import { spring } from "./Sheet";

export interface ChatMsg {
  id: number;
  role: "user" | "ai" | "tool";
  text: string;
}

let nextId = 1;
const msg = (role: ChatMsg["role"], text: string): ChatMsg => ({ id: nextId++, role, text });

const STARTERS_EMPTY = ["Help me get started", "I want to make a vlog"];
const STARTERS = [
  "Add a title at the start",
  "Make it look warmer",
  "Cut the first 2 seconds",
  "Lower my voice pitch",
  "Add confetti at the end",
  "Let me trim this clip",
];

export function Chat(props: { agent: Agent | null; onConnect: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const hasClips = useStore((s) => s.project.clips.length > 0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, open]);

  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    if (!props.agent) return props.onConnect();
    setText("");
    setMsgs((m) => [...m, msg("user", t)]);
    setBusy(true);
    await props.agent.send(t, {
      onText: (x) => setMsgs((m) => [...m, msg("ai", x)]),
      onTool: (name) => setMsgs((m) => [...m, msg("tool", name.replace(/_/g, " "))]),
    });
    setBusy(false);
  };

  const shown = open ? msgs : msgs.slice(-3);
  return (
    <div className={"chat" + (open ? " open" : "")}>
      {msgs.length > 3 && (
        <button className="chat-toggle" onClick={() => setOpen(!open)}>
          {open ? "▾ Hide chat" : `▴ Show all ${msgs.length} messages`}
        </button>
      )}
      <div className="chat-log">
        <AnimatePresence initial={false}>
          {shown.map((m) =>
            m.role === "tool" ? (
              <motion.div
                key={m.id}
                layout="position"
                className="msg tool"
                initial={{ opacity: 0, x: -12, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={spring}
              >
                <motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring, delay: 0.08 }}>
                  ✓
                </motion.span>{" "}
                {m.text}
              </motion.div>
            ) : (
              <motion.div
                key={m.id}
                layout="position"
                className={"msg " + m.role}
                style={{ originX: m.role === "user" ? 1 : 0, originY: 1 }}
                initial={{ opacity: 0, y: 14, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={spring}
              >
                {m.text}
              </motion.div>
            ),
          )}
          {busy && (
            <motion.div
              key="typing"
              layout="position"
              className="msg ai typing"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.i key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {!msgs.length && (
          <motion.div className="chips" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
            {(hasClips ? STARTERS : STARTERS_EMPTY).map((s) => (
              <motion.button
                key={s}
                className="chip"
                onClick={() => send(s)}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                whileTap={{ scale: 0.92 }}
              >
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}
        <div ref={end} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={props.agent ? "Tell the AI what to change…" : "Connect an AI to start"}
          enterKeyHint="send"
          onFocus={() => !props.agent && props.onConnect()}
        />
        <motion.button
          className="btn primary"
          disabled={busy || !text.trim()}
          whileTap={{ scale: 0.85, y: -3 }}
          animate={{ scale: text.trim() ? 1 : 0.9, opacity: text.trim() ? 1 : 0.5 }}
          transition={spring}
        >
          ↑
        </motion.button>
      </form>
    </div>
  );
}
