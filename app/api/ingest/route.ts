import { Tracer } from "@/lib/db";
import { ingestLive } from "@/lib/ingest/pipeline";
import { slackSource, type Source } from "@/lib/ingest/sources";

export const maxDuration = 60;

// A new Slack message arrives: link it, extract decisions against the current graph, report what it changed.
export async function POST(req: Request) {
  const { author, channel, text, thread } = (await req.json()) as { author: string; channel: string; text: string; thread?: string };
  const tx = new Tracer();
  const id = `slack:live-${Date.now().toString(36)}`;
  const src = slackSource({ id, channel: channel.replace(/^#/, ""), author, at: new Date().toISOString(), text: String(text).slice(0, 1500), thread });
  let context: Source[] = [];
  if (thread) {
    const rows = await tx.ro<{ key: string; title: string; text: string; at: number }>(
      "ingest.thread_context",
      `MATCH (r:Source {key:$t}) OPTIONAL MATCH (m:Source)-[:REPLY_TO]->(r) WITH r, collect(m) AS ms UNWIND [r] + ms AS x RETURN x.key AS key, x.title AS title, x.text AS text, x.at AS at ORDER BY x.at`,
      { t: thread },
    );
    context = rows.map((r) => ({ key: r.key, kind: "Message", origin: "slack", title: r.title, text: r.text, at: r.at, participants: [], url: "" }));
  }
  try {
    const result = await ingestLive(tx, src, context);
    return Response.json({ ok: true, ...result, queries: tx.logs });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message), queries: tx.logs }, { status: 500 });
  }
}
