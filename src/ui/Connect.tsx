import { useState } from "react";
import { PROVIDERS, saveSettings, startOpenRouterLogin, type AiSettings, type Provider } from "../ai/settings";
import { telemetry } from "../telemetry";

export function Connect(props: { current: AiSettings | null; onDone: (s: AiSettings | null) => void; onClose?: () => void }) {
  const [provider, setProvider] = useState<Provider>(props.current?.provider ?? "anthropic");
  const [apiKey, setKey] = useState(props.current?.provider === provider ? props.current.apiKey : "");
  const [model, setModel] = useState(props.current?.model ?? PROVIDERS[provider].models[0]);
  const [share, setShare] = useState(telemetry.enabled);
  const info = PROVIDERS[provider];

  const pick = (p: Provider) => {
    setProvider(p);
    setModel(props.current?.provider === p ? props.current.model : PROVIDERS[p].models[0]);
    setKey(props.current?.provider === p ? props.current.apiKey : "");
  };
  const save = () => {
    telemetry.setEnabled(share);
    const s = { provider, apiKey: apiKey.trim(), model: model.trim() };
    saveSettings(s);
    props.onDone(s);
  };

  return (
    <div className="modal">
      <div className="modal-card stack">
        <div className="row between">
          <h2>Connect an AI</h2>
          {props.onClose && (
            <button className="icon-btn" onClick={props.onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <p className="dim small">The AI edits your video and opens the tools you need. Your key stays on this phone and goes straight to the provider.</p>

        <button className="btn primary wide" onClick={() => void startOpenRouterLogin()}>
          Sign in with Google / GitHub (via OpenRouter)
        </button>
        <div className="or">or use your own API key</div>

        <div className="chips">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button key={p} className={"chip" + (p === provider ? " on" : "")} onClick={() => pick(p)}>
              {PROVIDERS[p].label.split(" (")[0]}
            </button>
          ))}
        </div>
        <input type="password" autoComplete="off" placeholder={info.keyHint} value={apiKey} onChange={(e) => setKey(e.target.value)} />
        <a className="small" href={info.keyUrl} target="_blank" rel="noreferrer">
          Get a {info.label.split(" (")[0]} key ↗
        </a>
        <label className="small dim">Model</label>
        <input list="models" value={model} onChange={(e) => setModel(e.target.value)} />
        <datalist id="models">
          {info.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <label className="toggle small">
          <span>Help improve the AI by sharing anonymous edit data (which tools were used and how — never your video files or your key)</span>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
        </label>

        <button className="btn primary wide" disabled={!apiKey.trim() || !model.trim()} onClick={save}>
          Save
        </button>
        {props.current && (
          <button
            className="btn small danger"
            onClick={() => {
              saveSettings(null);
              props.onDone(null);
            }}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
