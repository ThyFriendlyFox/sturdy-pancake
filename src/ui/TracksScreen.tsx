import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { detectBeats } from "../beats";
import { componentById } from "../components";
import { getEngine } from "../engine";
import { defaultFilters, layout, totalDuration } from "../model";
import { mediaUrl, pickFiles } from "../media";
import { newClip } from "../model";
import { store, useStore } from "../store";
import { thumbnail } from "../thumbs";
import { fmtTime } from "./controls";
import { Icon } from "./icons";
import { Mirror } from "./Mirror";
import { addClips } from "./Paw";
import { spring } from "./Sheet";

interface Block {
  key: string;
  start: number;
  end: number;
  label?: string;
  color: string;
  img?: string;
  diamond?: boolean;
}

interface Lane {
  key: string;
  name: string;
  icon: ReactNode;
  comps: string[]; // component ids shown when the lane opens
  blocks: Block[];
  wave?: number[]; // 0..1 heights across the lane
  sub?: { label: string; blocks: Block[] }[];
  empty: string;
}

const peaksCache = new Map<string, Promise<number[]>>();
function useSongPeaks(mediaId: string | null) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    if (!mediaId) return setPeaks(null);
    const url = mediaUrl(mediaId);
    if (!url) return;
    if (!peaksCache.has(mediaId))
      peaksCache.set(
        mediaId,
        detectBeats(url)
          .then((s) => s.peaks)
          .catch(() => []),
      );
    let alive = true;
    peaksCache.get(mediaId)!.then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [mediaId]);
  return peaks;
}

function useClipThumbs() {
  const clips = useStore((s) => s.project.clips);
  const media = useStore((s) => s.media);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    for (const c of clips) {
      const m = media.find((x) => x.id === c.mediaId);
      if (!m || m.kind === "audio") continue;
      void thumbnail(m.id, c.in + 0.05, m.kind).then((src) => alive && setThumbs((t) => (t[c.id] === src ? t : { ...t, [c.id]: src })));
    }
    return () => {
      alive = false;
    };
  }, [clips, media]);
  return thumbs;
}

