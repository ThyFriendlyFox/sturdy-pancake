// Collects edit events from the app. Stored privately in Vercel Blob (when connected),
// one JSONL file per batch: events/YYYY-MM-DD/<session>-<time>.jsonl
import { put } from "@vercel/blob";

const MAX_BYTES = 256 * 1024;

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return new Response("too large", { status: 413 });
  let body: { userId?: string; sessionId?: string; ua?: string; events?: unknown[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
  if (!events.length) return new Response(null, { status: 204 });

  const safeId = (s: unknown) =>
    String(s ?? "anon")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .slice(0, 40) || "anon";
  const meta = { userId: safeId(body.userId), sessionId: safeId(body.sessionId), ua: String(body.ua ?? "").slice(0, 200) };
  const lines = events.map((e) => JSON.stringify({ ...meta, ...(e as object) })).join("\n") + "\n";

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const day = new Date().toISOString().slice(0, 10);
    await put(`events/${day}/${meta.sessionId}-${Date.now()}.jsonl`, lines, {
      access: "private",
      contentType: "application/x-ndjson",
      addRandomSuffix: true,
    });
  } else {
    console.log("[events]", lines);
  }
  return new Response(null, { status: 204 });
}
