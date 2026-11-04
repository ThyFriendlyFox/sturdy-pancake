import { AnimatePresence, MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Agent } from "./ai/agent";
import { session } from "./ai/session";
import { finishOpenRouterLogin, loadSettings, type AiSettings } from "./ai/settings";
import { restoreMedia } from "./media";
import { Connect } from "./ui/Connect";
import { Pager } from "./ui/Pager";
import { TalkScreen } from "./ui/TalkScreen";
import { TracksScreen } from "./ui/TracksScreen";
import { VideoScreen } from "./ui/VideoScreen";

/** Masking (0.3–0.5) left saved masks and crash counters on the device. Free that space once. */
function removeMaskingLeftovers() {
  try {
    if (localStorage.getItem("ck.masksRemoved")) return;
    indexedDB.deleteDatabase("ck-masks");
    for (const k of ["ck.segBusy", "ck.segCrashes", "ck.masksRemoved"]) localStorage.removeItem(k);
    localStorage.setItem("ck.masksRemoved", "1");
  } catch {
    /* private mode */
  }
}

export function App() {
  const [settings, setSettings] = useState<AiSettings | null>(loadSettings);
  const [showConnect, setShowConnect] = useState(false);
  const [, force] = useState(0);
  const agent = useMemo(() => (settings ? new Agent(settings) : null), [settings]);

  useEffect(() => {
    session.setAgent(agent, () => setShowConnect(true));
  }, [agent]);

  useEffect(() => {
    removeMaskingLeftovers();
    restoreMedia().then(() => force((n) => n + 1));
    finishOpenRouterLogin()
      .then((s) => s && setSettings(s))
      .catch((e) => alert(e.message));
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <Pager>
          <TracksScreen />
          <VideoScreen />
          <TalkScreen onSettings={() => setShowConnect(true)} />
        </Pager>
        <AnimatePresence>
          {showConnect && (
            <Connect
              key="connect"
              current={settings}
              onClose={() => setShowConnect(false)}
              onDone={(s) => {
                setSettings(s);
                setShowConnect(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
