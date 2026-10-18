import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { catchUp } from "./catchup";
import { asOf } from "./timetravel";
import type { Tracer } from "./db";

// Gary's tool catalogue: fixed, parameterised Cypher. The model chooses a tool and its arguments;
// it never writes Cypher, and every name it passes is resolved against the graph first.

export interface ToolResult {
  outcome: "ok" | "empty" | "unknown_subject";
  data: unknown; // compact JSON handed back to the model
  nodes: string[]; // node keys to highlight in the graph view
  cites: string[]; // record/decision keys the answer may cite
}

export interface Resolved {
  key: string;
  name: string;
  label: string;
}

const DAY = 86_400_000;
const day = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
const clip = (s: string, n = 220) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s);
const LABEL = `[l IN labels(n) WHERE NOT l IN ['Node','Entity','Source']][0]`;

// ---------- subject resolution ----------

export async function resolve(tx: Tracer, text: string): Promise<{ hit: Resolved | null; candidates: Resolved[] }> {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/^(the|our|a)\s+/, "")
    .replace(/[?!.]+$/, "");
  const exact = await tx.ro<Resolved>(
    "resolve.exact",
    `MATCH (n:Entity) WHERE n.key = $t OR n.lname = $t OR $t IN n.aliases OR n.handle = $t
     RETURN n.key AS key, n.name AS name, ${LABEL} AS label LIMIT 1`,
    { t },
  );
  if (exact.length) return { hit: exact[0], candidates: [] };
  // Fuzzy fallback: stemmed prefixes, and a hit must cover at least half of the meaningful words,
  // so "deploy on fridays" finds Release process but "mobile app" never silently becomes "web-app".
  const stems = t
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !GENERIC.has(w))
    .map((w) => (w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w));
  if (!stems.length) return { hit: null, candidates: [] };
  const rows = await tx.ro<Resolved & { score: number; text: string }>(
    "resolve.fulltext",
    `CALL db.idx.fulltext.queryNodes('Entity', $q) YIELD node AS n, score
     RETURN n.key AS key, n.name AS name, ${LABEL} AS label, toLower(n.alias_text) AS text, score ORDER BY score DESC LIMIT 8`,
    { q: stems.map((w) => `${w}*`).join(" | ") },
  );
  const ranked = rows
    .map((r) => ({ ...r, covered: stems.filter((s) => new RegExp(`(?<![a-z0-9])${s}`).test(r.text)).length }))
    .sort((a, b) => b.covered - a.covered || b.score - a.score);
  const strip = ({ key, name, label }: Resolved) => ({ key, name, label });
  const best = ranked[0];
  if (best && best.covered / stems.length >= 0.5) return { hit: strip(best), candidates: ranked.slice(1, 3).map(strip) };
  return { hit: null, candidates: ranked.slice(0, 3).map(strip) };
}

const GENERIC = new Set(
  "project team system service policy process app the our for about of and on in at we can is are to a an do does did what when why who how launch launching launched decision decided".split(" "),
);

async function withSubject(tx: Tracer, subject: string, fn: (s: Resolved) => Promise<ToolResult>): Promise<ToolResult> {
  const { hit, candidates } = await resolve(tx, subject);
  if (!hit)
    return {
      outcome: "unknown_subject",
      data: { subject, note: "No person, team, system, project or topic with this name exists in the company graph.", similar: candidates.map((c) => c.name) },
      nodes: [],
      cites: [],
    };
  return fn(hit);
}

// ---------- decision lineage ----------

