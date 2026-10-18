import type { Tracer } from "../db";
import type { Source } from "./sources";

// Deterministic entity linking: the gazetteer is read from the graph itself, so anything the graph
// knows about (people, systems, projects, topics) gets linked in new records automatically.
export interface Term {
  key: string;
  label: string;
  re: RegExp;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (t: string, flags = "i") => new RegExp(`(?<![\\w-])${esc(t)}(?![\\w-])`, flags);

export async function loadGazetteer(tx: Tracer): Promise<{ terms: Term[]; handles: Map<string, string> }> {
  const rows = await tx.ro<{ key: string; label: string; name: string; aliases: string[] | null; handle: string | null }>(
    "gazetteer",
    `MATCH (n:Entity) WHERE NOT n:Team AND NOT n:Company
     RETURN n.key AS key, [l IN labels(n) WHERE NOT l IN ['Node','Entity']][0] AS label,
            n.name AS name, n.aliases AS aliases, n.handle AS handle`,
  );
  const terms: Term[] = [];
  const handles = new Map<string, string>();
  for (const r of rows) {
    if (r.label === "Person") {
      handles.set(r.handle!, r.key);
      terms.push({ key: r.key, label: r.label, re: word(r.name) });
      terms.push({ key: r.key, label: r.label, re: word(`@${r.handle}`) });
      // first names are only matched capitalised ("Grace", not "grace period")
      terms.push({ key: r.key, label: r.label, re: word(r.name.split(" ")[0], "") });
    } else {
      for (const t of [r.name, ...(r.aliases ?? [])]) terms.push({ key: r.key, label: r.label, re: word(t) });
    }
  }
  return { terms, handles };
}

export function linkMentions(src: Source, terms: Term[]): string[] {
  const hay = `${src.title}\n${src.text}`;
  const keys = new Set<string>();
  for (const t of terms) if (t.re.test(hay)) keys.add(t.key);
  return [...keys];
}

// Explicit cross-references between records: ticket ids and RFC numbers.
export function linkReferences(src: Source): string[] {
  const hay = `${src.title}\n${src.text}`;
  const refs = new Set<string>();
  for (const m of hay.matchAll(/\b(PLAT|BILL|DATA)-\d+\b/g)) refs.add(`jira:${m[0]}`);
  for (const m of hay.matchAll(/\bRFC-(\d{3})\b/g)) refs.add(`notion:rfc-${m[1]}`);
  refs.delete(src.key);
  return [...refs];
}
