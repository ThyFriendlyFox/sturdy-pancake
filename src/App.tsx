import { useEffect, useMemo, useRef, useState } from "react";
import { Agent } from "./ai/agent";
import { finishOpenRouterLogin, loadSettings, type AiSettings } from "./ai/settings";
import { COMPONENTS, componentById } from "./components";
import { Engine, getEngine, setEngine } from "./engine";
import { newClip, totalDuration } from "./model";
import { pickFiles, restoreMedia } from "./media";
import { store, useStore } from "./store";
import { Chat } from "./ui/Chat";
import { Connect } from "./ui/Connect";
import { fmtTime } from "./ui/controls";

function Preview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const playing = useStore((s) => s.playing);
  const time = useStore((s) => s.time);
  const dur = useStore((s) => totalDuration(s.project));
  const empty = useStore((s) => s.project.clips.length === 0);
  useEffect(() => {
    if (ref.current && !getEngine()) setEngine(new Engine(ref.current));
  }, []);
  const toggle = () => {
    const e = getEngine();
    if (!e) return;
    if (e.playing) e.pause();
    else void e.play();
  };
  const addFirst = async () => {
    const ms = await pickFiles();
    const vids = ms.filter((m) => m.kind !== "audio");
    if (vids.length) store.edit("media", "add_clips", "user", { mediaIds: vids.map((m) => m.id) }, (p) => ({ ...p, clips: [...p.clips, ...vids.map(newClip)] }));
    const song = ms.find((m) => m.kind === "audio");
    if (song) store.edit("media", "use_as_music", "user", { mediaId: song.id }, (p) => ({ ...p, music: { ...p.music, mediaId: song.id } }));
  };
  return (
    <div className="preview">
      <canvas ref={ref} onClick={empty ? undefined : toggle} />
      {empty ? (
        <button className="preview-empty" onClick={addFirst}>
          <span className="big">＋</span>
          Add videos, photos or music
        </button>
      ) : (
        <div className="preview-bar">
          <button className="icon-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(dur, 0.01)}
            step={0.01}
            value={time}
            onChange={(e) => getEngine()?.seek(+e.target.value)}
          />
          <span className="mono small">
            {fmtTime(time)}/{fmtTime(dur)}
          </span>
        </div>
      )}
    </div>
  );
}

function Dock() {
  const visible = useStore((s) => s.visible);
  const last = useRef<HTMLDivElement>(null);
  useEffect(() => {
    last.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visible.length]);
  if (!visible.length)
    return <div className="dock-empty dim small">Tools appear here when you need them. Ask the AI, or tap ☰ to open one yourself.</div>;
  return (
    <div className="dock">
      {visible.map((id, i) => {
        const c = componentById(id);
        if (!c) return null;
        return (
          <section key={id} className="card" ref={i === visible.length - 1 ? last : undefined}>
            <header>
              <span className="card-icon">{c.icon}</span>
              <b>{c.title}</b>
              <button className="icon-btn" onClick={() => store.hide([id], "user")} aria-label="Close">
                ✕
              </button>
            </header>
            <c.Panel />
          </section>
        );
      })}
    </div>
  );
}

function Toolbox({ onClose }: { onClose: () => void }) {
  const visible = useStore((s) => s.visible);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Components</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="grid">
          {COMPONENTS.map((c) => {
            const on = visible.includes(c.id);
            return (
              <button
                key={c.id}
                className={"tile" + (on ? " on" : "")}
                onClick={() => {
                  if (on) store.hide([c.id], "user");
                  else store.show([c.id], "user");
                  onClose();
                }}
              >
                <span className="tile-icon">{c.icon}</span>
                {c.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [settings, setSettings] = useState<AiSettings | null>(loadSettings);
  const [showConnect, setShowConnect] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [, force] = useState(0);
  const agent = useMemo(() => (settings ? new Agent(settings) : null), [settings]);

  useEffect(() => {
    restoreMedia().then(() => force((n) => n + 1));
    finishOpenRouterLogin()
      .then((s) => s && setSettings(s))
      .catch((e) => alert(e.message));
  }, []);

  return (
    <div className="app">
      <header className="top">
        <b className="logo">CutKit</b>
        <span className="grow" />
        <button className="icon-btn" onClick={() => store.undo()} aria-label="Undo">
          ↶
        </button>
        <button className="icon-btn" onClick={() => store.redo()} aria-label="Redo">
          ↷
        </button>
        <button className="icon-btn" onClick={() => setShowTools(true)} aria-label="Components">
          ☰
        </button>
        <button className={"icon-btn" + (settings ? "" : " attn")} onClick={() => setShowConnect(true)} aria-label="AI settings">
          ⚙
        </button>
      </header>
      <Preview />
      <Dock />
      <Chat agent={agent} onConnect={() => setShowConnect(true)} />
      {showTools && <Toolbox onClose={() => setShowTools(false)} />}
      {showConnect && (
        <Connect
          current={settings}
          onClose={() => setShowConnect(false)}
          onDone={(s) => {
            setSettings(s);
            setShowConnect(false);
          }}
        />
      )}
    </div>
  );
}
