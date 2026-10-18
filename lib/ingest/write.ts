import type { Tracer } from "../db";
import type { Extraction } from "./extract";
import type { Org, Source } from "./sources";

export async function createIndexes(tx: Tracer) {
  const stmts = [
    "CREATE INDEX FOR (n:Node) ON (n.key)",
    "CREATE INDEX FOR (p:Person) ON (p.handle)",
    "CREATE INDEX FOR (d:Decision) ON (d.status)",
    "CALL db.idx.fulltext.createNodeIndex('Source', 'title', 'text')",
    "CALL db.idx.fulltext.createNodeIndex('Entity', 'name', 'alias_text')",
  ];
  for (const s of stmts) {
    try {
      await tx.rw("index", s);
    } catch (e) {
      if (!/already (exists|indexed)/i.test(String(e))) throw e;
    }
  }
}

const entityProps = (r: { key: string; name: string; aliases?: string[]; about?: string }) => ({
  key: r.key,
  name: r.name,
  lname: r.name.toLowerCase(),
  aliases: (r.aliases ?? []).map((a) => a.toLowerCase()),
  alias_text: [r.name, ...(r.aliases ?? [])].join(" "),
  about: r.about ?? "",
});

export async function writeOrg(tx: Tracer, org: Org) {
  await tx.rw("org.company", `MERGE (c:Node:Entity:Company {key:$key}) SET c += $props`, { key: org.company.key, props: entityProps(org.company) });
  await tx.rw(
    "org.teams",
    `UNWIND $rows AS r MERGE (t:Node:Entity:Team {key:r.key}) SET t += r
     WITH t MATCH (c:Company {key:$company}) MERGE (t)-[:PART_OF]->(c)`,
    { rows: org.teams.map(entityProps), company: org.company.key },
  );
  await tx.rw(
    "org.people",
    `UNWIND $rows AS r MERGE (p:Node:Entity:Person {key:r.key})
     SET p += r.props
     WITH p, r MATCH (t:Team {key:r.team}) MERGE (p)-[:MEMBER_OF]->(t)
     FOREACH (_ IN CASE WHEN r.lead THEN [1] ELSE [] END | MERGE (p)-[:LEADS]->(t))`,
    {
      rows: org.people.map((p) => ({
        key: p.key,
        team: p.team,
        lead: !!p.lead,
        props: { ...entityProps({ key: p.key, name: p.name, aliases: [p.handle], about: p.role }), handle: p.handle, role: p.role, joined: new Date(p.joined).getTime() },
      })),
    },
  );
  await tx.rw(
    "org.systems",
    `UNWIND $rows AS r MERGE (s:Node:Entity:System {key:r.props.key}) SET s += r.props
     WITH s, r MATCH (t:Team {key:r.owner}) MERGE (t)-[:OWNS]->(s)`,
    { rows: org.systems.map((s) => ({ owner: s.owner, props: entityProps(s) })) },
  );
  await tx.rw(
    "org.topics",
    `UNWIND $rows AS r MERGE (s:Node:Entity:Topic {key:r.props.key}) SET s += r.props
     WITH s, r MATCH (t:Team {key:r.owner}) MERGE (t)-[:OWNS]->(s)`,
    { rows: org.topics.map((s) => ({ owner: s.owner, props: entityProps(s) })) },
  );
  await tx.rw(
    "org.projects",
    `UNWIND $rows AS r MERGE (p:Node:Entity:Project {key:r.props.key}) SET p += r.props
     WITH p, r MATCH (lead:Person {key:r.lead}) MERGE (lead)-[:LEADS]->(p)
     WITH p, r UNWIND r.teams AS tk MATCH (t:Team {key:tk}) MERGE (p)-[:INVOLVES]->(t)
     WITH DISTINCT p, r UNWIND r.uses AS sk MATCH (s:System {key:sk}) MERGE (p)-[:USES]->(s)`,
    { rows: org.projects.map((p) => ({ lead: p.lead, teams: p.teams, uses: p.uses, props: { ...entityProps(p), status: p.status } })) },
  );
}