async function decisionLineage(tx: Tracer, { subject }: { subject: string }): Promise<ToolResult> {
  return withSubject(tx, subject, async (s) => {
    const heads = await tx.ro<{ key: string; lineage: string[] | null }>(
      "lineage.chains",
      `MATCH (s:Entity {key:$key})
       MATCH (cur:Decision {status:'active'})-[:ABOUT]->(x)
       WHERE x = s OR (s)-[:USES]->(x)
       OPTIONAL MATCH chain = (cur)-[:SUPERSEDES*1..6]->(:Decision)
       WITH cur, chain ORDER BY length(chain) DESC
       WITH cur, collect(chain)[0] AS longest
       RETURN cur.key AS key, [n IN nodes(longest) | n.key] AS lineage`,
      { key: s.key },
    );
    if (!heads.length) {
      const owner = await ownerOf(tx, s.key);
      return { outcome: "empty", data: { subject: s, note: "No recorded decisions about this subject.", owner }, nodes: [s.key], cites: [] };
    }
    const allKeys = [...new Set(heads.flatMap((h) => h.lineage ?? [h.key]))];
    const details = await tx.ro<{
      key: string;
      statement: string;
      status: string;
      at: number;
      src: string;
      srcTitle: string;
      makers: string[];
      makerKeys: string[];
      because: { key: string; title: string }[];
    }>(
      "lineage.details",
      `MATCH (d:Decision) WHERE d.key IN $ks
       OPTIONAL MATCH (d)-[:DECIDED_IN]->(src:Source)
       OPTIONAL MATCH (m:Person)-[:MADE]->(d)
       OPTIONAL MATCH (d)-[:BECAUSE_OF]->(why:Source)
       RETURN d.key AS key, d.statement AS statement, d.status AS status, d.at AS at,
              src.key AS src, src.title AS srcTitle, collect(DISTINCT m.name) AS makers, collect(DISTINCT m.key) AS makerKeys,
              [w IN collect(DISTINCT why) WHERE w IS NOT NULL | {key: w.key, title: w.title}] AS because
       ORDER BY d.at DESC`,
      { ks: allKeys },
    );
    const stale = await tx.ro<{ doc: string; title: string; old: string; current: string; author: string | null; authorKey: string | null }>(
      "lineage.stale_docs",
      `MATCH (cur:Decision)-[:SUPERSEDES*1..6]->(old:Decision) WHERE cur.key IN $heads
       MATCH (doc:Doc {living:true})
       WHERE ((doc)-[:ASSERTS]->(old) OR (old)-[:DECIDED_IN]->(doc)) AND NOT (doc)-[:ASSERTS]->(cur)
       OPTIONAL MATCH (a:Person)-[:AUTHORED]->(doc)
       RETURN DISTINCT doc.key AS doc, doc.title AS title, old.key AS old, cur.key AS current, a.name AS author, a.key AS authorKey`,
      { heads: heads.map((h) => h.key) },
    );
    const latest = Math.min(...details.filter((d) => d.status === "active").map((d) => d.at));
    const confusion = await tx.ro<{ key: string; title: string; text: string; at: number }>(
      "lineage.open_questions",
      `MATCH (m:Message)-[:MENTIONS]->(x) WHERE (x.key = $key OR x.key IN $docs) AND m.at > $since AND m.text CONTAINS '?'
       RETURN m.key AS key, m.title AS title, m.text AS text, m.at AS at ORDER BY m.at DESC LIMIT 3`,
      { key: s.key, docs: stale.map((d) => d.doc), since: latest },
    );
    const owner = await ownerOf(tx, s.key);
    const byKey = new Map(details.map((d) => [d.key, d]));
    const fmt = (k: string) => {
      const d = byKey.get(k)!;
      return { key: d.key, statement: d.statement, status: d.status, date: day(d.at), decided_in: d.src, decided_by: d.makers, because_of: d.because };
    };
    return {
      outcome: "ok",
      data: {
        subject: s,
        owner,
        current: heads.map((h) => ({ ...fmt(h.key), replaced: (h.lineage ?? []).slice(1).map(fmt) })),
        stale_docs: [...new Map(stale.map((d) => [d.doc, { key: d.doc, title: d.title, still_says: byKey.get(d.old)?.statement, author: d.author }])).values()],
        confused_people_since: confusion.map((c) => ({ key: c.key, where: c.title, date: day(c.at), text: clip(c.text, 160) })),
      },
      nodes: [s.key, ...allKeys, ...details.map((d) => d.src).filter(Boolean), ...details.flatMap((d) => d.makerKeys), ...details.flatMap((d) => d.because.map((b) => b.key)), ...stale.map((d) => d.doc), ...confusion.map((c) => c.key)],
      cites: [...allKeys, ...details.map((d) => d.src), ...details.flatMap((d) => d.because.map((b) => b.key)), ...stale.map((d) => d.doc), ...confusion.map((c) => c.key)],
    };
  });
}