function useLanes(): Lane[] {
  const p = useStore((s) => s.project);
  const media = useStore((s) => s.media);
  const thumbs = useClipThumbs();
  const dur = Math.max(0.01, totalDuration(p));
  const placed = layout(p);
  const song = media.find((m) => m.id === p.music.mediaId);
  const peaks = useSongPeaks(song?.id ?? null);

  let musicWave: number[] | undefined;
  if (song && peaks?.length) {
    const n = 64;
    musicWave = Array.from({ length: n }, (_, i) => {
      const t = p.music.offset + (i / n) * dur;
      const v = peaks[Math.min(peaks.length - 1, Math.floor((t / song.duration) * peaks.length))] ?? 0;
      const tl = (i / n) * dur;
      const fade = Math.min(1, p.music.fadeIn ? tl / p.music.fadeIn : 1, p.music.fadeOut ? (dur - tl) / p.music.fadeOut : 1);
      return Math.max(0.06, v * fade * p.music.volume);
    });
  }

  return [
    {
      key: "video",
      name: "Video",
      icon: <Icon name="video" size={14} stroke={2} />,
      comps: ["video_track", "cuts", "transitions"],
      blocks: placed.flatMap((pl) => [
        { key: pl.clip.id, start: pl.start, end: pl.end, color: "#3d3d8f", img: thumbs[pl.clip.id] },
        ...(pl.index > 0 && pl.clip.transition.type !== "none"
          ? [{ key: pl.clip.id + "tr", start: pl.start, end: pl.start, color: "#FF5A6E", diamond: true }]
          : []),
      ]),
      empty: "Add clips",
    },
    {
      key: "text",
      name: "Text",
      icon: <Icon name="text" size={14} stroke={2} />,
      comps: ["text"],
      blocks: p.texts.map((x) => ({ key: x.id, start: x.start, end: x.end, color: "#E8DCC8", label: x.text })),
      empty: "No text",
    },
    {
      key: "motion",
      name: "Motion",
      icon: <Icon name="motion" size={14} stroke={2} />,
      comps: ["motion"],
      blocks: p.motions.map((m) => ({
        key: m.id,
        start: m.start,
        end: m.end,
        color: "#FFD25A",
        label: m.preset,
        diamond: m.end - m.start < 0.6,
      })),
      empty: "No effects",
    },
    {
      key: "voice",
      name: "Voice",
      icon: <Icon name="voice" size={14} stroke={2} />,
      comps: ["voice", "pitch"],
      blocks: [
        ...(p.clips.length
          ? [
              {
                key: "clipsound",
                start: 0,
                end: placed.at(-1)?.end ?? 0,
                color: "rgba(90,209,255,0.18)",
                label: p.voice.muted
                  ? "Muted"
                  : p.voice.pitch
                    ? `Clip sound · ${p.voice.pitch > 0 ? "+" : ""}${p.voice.pitch} st`
                    : "Clip sound",
              },
            ]
          : []),
        ...p.voice.voiceovers.map((v) => ({
          key: v.id,
          start: v.start,
          end: v.start + v.out - v.in,
          color: "#5AD1FF",
          label: "Voiceover",
        })),
      ],
      empty: "No sound",
    },
    {
      key: "music",
      name: "Music",
      icon: <Icon name="music" size={14} stroke={2} />,
      comps: ["music"],
      blocks: song && !musicWave ? [{ key: "song", start: 0, end: dur, color: "rgba(255,90,110,0.4)", label: song.name }] : [],
      wave: musicWave,
      empty: "No music",
    },
    {
      key: "look",
      name: "Look",
      icon: <Icon name="look" size={14} stroke={2} />,
      comps: ["color", "format"],
      blocks: placed
        .filter((pl) => JSON.stringify(pl.clip.filters) !== JSON.stringify(defaultFilters()))
        .map((pl) => ({ key: pl.clip.id, start: pl.start, end: pl.end, color: "linear-gradient(90deg,#C98A5A,#E2B07A)", label: "Color" })),
      empty: "Original",
    },
  ];
}

function LaneBar({ lane, dur, time, small }: { lane: Lane; dur: number; time: number; small?: boolean }) {
  const pct = (t: number) => `${(t / dur) * 100}%`;
  return (
    <span className={"lane" + (small ? " small" : "")}>
      {lane.wave ? (
        <span className="lane-wave">
          {lane.wave.map((v, i) => (
            <i key={i} style={{ height: `${Math.round(v * 100)}%` }} />
          ))}
        </span>
      ) : null}
      {lane.blocks.map((b) =>
        b.diamond ? (
          <i key={b.key} className="diamond" style={{ left: pct(b.start), background: b.color }} />
        ) : (
          <span
            key={b.key}
            className="blk"
            style={{ left: pct(b.start), width: pct(Math.max(0.05, b.end - b.start)), background: b.img ? undefined : b.color }}
          >
            {b.img ? <img src={b.img} alt="" /> : <span className="blk-label">{b.label}</span>}
          </span>
        ),
      )}
      {!lane.blocks.length && !lane.wave && <span className="lane-empty">{lane.empty}</span>}
      <i className="lane-head" style={{ left: pct(time) }} />
    </span>
  );
}

function LanePanel({ lane }: { lane: Lane }) {
  const [tab, setTab] = useState(0);
  const comp = lane.comps[Math.min(tab, lane.comps.length - 1)];
  const Body = componentById(comp)?.Panel;
  return (
    <motion.div
      className="lane-panel"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={spring}
    >
      {lane.comps.length > 1 && (
        <div className="chips">
          {lane.comps.map((c, i) => (
            <button key={c} className={"chip" + (i === tab ? " on" : "")} onClick={() => setTab(i)}>
              {componentById(c)?.title}
            </button>
          ))}
        </div>
      )}
      {Body && <Body />}
    </motion.div>
  );
}

