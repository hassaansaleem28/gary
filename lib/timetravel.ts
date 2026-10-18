import type { Tracer } from "./db";
import type { Resolved, ToolResult } from "./tools";

const day = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

// "What did we believe on <date>?" Decisions are never deleted: superseding one stamps superseded_at, so the graph
// can be read as of any moment. A decision was in force at t when at <= t < superseded_at.
export async function asOf(
  tx: Tracer,
  args: { subject: string; date: string },
  resolveFn: (tx: Tracer, t: string) => Promise<{ hit: Resolved | null; candidates: Resolved[] }>,
): Promise<ToolResult> {
  const t = Date.parse(args.date);
  if (Number.isNaN(t)) return { outcome: "empty", data: { error: `Could not read the date "${args.date}". Use YYYY-MM-DD.` }, nodes: [], cites: [] };
  const end = t + 86_399_999; // the whole day counts
  const { hit: s, candidates } = await resolveFn(tx, args.subject);
  if (!s) return { outcome: "unknown_subject", data: { subject: args.subject, note: "Not in the company graph.", similar: candidates.map((c) => c.name) }, nodes: [], cites: [] };

  const then = await tx.ro<{ key: string; statement: string; at: number; src: string | null; makers: string[]; replacedBy: string | null; replacedStatement: string | null; replacedAt: number | null }>(
    "as_of.decisions_then",
    `MATCH (s:Entity {key:$key})
     MATCH (d:Decision)-[:ABOUT]->(x)
     WHERE (x = s OR (s)-[:USES]->(x)) AND d.at <= $t AND (d.superseded_at IS NULL OR d.superseded_at > $t)
     OPTIONAL MATCH (d)-[:DECIDED_IN]->(src:Source)
     OPTIONAL MATCH (m:Person)-[:MADE]->(d)
     OPTIONAL MATCH (n:Decision)-[:SUPERSEDES]->(d)
     RETURN DISTINCT d.key AS key, d.statement AS statement, d.at AS at, src.key AS src, collect(DISTINCT m.name) AS makers,
            n.key AS replacedBy, n.statement AS replacedStatement, n.at AS replacedAt
     ORDER BY d.at`,
    { key: s.key, t: end },
  );

  const staleThen = await tx.ro<{ key: string; title: string; author: string | null; since: number }>(
    "as_of.stale_docs_then",
    `MATCH (s:Entity {key:$key})
     MATCH (old:Decision)-[:ABOUT]->(x) WHERE (x = s OR (s)-[:USES]->(x)) AND old.superseded_at IS NOT NULL AND old.superseded_at <= $t
     MATCH (doc:Doc {living:true}) WHERE doc.at <= $t AND ((doc)-[:ASSERTS]->(old) OR (old)-[:DECIDED_IN]->(doc))
     OPTIONAL MATCH (a:Person)-[:AUTHORED]->(doc)
     RETURN DISTINCT doc.key AS key, doc.title AS title, a.name AS author, min(old.superseded_at) AS since`,
    { key: s.key, t: end },
  );

  const changedSince = then.filter((d) => d.replacedBy).length;
  return {
    outcome: then.length ? "ok" : "empty",
    data: {
      subject: s,
      as_of: day(t),
      in_force_then: then.map((d) => ({
        key: d.key,
        statement: d.statement,
        decided: day(d.at),
        decided_by: d.makers,
        decided_in: d.src,
        later_replaced_by: d.replacedBy ? { key: d.replacedBy, statement: d.replacedStatement, on: day(d.replacedAt) } : null,
      })),
      already_stale_docs_then: staleThen.map((d) => ({ key: d.key, title: d.title, author: d.author, stale_since: day(d.since) })),
      note: then.length ? (changedSince ? `${changedSince} of these decisions changed after ${day(t)}.` : `Nothing about this has changed since ${day(t)}.`) : `No decision about ${s.name} was in force on ${day(t)}.`,
    },
    nodes: [s.key, ...then.flatMap((d) => [d.key, d.src, d.replacedBy].filter((x): x is string => !!x)), ...staleThen.map((d) => d.key)],
    cites: [...then.flatMap((d) => [d.key, d.src, d.replacedBy].filter((x): x is string => !!x)), ...staleThen.map((d) => d.key)],
  };
}
