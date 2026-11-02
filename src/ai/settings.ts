export type Provider = "anthropic" | "openai" | "gemini" | "openrouter";

export interface AiSettings {
  provider: Provider;
  apiKey: string;
  model: string;
}

export const PROVIDERS: Record<Provider, { label: string; keyUrl: string; models: string[]; keyHint: string }> = {
  anthropic: {
    label: "Claude (Anthropic)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    keyHint: "sk-ant-…",
  },
  openai: { label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", models: ["gpt-5-mini", "gpt-5"], keyHint: "sk-…" },
  gemini: { label: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", models: ["gemini-flash-latest", "gemini-pro-latest"], keyHint: "AIza…" },
  openrouter: {
    label: "OpenRouter (sign in with Google, GitHub…)",
    keyUrl: "https://openrouter.ai/keys",
    models: ["anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash", "openai/gpt-5-mini"],
    keyHint: "sk-or-…",
  },
};

const KEY = "ck.ai";

export function loadSettings(): AiSettings | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return s?.apiKey ? s : null;
  } catch {
    return null;
  }
}

export function saveSettings(s: AiSettings | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// ---------- OpenRouter sign-in (OAuth PKCE, no server needed) ----------
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function startOpenRouterLogin() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("ck.pkce", verifier);
  const cb = location.origin + location.pathname;
  location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(cb)}&code_challenge=${challenge}&code_challenge_method=S256`;
}

/** If we just came back from OpenRouter, trade the code for a key. */
export async function finishOpenRouterLogin(): Promise<AiSettings | null> {
  const code = new URLSearchParams(location.search).get("code");
  const verifier = sessionStorage.getItem("ck.pkce");
  if (!code || !verifier) return null;
  history.replaceState(null, "", location.pathname);
  sessionStorage.removeItem("ck.pkce");
  const r = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  });
  if (!r.ok) throw new Error("OpenRouter sign-in failed");
  const { key } = await r.json();
  const s: AiSettings = { provider: "openrouter", apiKey: key, model: PROVIDERS.openrouter.models[0] };
  saveSettings(s);
  return s;
}