async function ownerOf(tx: Tracer, key: string) {
  // Systems and topics are owned by a team (whose lead is the contact); projects have a lead and involved teams.
  const rows = await tx.ro<{ team: string | null; teamKey: string | null; lead: string | null; leadKey: string | null }>(
    "owner",
    `MATCH (s:Entity {key:$key})
     OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
     OPTIONAL MATCH (tl:Person)-[:LEADS]->(t)
     OPTIONAL MATCH (pl:Person)-[:LEADS]->(s)
     OPTIONAL MATCH (s)-[:INVOLVES]->(it:Team)
     WITH s, t, tl, pl, collect(it.name) AS involved
     RETURN coalesce(t.name, CASE WHEN size(involved) > 0 THEN reduce(acc = '', x IN involved | acc + CASE WHEN acc = '' THEN '' ELSE ' + ' END + x) END) AS team,
            t.key AS teamKey, coalesce(pl.name, tl.name) AS lead, coalesce(pl.key, tl.key) AS leadKey LIMIT 1`,
    { key },
  );
  return rows[0]?.team || rows[0]?.lead ? rows[0] : null;
}

// ---------- expertise ----------

const EXPERTISE = `
  MATCH (s:Entity {key:$key})
  OPTIONAL MATCH (s)-[:USES]->(sys:System)
  WITH s, collect(sys) + [s] AS targets
  UNWIND targets AS t
  MATCH (src:Source)-[:MENTIONS|CHANGES]->(t)
  MATCH (p:Person)-[r:AUTHORED|REVIEWED|ATTENDED|ASSIGNED|REPORTED]->(src)
  WITH p, src,
       CASE WHEN t = s THEN 1.0 ELSE 0.5 END
       * CASE type(r) WHEN 'AUTHORED' THEN 3.0 WHEN 'ASSIGNED' THEN 2.5 WHEN 'REVIEWED' THEN 1.5 WHEN 'REPORTED' THEN 1.0 ELSE 0.7 END
       * CASE WHEN src:Message AND src.text CONTAINS '?' THEN 0.3 ELSE 1.0 END
       * exp(-1.0 * ($now - src.at) / $halfLife) AS w
  WITH p, src, max(w) AS w ORDER BY src.at DESC
  WITH p, sum(w) AS score, count(src) AS n, max(src.at) AS last, collect(src.key)[0..3] AS evidence
`;

async function whoKnows(tx: Tracer, { subject }: { subject: string }): Promise<ToolResult> {
  return withSubject(tx, subject, async (s) => {
    const people = await tx.ro<{ key: string; name: string; role: string; team: string; score: number; n: number; last: number; evidence: string[]; awayFrom: number | null; awayTo: number | null }>(
      "who_knows.rank",
      `${EXPERTISE}
       OPTIONAL MATCH (p)-[:MEMBER_OF]->(team:Team)
       RETURN p.key AS key, p.name AS name, p.role AS role, team.name AS team, score, n, last, evidence,
              p.away_from AS awayFrom, p.away_to AS awayTo
       ORDER BY score DESC LIMIT 5`,
      { key: s.key, now: Date.now(), halfLife: 120 * DAY },
    );
    const owner = await ownerOf(tx, s.key);
    if (!people.length) return { outcome: "empty", data: { subject: s, owner, note: "Nobody has written, reviewed or worked on anything about this yet." }, nodes: [s.key], cites: [] };
    const total = people.reduce((a, p) => a + p.score, 0);
    return {
      outcome: "ok",
      data: {
        subject: s,
        owner,
        experts: people.map((p) => ({
          key: p.key,
          name: p.name,
          role: p.role,
          team: p.team,
          share_of_knowledge: `${Math.round((100 * p.score) / total)}%`,
          records: p.n,
          last_active: day(p.last),
          evidence: p.evidence,
          on_leave: p.awayFrom ? `unavailable from ${day(p.awayFrom)}${p.awayTo ? ` until ${day(p.awayTo)}` : ""}` : undefined,
        })),
      },
      nodes: [s.key, ...people.map((p) => p.key), ...people.flatMap((p) => p.evidence)],
      cites: people.flatMap((p) => p.evidence),
    };
  });
}

