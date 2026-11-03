import { AnimatePresence, MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Agent } from "./ai/agent";
import { session } from "./ai/session";
import { finishOpenRouterLogin, loadSettings, type AiSettings } from "./ai/settings";
import { restoreMedia } from "./media";
import { restoreSubjects } from "./subjects";
import { Connect } from "./ui/Connect";
import { Pager } from "./ui/Pager";
import { TalkScreen } from "./ui/TalkScreen";
import { TracksScreen } from "./ui/TracksScreen";
import { VideoScreen } from "./ui/VideoScreen";

export function App() {
  const [settings, setSettings] = useState<AiSettings | null>(loadSettings);
  const [showConnect, setShowConnect] = useState(false);
  const [, force] = useState(0);
  const agent = useMemo(() => (settings ? new Agent(settings) : null), [settings]);

  useEffect(() => {
    session.setAgent(agent, () => setShowConnect(true));
  }, [agent]);

  useEffect(() => {
    restoreMedia()
      .then(() => restoreSubjects())
      .then(() => force((n) => n + 1));
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