export async function writeSource(tx: Tracer, src: Source, mentions: string[]) {
  const props = {
    key: src.key,
    name: src.title,
    title: src.title,
    text: src.text,
    at: src.at,
    origin: src.origin,
    url: src.url,
    channel: src.channel ?? "",
    living: !!src.living,
    status: src.status ?? "",
    conv: src.thread ?? src.key,
  };
  // label can't be a parameter, but kind comes from our own enum
  await tx.rw("source.node", `MERGE (s:Node:Source:${src.kind} {key:$key}) SET s += $props`, { key: src.key, props });
  if (src.author) {
    await tx.rw("source.author", `MATCH (p:Person {handle:$h}), (s:Source {key:$key}) MERGE (p)-[:AUTHORED]->(s)`, { h: src.author, key: src.key });
  }
  for (const rel of ["REVIEWED", "ATTENDED", "ASSIGNED", "REPORTED"] as const) {
    const hs = src.participants.filter((p) => p.rel === rel).map((p) => p.handle);
    if (hs.length)
      await tx.rw(`source.${rel.toLowerCase()}`, `UNWIND $hs AS h MATCH (p:Person {handle:h}), (s:Source {key:$key}) MERGE (p)-[:${rel}]->(s)`, { hs, key: src.key });
  }
  if (src.thread) {
    await tx.rw("source.thread", `MATCH (s:Source {key:$key}), (r:Source {key:$root}) MERGE (s)-[:REPLY_TO]->(r)`, { key: src.key, root: src.thread });
  }
  const ments = mentions.filter((k) => k !== `person:${src.author}`);
  if (ments.length) {
    await tx.rw("source.mentions", `UNWIND $ks AS k MATCH (s:Source {key:$key}), (e:Entity {key:k}) MERGE (s)-[:MENTIONS]->(e)`, { ks: ments, key: src.key });
  }
  if (src.systems?.length) {
    await tx.rw("source.changes", `UNWIND $ks AS k MATCH (s:Source {key:$key}), (e:System {key:k}) MERGE (s)-[:CHANGES]->(e)`, { ks: src.systems, key: src.key });
  }
}

export async function writeReferences(tx: Tracer, key: string, refs: string[]) {
  if (!refs.length) return;
  await tx.rw("source.references", `UNWIND $ks AS k MATCH (s:Source {key:$key}), (r:Source {key:k}) MERGE (s)-[:REFERENCES]->(r)`, { ks: refs, key });
}

export interface WriteResult {
  created: { key: string; statement: string }[];
  superseded: { key: string; statement: string; by: string }[];
  asserted: string[];
}

const decisionKey = (k: string) => (k.startsWith("decision:") ? k : `decision:${k}`);