// ---------- profile ----------

async function profile(tx: Tracer, { subject }: { subject: string }): Promise<ToolResult> {
  return withSubject(tx, subject, async (s) => {
    const [base] = await tx.ro<{ props: Record<string, unknown>; links: { rel: string; key: string; name: string; label: string; out: boolean }[] }>(
      "profile.entity",
      `MATCH (s:Entity {key:$key})
       OPTIONAL MATCH (s)-[r]-(n:Entity) WHERE type(r) <> 'COLLABORATES' AND NOT n:Company
       RETURN properties(s) AS props,
              [x IN collect(DISTINCT {rel: type(r), key: n.key, name: n.name, label: ${LABEL}, out: startNode(r) = s}) WHERE x.key IS NOT NULL] AS links`,
      { key: s.key },
    );
    const recent = await tx.ro<{ key: string; title: string; at: number; rel: string }>(
      "profile.recent",
      `MATCH (s:Entity {key:$key})-[r]-(src:Source)
       WITH src, collect(DISTINCT type(r)) AS rels
       RETURN src.key AS key, src.title AS title, src.at AS at, reduce(acc = '', x IN rels | acc + CASE WHEN acc = '' THEN '' ELSE '+' END + x) AS rel
       ORDER BY src.at DESC LIMIT 6`,
      { key: s.key },
    );
    const owner = s.label === "Person" || s.label === "Team" ? null : await ownerOf(tx, s.key);
    const p = base.props;
    return {
      outcome: "ok",
      data: {
        subject: s,
        about: p.about || p.role,
        status: p.status,
        joined: day(p.joined as number),
        away: p.away_from ? `from ${day(p.away_from as number)} to ${day(p.away_to as number)}` : undefined,
        owner,
        relations: base.links.map((l) => `${l.out ? "" : "← "}${l.rel} ${l.label} ${l.name}`),
        recent_activity: recent.map((r) => ({ key: r.key, title: r.title, date: day(r.at), relation: r.rel })),
      },
      nodes: [s.key, ...base.links.map((l) => l.key), ...recent.map((r) => r.key)],
      cites: recent.map((r) => r.key),
    };
  });
}

// ---------- full-text search ----------

async function search(tx: Tracer, { query }: { query: string }): Promise<ToolResult> {
  const words = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return { outcome: "empty", data: { query, results: [] }, nodes: [], cites: [] };
  const rows = await tx.ro<{ key: string; title: string; text: string; at: number; kind: string; author: string | null; score: number }>(
    "search.fulltext",
    `CALL db.idx.fulltext.queryNodes('Source', $q) YIELD node AS n, score
     OPTIONAL MATCH (a:Person)-[:AUTHORED]->(n)
     RETURN n.key AS key, n.title AS title, n.text AS text, n.at AS at, ${LABEL} AS kind, a.name AS author, score
     ORDER BY score DESC LIMIT 6`,
    { q: words.map((w) => `${w}*`).join(" | ") },
  );
  return {
    outcome: rows.length ? "ok" : "empty",
    data: {
      query,
      note: "Keyword matches only. If none of these records directly answers the question, say it is not in the company graph. Never infer owners from them.",
      results: rows.map((r) => ({ key: r.key, kind: r.kind, title: r.title, date: day(r.at), author: r.author, excerpt: clip(r.text, 200) })),
    },
    nodes: rows.map((r) => r.key),
    cites: rows.map((r) => r.key),
  };
}

// ---------- multi-hop connection ----------

const PATH_RELS =
  "MEMBER_OF|LEADS|OWNS|USES|INVOLVES|AUTHORED|REVIEWED|ATTENDED|ASSIGNED|REPORTED|MENTIONS|CHANGES|REFERENCES|REPLY_TO|ABOUT|DECIDED_IN|MADE|SUPERSEDES|ASSERTS|BECAUSE_OF";

