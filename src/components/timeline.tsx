import { useRef, useState } from "react";
import { getEngine } from "../engine";
import { layout, totalDuration } from "../model";
import { store, useStore } from "../store";
import { Empty, fmtTime } from "../ui/controls";
import type { ComponentDef } from "./types";

function Panel() {
  const project = useStore((s) => s.project);
  const media = useStore((s) => s.media);
  const time = useStore((s) => s.time);
  const sel = useStore((s) => s.selectedClipId);
  const [zoom, setZoom] = useState(40); // px per second
  const ref = useRef<HTMLDivElement>(null);
  const dur = Math.max(totalDuration(project), 1);
  const placed = layout(project);
  const W = dur * zoom;

  const seekFromEvent = (clientX: number) => {
    const el = ref.current!;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - 8;
    getEngine()?.seek(Math.max(0, x / zoom));
  };

  if (!project.clips.length && !project.voice.voiceovers.length) return <Empty>Add a clip to see the timeline.</Empty>;

  const bar = (start: number, end: number) => ({ left: 8 + start * zoom, width: Math.max(4, (end - start) * zoom) });
  const song = media.find((m) => m.id === project.music.mediaId);

  return (
    <div className="stack">
      <div className="row between">
        <span className="mono">
          {fmtTime(time)} / {fmtTime(dur)}
        </span>
        <span className="row">
          <button className="btn small" onClick={() => setZoom((z) => Math.max(8, z / 1.5))}>−</button>
          <button className="btn small" onClick={() => setZoom((z) => Math.min(300, z * 1.5))}>+</button>
        </span>
      </div>
      <div
        className="tl"
        ref={ref}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest(".tl-clip")) return;
          seekFromEvent(e.clientX);
          const move = (ev: PointerEvent) => seekFromEvent(ev.clientX);
          const up = () => (window.removeEventListener("pointermove", move), window.removeEventListener("pointerup", up));
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <div className="tl-inner" style={{ width: W + 16 }}>
          <div className="tl-ruler">
            {Array.from({ length: Math.ceil(dur) + 1 }, (_, i) =>
              i % Math.max(1, Math.round(40 / zoom)) === 0 ? (
                <span key={i} style={{ left: 8 + i * zoom }}>
                  {i}s
                </span>
              ) : null,
            )}
          </div>
          <div className="tl-track">
            {placed.map((pl) => (
              <button
                key={pl.clip.id}
                className={"tl-clip video" + (pl.clip.id === sel ? " on" : "")}
                style={bar(pl.start, pl.end)}
                onClick={() => {
                  store.set({ selectedClipId: pl.clip.id });
                  getEngine()?.seek(pl.start + 0.01);
                }}
              >
                {pl.clip.transition.type !== "none" && <i className="tl-tr" />}
                {pl.index + 1}. {media.find((m) => m.id === pl.clip.mediaId)?.name}
              </button>
            ))}
          </div>
          {project.voice.voiceovers.length > 0 && (
            <div className="tl-track">
              {project.voice.voiceovers.map((v) => (
                <div key={v.id} className="tl-clip voice" style={bar(v.start, v.start + v.out - v.in)}>
                  🎙 voiceover
                </div>
              ))}
            </div>
          )}
          {song && (
            <div className="tl-track">
              <div className="tl-clip music" style={bar(0, dur)}>
                ♪ {song.name}
              </div>
            </div>
          )}
          {project.texts.length > 0 && (
            <div className="tl-track">
              {project.texts.map((x) => (
                <div key={x.id} className="tl-clip text" style={bar(x.start, x.end)}>
                  T {x.text}
                </div>
              ))}
            </div>
          )}
          {project.motions.length > 0 && (
            <div className="tl-track">
              {project.motions.map((m) => (
                <div key={m.id} className="tl-clip motion" style={bar(m.start, m.end)}>
                  ✦ {m.preset}
                </div>
              ))}
            </div>
          )}
          <div className="tl-head" style={{ left: 8 + time * zoom }} />
        </div>
      </div>
    </div>
  );
}

export const timelineComponent: ComponentDef = {
  id: "timeline",
  title: "Timeline",
  icon: "▤",
  about: "Visual timeline of every track (video, voiceovers, music, text, motion) with the playhead. Use to seek, play/pause or select a clip.",
  tools: [
    {
      name: "seek",
      description: "Move the playhead to a time in seconds.",
      params: { time: { type: "number" } },
      required: ["time"],
      run: ({ time }) => {
        getEngine()?.seek(+time);
        return `Playhead at ${(+time).toFixed(2)}s`;
      },
    },
    {
      name: "play_pause",
      description: "Start or stop preview playback.",
      params: { play: { type: "boolean" } },
      required: ["play"],
      run: ({ play }) => {
        const e = getEngine();
        if (play) void e?.play();
        else e?.pause();
        return play ? "Playing" : "Paused";
      },
    },
    {
      name: "select_clip",
      description: "Select a clip so manual panels edit it, and move the playhead to its start.",
      params: { clipId: { type: "string" } },
      required: ["clipId"],
      run: ({ clipId }) => {
        const pl = layout(store.get().project).find((p) => p.clip.id === clipId);
        if (!pl) return "No such clip";
        store.set({ selectedClipId: clipId });
        getEngine()?.seek(pl.start + 0.01);
        return "Selected";
      },
    },
  ],
  Panel,
};
