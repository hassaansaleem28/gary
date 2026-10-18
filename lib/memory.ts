import type { Tracer } from "./db";

// Gary's long-term memory lives in the same graph as the company knowledge:
// (:Finding)-[:ABOUT]->(subject) and (:Finding)-[:CITES]->(:Decision).
// Because memories point at decisions, a memory becomes "outdated" the moment one of those decisions is superseded.

export interface Memory {
  key: string;
  text: string;
  date: string;
  session: string;
  kind: string;
  about: string[];
  outdated: boolean;
}

export async function recall(tx: Tracer, subjectKeys: string[]): Promise<Memory[]> {
  if (!subjectKeys.length) return [];
  const rows = await tx.ro<{ key: string; text: string; at: number; session: string; kind: string; about: string[]; statuses: string[] }>(
    "memory.recall",
    `MATCH (f:Finding)-[:ABOUT]->(e:Entity) WHERE e.key IN $ks
     OPTIONAL MATCH (f)-[:CITES]->(d:Decision)
     WITH f, collect(DISTINCT e.name) AS about, collect(DISTINCT d.status) AS statuses
     RETURN f.key AS key, f.text AS text, f.at AS at, f.session AS session, f.kind AS kind, about, statuses
     ORDER BY f.at DESC LIMIT 4`,
    { ks: subjectKeys },
  );
  return rows.map((r) => ({
    key: r.key,
    text: r.text,
    date: new Date(r.at).toISOString().slice(0, 16).replace("T", " "),
    session: r.session,
    kind: r.kind,
    about: r.about,
    outdated: r.statuses.includes("superseded"),
  }));
}

export async function saveEpisode(tx: Tracer, ep: { session: string; question: string; answer: string; subjects: string[]; decisions: string[] }) {
  if (!ep.subjects.length) return;
  const key = `finding:${Date.now()}`;
  const firstLine = ep.answer.replace(/\[[a-z]+:[^\]]+\]/g, "").split("\n").find((l) => l.trim()) ?? "";
  await tx.rw(
    "memory.save_episode",
    `CREATE (f:Node:Finding {key:$key, name:$name, text:$text, at:$now, session:$session, kind:'episode'})
     WITH f UNWIND $subjects AS sk MATCH (e:Entity {key:sk}) MERGE (f)-[:ABOUT]->(e)
     WITH DISTINCT f UNWIND $decisions AS dk MATCH (d:Decision {key:dk, status:'active'}) MERGE (f)-[:CITES]->(d)`,
    {
      key,
      name: ep.question.slice(0, 60),
      text: `Asked "${ep.question.slice(0, 140)}" → ${firstLine.replace(/\*\*/g, "").slice(0, 220)}`,
      now: Date.now(),
      session: ep.session,
      subjects: ep.subjects,
      decisions: [...new Set([...ep.decisions, "__none__"])],
    },
  );
}
