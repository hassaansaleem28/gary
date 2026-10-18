import { z } from "zod";
import { chatJSON } from "../llm";
import type { Tracer } from "../db";
import type { Source } from "./sources";

export const Extraction = z.object({
  decisions: z
    .array(
      z.object({
        statement: z.string(),
        about: z.array(z.string()).default([]),
        made_by: z.array(z.string()).default([]),
        decided_in: z.string().optional(),
        supersedes: z.array(z.string()).default([]),
        because_of: z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string())).default([]),
      }),
    )
    .default([]),
  asserts: z.array(z.string()).default([]),
  absences: z.array(z.object({ handle: z.string(), from: z.string(), to: z.string().optional() })).default([]),
});
export type Extraction = z.infer<typeof Extraction>;

const SYSTEM = `You extract DECISIONS from company records into a knowledge graph. Reply with one JSON object only.
A decision is a policy, rule, plan or date that someone approved, agreed or declared (not an open proposal, not a task). In a thread the decision lives in the approving message.
Tickets, PRs and incident reports describe WORK: they are not decisions unless they explicitly say something was decided or approved. Work that implements a decision "asserts" it.
Split independent decisions (e.g. WHAT we will do vs WHEN it happens) into separate items.
Lifting, reversing or changing an existing rule IS a decision, and it supersedes that rule.
Statements must be one self-contained sentence with the concrete values (numbers, dates, scope). Describe only what this record says.
"supersedes": active decision keys whose content the new decision replaces or changes (e.g. a new date replaces an old date for the same thing). Never supersede a decision merely because it is related.
"asserts": active decision keys that a record restates or relies on as current fact WITHOUT changing them (docs, playbooks, runbooks, tickets, PRs implementing them).
"because_of": ids of OTHER records (tickets, incidents, docs) given as the reason.
"absences": people announcing time away (leave, vacation) with dates.
Use only the subject keys, full decision keys (decision:...) and handles provided. Use empty arrays when nothing applies.`;

const SHAPE = `{"decisions":[{"statement":"","about":["subject key"],"made_by":["handle"],"decided_in":"record id","supersedes":["decision key"],"because_of":["record id or ticket id cited as the reason"]}],"asserts":["decision key"],"absences":[{"handle":"","from":"YYYY-MM-DD","to":"YYYY-MM-DD"}]}`;

// Graph-guided extraction: the prompt is built from what the graph already knows (subjects + active decisions),
// so the model links to existing nodes instead of inventing new ones.
export async function buildContext(tx: Tracer) {
  const [subjects, decisions, people] = await Promise.all([
    tx.ro<{ key: string; name: string }>("extract.subjects", `MATCH (n:Entity) WHERE n:Topic OR n:System OR n:Project RETURN n.key AS key, n.name AS name ORDER BY key`),
    tx.ro<{ key: string; statement: string; about: string[]; at: number }>(
      "extract.active_decisions",
      `MATCH (d:Decision {status:'active'}) OPTIONAL MATCH (d)-[:ABOUT]->(s) RETURN d.key AS key, d.statement AS statement, collect(s.key) AS about, d.at AS at ORDER BY d.at`,
    ),
    tx.ro<{ handle: string; name: string }>("extract.people", `MATCH (p:Person) RETURN p.handle AS handle, p.name AS name`),
  ]);
  return { subjects, decisions, people };
}

export async function extractDecisions(records: Source[], ctx: Awaited<ReturnType<typeof buildContext>>, contextOnly: Source[] = []): Promise<Extraction> {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const fmt = (s: Source) => `[${s.key}] ${day(s.at)} ${s.kind}${s.author ? ` by ${s.author}` : ""}${s.channel ? ` in ${s.channel}` : ""}: ${s.title === s.text ? "" : `"${s.title}" `}${s.text}`;
  const user = [
    `People (handle=name): ${ctx.people.map((p) => `${p.handle}=${p.name}`).join(", ")}`,
    `Subjects: ${ctx.subjects.map((s) => `${s.key} (${s.name})`).join("; ")}`,
    `Active decisions:\n${ctx.decisions.map((d) => `- ${d.key} | about ${d.about.join(",")} | ${day(d.at)} | ${d.statement}`).join("\n") || "(none)"}`,
    contextOnly.length ? `Earlier context (do not extract from these):\n${contextOnly.map(fmt).join("\n")}` : "",
    `Records:\n${records.map(fmt).join("\n")}`,
    `JSON shape: ${SHAPE}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = await chatJSON<unknown>(SYSTEM, user);
  return Extraction.parse(raw);
}
