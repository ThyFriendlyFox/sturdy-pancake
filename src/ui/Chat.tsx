import { useEffect, useRef, useState } from "react";
import type { Agent } from "../ai/agent";
import { useStore } from "../store";

export interface ChatMsg {
  role: "user" | "ai" | "tool";
  text: string;
}

const STARTERS_EMPTY = ["Help me get started", "I want to make a vlog"];
const STARTERS = ["Add a title at the start", "Make it look warmer", "Cut the first 2 seconds", "Lower my voice pitch", "Add confetti at the end", "Let me trim this clip"];

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
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setBusy(true);
    await props.agent.send(t, {
      onText: (x) => setMsgs((m) => [...m, { role: "ai", text: x }]),
      onTool: (name) => setMsgs((m) => [...m, { role: "tool", text: name.replace(/_/g, " ") }]),
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
        {shown.map((m, i) =>
          m.role === "tool" ? (
            <div key={i} className="msg tool">
              ✓ {m.text}
            </div>
          ) : (
            <div key={i} className={"msg " + m.role}>
              {m.text}
            </div>
          ),
        )}
        {busy && <div className="msg ai typing">…</div>}
        {!msgs.length && (
          <div className="chips">
            {(hasClips ? STARTERS : STARTERS_EMPTY).map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
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
        <button className="btn primary" disabled={busy || !text.trim()}>
          ↑
        </button>
      </form>
    </div>
  );
}
