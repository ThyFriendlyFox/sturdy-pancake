import { useState } from "react";
import { getEngine } from "../engine";
import type { Aspect } from "../model";
import { useStore } from "../store";
import { telemetry } from "../telemetry";
import { Chips } from "../ui/controls";
import { editFor, type ComponentDef } from "./types";

// ---------- format ----------
const editF = editFor("format");
const ASPECTS: Aspect[] = ["9:16", "1:1", "4:5", "16:9"];
const ASPECT_LABEL: Record<Aspect, string> = { "9:16": "9:16 Story", "1:1": "1:1 Square", "4:5": "4:5 Post", "16:9": "16:9 Wide" };

function FormatPanel() {
  const aspect = useStore((s) => s.project.aspect);
  const bg = useStore((s) => s.project.background);
  return (
    <div className="stack">
      <Chips
        options={ASPECTS}
        value={aspect}
        label={(a) => ASPECT_LABEL[a]}
        onChange={(a) => editF("set_aspect", "user", { aspect: a }, (p) => ({ ...p, aspect: a }))}
      />
      <label className="color">
        Background{" "}
        <input
          type="color"
          value={bg}
          onChange={(e) => editF("set_background", "user", { color: e.target.value }, (p) => ({ ...p, background: e.target.value }), true)}
        />
      </label>
    </div>
  );
}

export const formatComponent: ComponentDef = {
  id: "format",
  title: "Format",
  icon: "▭",
  about: "Video shape (9:16, 1:1, 4:5, 16:9) and background color.",
  tools: [
    {
      name: "set_format",
      description: "Set aspect ratio and/or background color.",
      params: { aspect: { type: "string", enum: ASPECTS }, background: { type: "string" } },
      run: (a) => {
        editF("set_format", "ai", a, (p) => ({ ...p, aspect: a.aspect ?? p.aspect, background: a.background ?? p.background }));
        return "Format updated";
      },
    },
  ],
  Panel: FormatPanel,
};

// ---------- export ----------
function ExportPanel() {
  const [progress, setProgress] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const hasClips = useStore((s) => s.project.clips.length > 0);
  const run = async () => {
    const e = getEngine();
    if (!e) return;
    setFile(null);
    setProgress(0);
    try {
      const blob = await e.export(setProgress);
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      setFile(new File([blob], `cutkit-${Date.now()}.${ext}`, { type: blob.type }));
      telemetry.log({ kind: "export", source: "user", args: { bytes: blob.size, type: blob.type } });
    } catch (err) {
      alert((err as Error).message);
    }
    setProgress(null);
  };
  const save = async () => {
    if (!file) return;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "My video" });
        return;
      } catch {
        /* fall through to download */
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
  };
  return (
    <div className="stack">
      {progress !== null ? (
        <div className="progress">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
          <span>Rendering {Math.round(progress * 100)}% — keep this screen open</span>
        </div>
      ) : (
        <button className="btn primary wide" disabled={!hasClips} onClick={run}>
          Render video
        </button>
      )}
      {file && (
        <button className="btn wide" onClick={save}>
          Save / share ({(file.size / 1e6).toFixed(1)} MB)
        </button>
      )}
      <p className="dim small">Rendering plays the video once in real time, on your phone.</p>
    </div>
  );
}

export const exportComponent: ComponentDef = {
  id: "export",
  title: "Export",
  icon: "⤓",
  about: "Render the final video file and save/share it. Only the user can start it (show this component).",
  tools: [],
  Panel: ExportPanel,
};