const ADD = [
  { label: "Clips", lane: "video" },
  { label: "Text", lane: "text" },
  { label: "Motion", lane: "motion" },
  { label: "Music", lane: "music" },
  { label: "Voiceover", lane: "voice" },
  { label: "Example to copy", lane: "examples" },
];

export function TracksScreen() {
  const lanes = useLanes();
  const time = useStore((s) => s.time);
  const dur = useStore((s) => Math.max(0.01, totalDuration(s.project)));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const ruler = useRef<HTMLDivElement>(null);
  const seek = (x: number) => {
    const r = ruler.current!.getBoundingClientRect();
    getEngine()?.seek(Math.max(0, Math.min(1, (x - r.left) / r.width)) * dur);
  };
  const add = (lane: string) => {
    setAdding(false);
    if (lane === "video")
      return void pickFiles("video/*,image/*").then((ms) => {
        const vids = ms.filter((m) => m.kind !== "audio");
        if (vids.length)
          store.edit("media", "add_clips", "user", { mediaIds: vids.map((m) => m.id) }, (p) => ({
            ...p,
            clips: [...p.clips, ...vids.map(newClip)],
          }));
      });
    if (lane === "examples") return store.set({ page: 2 });
    setOpen(lane);
  };
  return (
    <div className="screen tracks-screen">
      <div className="dots" aria-label="Screen 1 of 3">
        <button className="on" aria-label="Tracks" />
        <button aria-label="Video" onClick={() => store.set({ page: 1 })} />
        <button aria-label="Talk" onClick={() => store.set({ page: 2 })} />
      </div>
      <header className="screen-head">
        <div className="stack" style={{ gap: 2, flex: 1 }}>
          <h1>Tracks</h1>
          <span className="dim small">
            {fmtTime(dur)} · {lanes.length} tracks · tap one to open it
          </span>
        </div>
        <button className="btn small" onClick={addClips}>
          + Clips
        </button>
        <button
          className="btn small"
          onClick={() => {
            store.show(["export"], "user");
            store.set({ page: 1 });
          }}
        >
          Export
        </button>
        <button className="mini" aria-label="Back to the video" onClick={() => store.set({ page: 1 })}>
          <Mirror fps={6} scale={0.15} />
        </button>
      </header>

      <div className="lanes">
        <div className="lane-row ruler-row">
          <span className="lane-name" />
          <div
            className="ruler no-swipe"
            ref={ruler}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seek(e.clientX);
            }}
            onPointerMove={(e) => e.buttons && seek(e.clientX)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f} style={{ left: `${f * 100}%` }}>
                {fmtTime(f * dur).replace(/\.\d$/, "")}
              </span>
            ))}
            <i className="lane-head" style={{ left: `${(time / dur) * 100}%` }} />
          </div>
        </div>
        {lanes.map((lane) => {
          const isOpen = open === lane.key;
          return (
            <motion.div key={lane.key} layout="position" className={"lane-group" + (isOpen ? " open" : "")} transition={spring}>
              <button className="lane-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : lane.key)}>
                <span className="lane-name">
                  <span className="lane-ico">{lane.icon}</span>
                  <span className="ellipsis">{lane.name}</span>
                </span>
                <LaneBar lane={lane} dur={dur} time={time} />
              </button>
              {lane.sub?.map((s) => (
                <div key={s.label} className="lane-row sub">
                  <span className="lane-name">{s.label}</span>
                  <LaneBar lane={{ ...lane, blocks: s.blocks, wave: undefined }} dur={dur} time={time} small />
                </div>
              ))}
              <AnimatePresence initial={false}>{isOpen && <LanePanel key="p" lane={lane} />}</AnimatePresence>
            </motion.div>
          );
        })}
        <div className="add-track">
          <AnimatePresence mode="wait" initial={false}>
            {adding ? (
              <motion.div
                key="choices"
                className="chips"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {ADD.map((a) => (
                  <button key={a.label} className="chip" onClick={() => add(a.lane)}>
                    + {a.label}
                  </button>
                ))}
                <button className="chip" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="btn"
                className="btn wide dashed"
                onClick={() => setAdding(true)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                + Add a track
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