async function connect(tx: Tracer, { from, to }: { from: string; to: string }): Promise<ToolResult> {
  const [a, b] = await Promise.all([resolve(tx, from), resolve(tx, to)]);
  if (!a.hit || !b.hit)
    return { outcome: "unknown_subject", data: { unknown: [!a.hit && from, !b.hit && to].filter(Boolean), note: "Not in the company graph." }, nodes: [], cites: [] };
  const rows = await tx.ro<{ hops: { key: string; name: string; label: string }[]; rels: string[] }>(
    "connect.sppaths",
    `MATCH (a:Node {key:$a}), (b:Node {key:$b})
     CALL algo.SPpaths({sourceNode: a, targetNode: b, relTypes: $rels, relDirection: 'both', maxLen: 8, pathCount: 1})
     YIELD path
     RETURN [n IN nodes(path) | {key: n.key, name: n.name, label: ${LABEL}}] AS hops, [r IN relationships(path) | type(r)] AS rels`,
    { a: a.hit.key, b: b.hit.key, rels: PATH_RELS.split("|") },
  );
  if (!rows.length) return { outcome: "empty", data: { from: a.hit, to: b.hit, note: "No connection within 8 hops." }, nodes: [a.hit.key, b.hit.key], cites: [] };
  const { hops, rels } = rows[0];
  const chain = hops.map((h, i) => `${h.label} "${h.name}"${i < rels.length ? ` -[${rels[i]}]-` : ""}`).join(" ");
  return {
    outcome: "ok",
    data: { from: a.hit, to: b.hit, hops: rels.length, path: chain, records_on_path: hops.filter((h) => !["Person", "Team", "System", "Project", "Topic"].includes(h.label)).map((h) => h.key) },
    nodes: hops.map((h) => h.key),
    cites: hops.map((h) => h.key).filter((k) => !/^(person|team|system|project|topic):/.test(k)),
  };
}

// ---------- risk radar ----------

async function riskRadar(tx: Tracer): Promise<ToolResult> {
  // Same expertise weighting as who_knows, for every system/project at once; subjects with little activity are skipped.
  const concentration = await tx.ro<{ key: string; name: string; top: string; topKey: string; share: number; knowers: number; records: number; awayFrom: number | null; next: string | null }>(
    "risk.knowledge_concentration",
    `MATCH (s:Entity) WHERE s:System OR s:Project
     MATCH (src:Source)-[:MENTIONS|CHANGES]->(s)
     MATCH (p:Person)-[r:AUTHORED|REVIEWED|ATTENDED|ASSIGNED|REPORTED]->(src)
     WITH s, p, src, max(
       CASE type(r) WHEN 'AUTHORED' THEN 3.0 WHEN 'ASSIGNED' THEN 2.5 WHEN 'REVIEWED' THEN 1.5 WHEN 'REPORTED' THEN 1.0 ELSE 0.7 END
       * CASE WHEN src:Message AND src.text CONTAINS '?' THEN 0.3 ELSE 1.0 END) AS w
     WITH s, p, sum(w) AS w, count(src) AS n
     WITH s, p, w, n ORDER BY w DESC
     WITH s, collect({name: p.name, key: p.key, w: w, away: p.away_from}) AS ppl, sum(w) AS total, sum(n) AS records
     WHERE records >= 4
     WITH s, ppl[0] AS top, ppl[1] AS next, total, size(ppl) AS knowers, records
     WHERE top.w / total >= 0.4
     RETURN s.key AS key, s.name AS name, top.name AS top, top.key AS topKey, top.w / total AS share, knowers, records, top.away AS awayFrom, next.name AS next
     ORDER BY (top.w / total) * CASE WHEN top.away IS NULL THEN 1.0 ELSE 2.0 END DESC LIMIT 5`,
  );
  const brokers = await tx.ro<{ key: string; name: string; score: number }>(
    "risk.betweenness",
    `CALL algo.betweenness({nodeLabels: ['Person'], relationshipTypes: ['COLLABORATES']}) YIELD node, score
     RETURN node.key AS key, node.name AS name, score ORDER BY score DESC LIMIT 3`,
  );
  const stale = await tx.ro<{ doc: string; title: string; author: string | null }>(
    "risk.stale_docs",
    `MATCH (cur:Decision {status:'active'})-[:SUPERSEDES*1..6]->(old:Decision)
     MATCH (doc:Doc {living:true})
     WHERE ((doc)-[:ASSERTS]->(old) OR (old)-[:DECIDED_IN]->(doc)) AND NOT (doc)-[:ASSERTS]->(cur)
     OPTIONAL MATCH (a:Person)-[:AUTHORED]->(doc)
     RETURN DISTINCT doc.key AS doc, doc.title AS title, a.name AS author`,
  );
  const away = await tx.ro<{ key: string; name: string; from: number; to: number | null }>(
    "risk.upcoming_absences",
    `MATCH (p:Person) WHERE p.away_from IS NOT NULL AND p.away_from > $now - 7 * $day AND p.away_from < $now + 90 * $day
     RETURN p.key AS key, p.name AS name, p.away_from AS from, p.away_to AS to`,
    { now: Date.now(), day: DAY },
  );
  return {
    outcome: "ok",
    data: {
      single_points_of_knowledge: concentration.map((c) => ({
        subject: c.name,
        key: c.key,
        main_knower: c.top,
        share: `${Math.round(c.share * 100)}%`,
        people_involved: c.knowers,
        records: c.records,
        main_knower_away_from: day(c.awayFrom),
        next_best_knower: c.next,
      })),
      upcoming_absences: away.map((a) => ({ person: a.name, from: day(a.from), to: day(a.to) })),
      knowledge_brokers_betweenness: brokers.map((b) => ({ person: b.name, betweenness: +b.score.toFixed(1) })),
      stale_docs: stale,
    },
    nodes: [...concentration.flatMap((c) => [c.key, c.topKey]), ...brokers.map((b) => b.key), ...stale.map((s) => s.doc), ...away.map((a) => a.key)],
    cites: stale.map((s) => s.doc),
  };
}

