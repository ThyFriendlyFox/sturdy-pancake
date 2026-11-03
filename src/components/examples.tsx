import { motion } from "motion/react";
import { analyzeExample } from "../examples";
import { pickFiles } from "../media";
import { uid } from "../model";
import { store, useStore, type Recipe } from "../store";
import { telemetry } from "../telemetry";
import { Empty } from "../ui/controls";
import type { ComponentDef } from "./types";

/** Runs a recipe's enabled moves through the same tools the AI uses. Set by the agent module (avoids an import cycle). */
let runCalls: ((calls: { tool: string; args: Record<string, unknown> }[]) => Promise<string[]>) | null = null;
export const setRecipeRunner = (fn: typeof runCalls) => (runCalls = fn);

export function RecipeCard({ r }: { r: Recipe }) {
  const toggle = (i: number) =>
    store.set({
      recipes: store
        .get()
        .recipes.map((x) => (x.id === r.id ? { ...x, moves: x.moves.map((m, j) => (j === i ? { ...m, on: !m.on } : m)) } : x)),
    });
  const apply = async () => {
    if (!runCalls) return;
    const moves = r.moves.filter((m) => m.on);
    telemetry.log({
      kind: "edit",
      source: "user",
      component: "examples",
      tool: "apply_recipe",
      args: { title: r.title, moves: moves.map((m) => m.name) },
    });
    await runCalls(moves.flatMap((m) => m.calls));
    store.set({ recipes: store.get().recipes.map((x) => (x.id === r.id ? { ...x, applied: true } : x)) });
    store.toast(`Applied ${moves.length} move${moves.length === 1 ? "" : "s"}`, true);
  };
  return (
    <div className="recipe stack">
      <div className="row between">
        <b>{r.title}</b>
        <span className="dim small">{r.moves.length} moves found</span>
      </div>
      {r.moves.map((m, i) => (
        <div key={i} className="move">
          <span className="stack" style={{ gap: 2, flex: 1 }}>
            <span>{m.name}</span>
            <span className="dim small">{m.detail}</span>
          </span>
          <button
            className={"switch" + (m.on ? " on" : "")}
            role="switch"
            aria-checked={m.on}
            aria-label={m.name}
            onClick={() => toggle(i)}
          >
            <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 35 }} />
          </button>
        </div>
      ))}
      <button className="btn primary wide" disabled={r.applied || !r.moves.some((m) => m.on)} onClick={apply}>
        {r.applied ? "Applied" : "Apply to my video"}
      </button>
    </div>
  );
}

function Panel() {
  const recipes = useStore((s) => s.recipes);
  return (
    <div className="stack">
      <button className="btn wide" onClick={() => pickFiles("video/*", "example")}>
        + Add an example video
      </button>
      {!recipes.length && <Empty>Add an example and ask the AI to copy its edit.</Empty>}
      {recipes.map((r) => (
        <RecipeCard key={r.id} r={r} />
      ))}
    </div>
  );
}

export const examplesComponent: ComponentDef = {
  id: "examples",
  title: "Copy an edit",
  icon: "⧉",
  about:
    "Example videos the user wants to copy. Analyze one, then propose a recipe: a list of moves, each made of your tool calls. The user picks moves and applies them.",
  tools: [
    {
      name: "analyze_example",
      description:
        "Look at an example video (media with role 'example'): returns a contact sheet image, shot-change times, average shot length, tempo and motion.",
      params: { mediaId: { type: "string" } },
      required: ["mediaId"],
      run: async ({ mediaId }) => {
        const a = await analyzeExample(mediaId);
        return {
          text: JSON.stringify({ duration: a.duration, cuts: a.cuts, avgShot: a.avgShot, bpm: a.bpm, motion: a.motion }),
          imageDataUrl: a.sheet,
        };
      },
    },
    {
      name: "propose_recipe",
      description:
        "Show the user a recipe card: the moves you found in an example, each with the exact tool calls that recreate it on their video. Nothing changes until the user taps Apply.",
      params: {
        title: { type: "string" },
        moves: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              detail: { type: "string", description: "Short, e.g. 'Every 0.5 s, to your song'" },
              calls: {
                type: "array",
                items: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" } }, required: ["tool", "args"] },
              },
            },
            required: ["name", "detail", "calls"],
          },
        },
      },
      required: ["title", "moves"],
      run: (a) => {
        const r: Recipe = {
          id: uid("r_"),
          title: String(a.title ?? "Recipe"),
          moves: (a.moves ?? []).map((m: any) => ({
            name: String(m.name),
            detail: String(m.detail ?? ""),
            calls: m.calls ?? [],
            on: true,
          })),
          applied: false,
        };
        store.set({ recipes: [...store.get().recipes, r] });
        return `Showing the recipe with ${r.moves.length} moves. Wait for the user to apply it.`;
      },
    },
  ],
  Panel,
};
