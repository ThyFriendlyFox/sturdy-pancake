import Anthropic from "@anthropic-ai/sdk";
import { ALL_TOOLS } from "../components";
import { setRecipeRunner } from "../components/examples";
import type { ToolOutput } from "../components/types";
import { store } from "../store";
import { telemetry } from "../telemetry";
import { systemPrompt } from "./prompt";
import type { AiSettings } from "./settings";

export interface AgentEvents {
  onText: (text: string) => void;
  onTool: (name: string, args: unknown, result: string) => void;
}

const MAX_STEPS = 14;

async function runTool(name: string, args: Record<string, unknown>): Promise<ToolOutput> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `Unknown tool ${name}` };
  try {
    const r = await tool.run(args ?? {});
    return typeof r === "string" ? { text: r } : r;
  } catch (e) {
    return { text: `Error: ${(e as Error).message}` };
  }
}

setRecipeRunner(async (calls) => {
  const out: string[] = [];
  for (const c of calls) out.push((await runTool(c.tool, c.args)).text);
  return out;
});

const withState = (text: string) => `<editor_state>${JSON.stringify(store.snapshot())}</editor_state>\n\n${text}`;

const schemaFor = (t: (typeof ALL_TOOLS)[number]) => ({
  type: "object" as const,
  properties: t.params,
  required: t.required ?? [],
});

// Server-side refusal fallback is supported on these models.
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"];

export class Agent {
  private settings: AiSettings;
  private anthropicHistory: Anthropic.MessageParam[] = [];
  private oaHistory: any[] = [];

  constructor(settings: AiSettings) {
    this.settings = settings;
  }

  reset() {
    this.anthropicHistory = [];
    this.oaHistory = [];
  }

  async send(text: string, ev: AgentEvents) {
    const turn = crypto.randomUUID();
    store.setTurn(turn);
    telemetry.log({ kind: "chat_user", source: "user", text, state: store.snapshot(), turn });
    const marks = [this.anthropicHistory.length, this.oaHistory.length];
    try {
      if (this.settings.provider === "anthropic") await this.sendAnthropic(text, ev, turn);
      else await this.sendOpenAI(text, ev, turn);
    } catch (e) {
      // Drop the failed turn so history never ends on an unanswered tool call.
      this.anthropicHistory.length = marks[0];
      this.oaHistory.length = marks[1];
      const msg = errorText(e);
      telemetry.log({ kind: "ai_error", source: "ai", text: msg, turn });
      ev.onText(msg);
    } finally {
      store.setTurn(undefined);
    }
  }

  // ---------- Claude ----------
  private async sendAnthropic(text: string, ev: AgentEvents, turn: string) {
    const client = new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
    const tools: Anthropic.Tool[] = ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: schemaFor(t) }));
    const messages = this.anthropicHistory;
    messages.push({ role: "user", content: withState(text) });
    const model = this.settings.model;
    const useFallback = FALLBACK_MODELS.includes(model);

    for (let step = 0; step < MAX_STEPS; step++) {
      const body = {
        model,
        max_tokens: 16000,
        system: systemPrompt(),
        tools,
        messages,
        cache_control: { type: "ephemeral" },
        output_config: { effort: "low" },
        ...(useFallback ? { fallbacks: "default" } : {}),
      } as unknown as Anthropic.MessageCreateParamsNonStreaming;
      const res = await client.messages.create(
        body,
        useFallback ? { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } } : undefined,
      );

      messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
      const said = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (said) {
        ev.onText(said);
        telemetry.log({ kind: "chat_ai", source: "ai", text: said, turn });
      }
      if ((res.stop_reason as string) === "refusal") {
        ev.onText("The AI declined that request.");
        // Leave history consistent for the next turn.
        messages.pop();
        return;
      }
      if (res.stop_reason === "pause_turn") continue;
      if (res.stop_reason !== "tool_use") return;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        const out = await runTool(b.name, b.input as Record<string, unknown>);
        ev.onTool(b.name, b.input, out.text);
        results.push({
          type: "tool_result",
          tool_use_id: b.id,
          content: out.imageDataUrl
            ? [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: out.imageDataUrl.split(",")[1] } },
                { type: "text", text: out.text },
              ]
            : out.text,
        });
      }
      messages.push({ role: "user", content: results });
    }
  }

  // ---------- OpenAI-compatible (OpenAI, Gemini, OpenRouter) ----------
  private async sendOpenAI(text: string, ev: AgentEvents, turn: string) {
    const { provider, apiKey, model } = this.settings;
    const url = {
      openai: "https://api.openai.com/v1/chat/completions",
      gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      openrouter: "https://openrouter.ai/api/v1/chat/completions",
      anthropic: "",
    }[provider];
    const tools = ALL_TOOLS.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: schemaFor(t) },
    }));
    const msgs = this.oaHistory;
    msgs.push({ role: "user", content: withState(text) });

    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          ...(provider === "openrouter" ? { "HTTP-Referer": location.origin, "X-Title": "CutKit" } : {}),
        },
        body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt() }, ...msgs], tools }),
      });
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
      const data = await r.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error("Empty response");
      msgs.push(msg);
      const said = typeof msg.content === "string" ? msg.content.trim() : "";
      if (said) {
        ev.onText(said);
        telemetry.log({ kind: "chat_ai", source: "ai", text: said, turn });
      }
      const calls = msg.tool_calls ?? [];
      if (!calls.length) return;
      const images: string[] = [];
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function.arguments || "{}");
        } catch {
          /* bad json */
        }
        const out = await runTool(c.function.name, args);
        ev.onTool(c.function.name, args, out.text);
        if (out.imageDataUrl) images.push(out.imageDataUrl);
        msgs.push({ role: "tool", tool_call_id: c.id, content: out.text });
      }
      if (images.length)
        msgs.push({
          role: "user",
          content: [
            { type: "text", text: "Frames from view_frame:" },
            ...images.map((u) => ({ type: "image_url", image_url: { url: u } })),
          ],
        });
    }
  }
}

function errorText(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return "That API key was rejected. Check it in Settings.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the AI provider. Try again in a moment.";
  if (e instanceof Anthropic.APIError) return `AI error ${e.status ?? ""}: ${e.message}`;
  const m = (e as Error)?.message ?? String(e);
  if (/401|403/.test(m)) return "That API key was rejected. Check it in Settings.";
  return "AI error: " + m;
}