// ---------- real teams (community detection) ----------

async function realTeams(tx: Tracer): Promise<ToolResult> {
  const rows = await tx.ro<{ community: number; members: { key: string; name: string; team: string }[] }>(
    "real_teams.label_propagation",
    `CALL algo.labelPropagation({nodeLabels: ['Person'], relationshipTypes: ['COLLABORATES'], maxIterations: 20}) YIELD node, communityId
     MATCH (node)-[:MEMBER_OF]->(t:Team)
     WITH communityId, collect({key: node.key, name: node.name, team: t.name}) AS members
     WHERE size(members) > 1
     RETURN communityId AS community, members ORDER BY size(members) DESC`,
  );
  return {
    outcome: rows.length ? "ok" : "empty",
    data: {
      note: "Communities found by label propagation over who actually works together (shared threads, tickets, PRs, meetings), compared with the org chart.",
      clusters: rows.map((r) => ({
        members: r.members.map((m) => `${m.name} (${m.team})`),
        org_teams_spanned: [...new Set(r.members.map((m) => m.team))],
      })),
    },
    nodes: rows.flatMap((r) => r.members.map((m) => m.key)),
    cites: [],
  };
}

// ---------- actions + memory (writes) ----------

async function openTicket(tx: Tracer, args: { title: string; details: string; subject: string; assignee?: string; refs?: string[] }): Promise<ToolResult> {
  return withSubject(tx, args.subject, async (s) => {
    let assignee = args.assignee ? (await resolve(tx, args.assignee)).hit : null;
    if (!assignee || assignee.label !== "Person") {
      const owner = await ownerOf(tx, s.key);
      assignee = owner?.leadKey ? { key: owner.leadKey, name: owner.lead!, label: "Person" } : null;
    }
    const n = (await tx.ro<{ n: number }>("ticket.count", `MATCH (t:Ticket {origin:'gary'}) RETURN count(t) AS n`))[0].n + 1;
    const key = `gary:GARY-${n}`;
    await tx.rw(
      "ticket.create",
      `MATCH (s:Entity {key:$subject})
       CREATE (t:Node:Source:Ticket {key:$key, name:$title, title:$title, text:$details, at:$now, origin:'gary', status:'Open', living:false, conv:$key, url:''})
       CREATE (t)-[:MENTIONS]->(s)
       WITH t OPTIONAL MATCH (p:Person {key:$assignee})
       FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | CREATE (p)-[:ASSIGNED]->(t))
       WITH t UNWIND $refs AS rk MATCH (r:Source {key:rk}) CREATE (t)-[:REFERENCES]->(r)`,
      { subject: s.key, key, title: `GARY-${n}: ${args.title}`, details: args.details, now: Date.now(), assignee: assignee?.key ?? "", refs: [...(args.refs ?? []), "__none__"] },
    );
    return { outcome: "ok", data: { created: key, title: args.title, assigned_to: assignee?.name ?? "unassigned", about: s.name }, nodes: [key, s.key, ...(assignee ? [assignee.key] : [])], cites: [key] };
  });
}