export async function writeExtraction(tx: Tracer, unit: Source[], ex: Extraction): Promise<WriteResult> {
  const out: WriteResult = { created: [], superseded: [], asserted: [] };
  ex = { ...ex, asserts: ex.asserts.map(decisionKey), decisions: ex.decisions.map((d) => ({ ...d, supersedes: d.supersedes.map(decisionKey) })) };
  const unitKeys = new Set(unit.map((s) => s.key));
  const primary = unit[0];

  for (const [i, d] of ex.decisions.entries()) {
    const decidedIn = d.decided_in && unitKeys.has(d.decided_in) ? d.decided_in : unit[unit.length - 1].key;
    const at = unit.find((s) => s.key === decidedIn)!.at;
    const key = `decision:${decidedIn.replace(/^[a-z-]+:/, "")}-${i + 1}`;
    await tx.rw(
      "decision.node",
      `MERGE (d:Node:Decision {key:$key})
       SET d.statement = $st, d.name = $name, d.at = $at, d.status = coalesce(d.status, 'active')
       WITH d MATCH (src:Source {key:$src}) MERGE (d)-[:DECIDED_IN]->(src)`,
      { key, st: d.statement, name: d.statement.length > 70 ? d.statement.slice(0, 67) + "..." : d.statement, at, src: decidedIn },
    );
    if (d.about.length)
      await tx.rw("decision.about", `UNWIND $ks AS k MATCH (d:Decision {key:$key}), (e:Entity {key:k}) MERGE (d)-[:ABOUT]->(e)`, { ks: d.about, key });
    if (d.made_by.length)
      await tx.rw("decision.made_by", `UNWIND $hs AS h MATCH (d:Decision {key:$key}), (p:Person) WHERE p.handle = h OR p.key = h MERGE (p)-[:MADE]->(d)`, {
        hs: d.made_by.map((h) => h.replace(/^@/, "")),
        key,
      });
    const because = d.because_of.map((k) => (/^(PLAT|BILL|DATA)-\d+$/.test(k) ? `jira:${k}` : k));
    if (because.length)
      await tx.rw("decision.because_of", `UNWIND $ks AS k MATCH (d:Decision {key:$key}), (s:Source {key:k}) MERGE (d)-[:BECAUSE_OF]->(s)`, { ks: because, key });
    if (d.supersedes.length) {
      const rows = await tx.rw<{ key: string; statement: string }>(
        "decision.supersedes",
        `UNWIND $ks AS k MATCH (d:Decision {key:$key}), (o:Decision {key:k}) WHERE o.key <> d.key
         MERGE (d)-[:SUPERSEDES]->(o) SET o.status = 'superseded', o.superseded_at = $at
         RETURN o.key AS key, o.statement AS statement`,
        { ks: d.supersedes, key, at },
      );
      out.superseded.push(...rows.map((r) => ({ ...r, by: key })));
    }
    out.created.push({ key, statement: d.statement });
  }

  if (ex.asserts.length) {
    const rows = await tx.rw<{ key: string }>(
      "source.asserts",
      `UNWIND $ks AS k MATCH (s:Source {key:$src}), (d:Decision {key:k}) WHERE NOT (d)-[:DECIDED_IN]->(s)
       MERGE (s)-[:ASSERTS]->(d) RETURN d.key AS key`,
      { ks: ex.asserts, src: primary.key },
    );
    out.asserted = rows.map((r) => r.key);
  }

  for (const a of ex.absences) {
    await tx.rw("person.absence", `MATCH (p:Person {handle:$h}) SET p.away_from = $from, p.away_to = $to`, {
      h: a.handle.replace(/^@/, ""),
      from: new Date(a.from).getTime() || null,
      to: a.to ? new Date(a.to).getTime() || null : null,
    });
  }
  return out;
}

// People who show up in the same conversation (thread, ticket, PR, meeting) or @-mention each other collaborate.
export async function deriveCollaboration(tx: Tracer) {
  await tx.rw("collab.reset", `MATCH (:Person)-[c:COLLABORATES]->(:Person) DELETE c`);
  await tx.rw(
    "collab.conversations",
    `MATCH (a:Person)-[:AUTHORED|REVIEWED|ATTENDED|REPORTED|ASSIGNED]->(s1:Source)
     MATCH (b:Person)-[:AUTHORED|REVIEWED|ATTENDED|REPORTED|ASSIGNED]->(s2:Source)
     WHERE a.key < b.key AND s1.conv = s2.conv
     WITH a, b, count(DISTINCT s1.conv) AS w
     CREATE (a)-[:COLLABORATES {w: w}]->(b)`,
  );
  await tx.rw(
    "collab.mentions",
    `MATCH (x:Person)-[:AUTHORED]->(s:Source)-[:MENTIONS]->(y:Person) WHERE x <> y
     WITH CASE WHEN x.key < y.key THEN x ELSE y END AS a, CASE WHEN x.key < y.key THEN y ELSE x END AS b, count(s) AS w
     MERGE (a)-[c:COLLABORATES]->(b) ON CREATE SET c.w = 0
     SET c.w = c.w + w`,
  );
}
