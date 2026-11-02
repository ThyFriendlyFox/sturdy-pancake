import { newClip } from "../model";
import { pickFiles } from "../media";
import { store, useStore } from "../store";
import { Empty } from "../ui/controls";
import { editFor, type ComponentDef } from "./types";

const edit = editFor("media");

function Panel() {
  const media = useStore((s) => s.media);
  const add = async () => {
    const ms = await pickFiles();
    const vids = ms.filter((m) => m.kind !== "audio");
    if (vids.length)
      edit("add_clips", "user", { mediaIds: vids.map((m) => m.id) }, (p) => ({ ...p, clips: [...p.clips, ...vids.map(newClip)] }));
    const song = ms.find((m) => m.kind === "audio");
    if (song && !store.get().project.music.mediaId)
      edit("use_as_music", "user", { mediaId: song.id }, (p) => ({ ...p, music: { ...p.music, mediaId: song.id } }));
  };
  return (
    <div className="stack">
      <button className="btn primary wide" onClick={add}>
        + Add videos, photos or music
      </button>
      {!media.length && <Empty>Files stay on your phone. Nothing is uploaded.</Empty>}
      <ul className="list">
        {media.map((m) => (
          <li key={m.id}>
            <span className="tag">{m.kind}</span>
            <span className="grow ellipsis">{m.name}</span>
            <span className="mono dim">{m.duration ? m.duration.toFixed(1) + "s" : ""}</span>
            {m.kind !== "audio" ? (
              <button
                className="btn small"
                onClick={() => edit("add_clips", "user", { mediaIds: [m.id] }, (p) => ({ ...p, clips: [...p.clips, newClip(m)] }))}
              >
                + clip
              </button>
            ) : (
              <button
                className="btn small"
                onClick={() => edit("use_as_music", "user", { mediaId: m.id }, (p) => ({ ...p, music: { ...p.music, mediaId: m.id } }))}
              >
                use as music
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const mediaComponent: ComponentDef = {
  id: "media",
  title: "Media",
  icon: "🗂",
  about:
    "Import videos, photos and audio from the phone. The AI cannot open the file picker; show this component and ask the user to tap the button.",
  tools: [],
  Panel,
};