// One action, driven entirely by the graph: a ticket per stale doc, assigned to its author. Idempotent.
async function fixStaleDocs(tx: Tracer, { subject }: { subject: string }, session: string): Promise<ToolResult> {
  const lineage = await decisionLineage(tx, { subject });
  if (lineage.outcome !== "ok") return lineage;
  const d = lineage.data as { subject: Resolved; current: { statement: string }[]; stale_docs: { key: string; title: string; still_says?: string; author: string | null }[] };
  if (!d.stale_docs.length) return { outcome: "empty", data: { subject: d.subject, note: "No stale docs about this subject." }, nodes: [d.subject.key], cites: [] };
  const current = d.current.map((c) => c.statement).join(" / ");
  const tickets: { key: string; doc: string; title: string; assigned_to: string; already_open: boolean }[] = [];
  for (const doc of d.stale_docs) {
    const [open] = await tx.ro<{ key: string; assignee: string | null }>(
      "fix.existing_ticket",
      `MATCH (t:Ticket {origin:'gary', status:'Open'})-[:REFERENCES]->(:Doc {key:$k}) OPTIONAL MATCH (p:Person)-[:ASSIGNED]->(t) RETURN t.key AS key, p.name AS assignee LIMIT 1`,
      { k: doc.key },
    );
    if (open) {
      tickets.push({ key: open.key, doc: doc.key, title: doc.title, assigned_to: open.assignee ?? "unassigned", already_open: true });
      continue;
    }
    const r = await openTicket(tx, {
      title: `Update "${doc.title}" to the current decision`,
      details: `Still says: "${doc.still_says ?? "an outdated decision"}". Current decision: ${current}`,
      subject: d.subject.key,
      assignee: doc.author ?? undefined,
      refs: [doc.key],
    });
    const created = r.data as { created: string; assigned_to: string };
    tickets.push({ key: created.created, doc: doc.key, title: doc.title, assigned_to: created.assigned_to, already_open: false });
  }
  void session;
  return {
    outcome: "ok",
    data: { subject: d.subject, current_decision: current, tickets },
    nodes: [d.subject.key, ...tickets.flatMap((t) => [t.key, t.doc])],
    cites: [...tickets.map((t) => t.key), ...tickets.map((t) => t.doc)],
  };
}

async function remember(tx: Tracer, args: { note: string; subject: string }, session: string): Promise<ToolResult> {
  return withSubject(tx, args.subject, async (s) => {
    const key = `finding:${Date.now()}`;
    await tx.rw(
      "memory.write",
      `MATCH (s:Entity {key:$subject})
       CREATE (f:Node:Finding {key:$key, name:$name, text:$note, at:$now, session:$session, kind:'note'})-[:ABOUT]->(s)`,
      { subject: s.key, key, name: clip(args.note, 60), note: args.note, now: Date.now(), session },
    );
    return { outcome: "ok", data: { remembered: args.note, about: s.name, key }, nodes: [key, s.key], cites: [] };
  });
}

// ---------- catalogue ----------

const subjectParam = { subject: { type: "string", description: "Name of a person, team, system, project or topic, e.g. 'refund policy', 'ledger-db', 'Project Atlas', 'Priya'" } };

export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "decision_lineage",
      description: "Current decision(s) about a subject, the older decisions they replaced, who decided, where, why, docs that are now stale, and open questions. Use for 'what is our X', 'why', 'when', 'what was decided'.",
      parameters: { type: "object", properties: subjectParam, required: ["subject"] },
    },
  },
  {
    type: "function",
    function: {
      name: "who_knows",
      description: "Rank people by recent hands-on knowledge of a subject (authored, reviewed, assigned, attended), with the owning team and evidence. Use for 'who knows / who should I ask / who owns'.",
      parameters: { type: "object", properties: subjectParam, required: ["subject"] },
    },
  },
  {
    type: "function",
    function: {
      name: "profile",
      description: "Facts about one person, team, system, project or topic: owner, relations, status, recent activity.",
      parameters: { type: "object", properties: subjectParam, required: ["subject"] },
    },
  },
  {
    type: "function",
    function: {
      name: "connect",
      description: "Shortest multi-hop path in the company graph between two things, e.g. how a person relates to a decision or system.",
      parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
    },
  },
  {
    type: "function",
    function: {
      name: "risk_radar",
      description: "Company-wide risks: single points of knowledge (bus factor), upcoming absences, knowledge brokers (betweenness centrality), stale docs.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "real_teams",
      description: "Detect who actually works together (label propagation communities) versus the org chart.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "as_of",
      description: "Time travel: which decisions about a subject were in force on a past date, who made them, what later replaced them, and which docs were already stale then. Use for 'what was our X on <date>', 'back in July', 'before the change'.",
      parameters: {
        type: "object",
        properties: { ...subjectParam, date: { type: "string", description: "The date to look at, YYYY-MM-DD. If the user gives no year, use the current year." } },
        required: ["subject", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "catch_up",
      description: "What changed recently: decisions made or reversed since a date, open tickets, people going away. Optionally scoped to one person's world. Use for 'what did I miss', 'what changed since', 'catch me up'.",
      parameters: {
        type: "object",
        properties: {
          since: { type: "string", description: "ISO date YYYY-MM-DD (optional)" },
          days: { type: "number", description: "Look back this many days if no date (default 30)" },
          person: { type: "string", description: "Optional person whose world to focus on" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Full-text search over all records (Slack, Jira, Notion, meetings, GitHub). Use only when no subject-specific tool fits.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "open_ticket",
      description: "ACTION: create a ticket in the graph assigned to a person (defaults to the owning team's lead). Only when the user asks you to act/fix/assign.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          details: { type: "string" },
          subject: { type: "string", description: "What the ticket is about" },
          assignee: { type: "string", description: "Optional person name" },
          refs: { type: "array", items: { type: "string" }, description: "Optional record keys (e.g. stale doc keys) the ticket refers to" },
        },
        required: ["title", "details", "subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fix_stale_docs",
      description: "ACTION: open a ticket for every stale doc about a subject, assigned to that doc's author (skips docs that already have an open ticket). Use when the user asks to fix or update stale docs.",
      parameters: { type: "object", properties: subjectParam, required: ["subject"] },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Save a note to long-term memory about a subject. Only when the user asks you to remember something.",
      parameters: { type: "object", properties: { note: { type: "string" }, subject: { type: "string" } }, required: ["note", "subject"] },
    },
  },
];

export async function runTool(tx: Tracer, name: string, args: Record<string, unknown>, session: string): Promise<ToolResult> {
  switch (name) {
    case "decision_lineage":
      return decisionLineage(tx, args as { subject: string });
    case "who_knows":
      return whoKnows(tx, args as { subject: string });
    case "profile":
      return profile(tx, args as { subject: string });
    case "connect":
      return connect(tx, args as { from: string; to: string });
    case "risk_radar":
      return riskRadar(tx);
    case "real_teams":
      return realTeams(tx);
    case "search":
      return search(tx, args as { query: string });
    case "as_of":
      return asOf(tx, args as { subject: string; date: string }, resolve);
    case "catch_up":
      return catchUp(tx, args as { since?: string; days?: number; person?: string }, resolve);
    case "open_ticket":
      return openTicket(tx, args as Parameters<typeof openTicket>[1]);
    case "fix_stale_docs":
      return fixStaleDocs(tx, args as { subject: string }, session);
    case "remember":
      return remember(tx, args as { note: string; subject: string }, session);
    default:
      return { outcome: "empty", data: { error: `unknown tool ${name}` }, nodes: [], cites: [] };
  }
}
