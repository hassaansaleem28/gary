import type { Tracer } from "./db";
import type { Resolved, ToolResult } from "./tools";

const DAY = 86_400_000;
const day = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

// "I was away, what did I miss?": decisions made or reversed since a date, optionally scoped to one person's world
// (systems/topics their team owns, projects they lead, and anything they've worked on or been mentioned in).
export async function catchUp(tx: Tracer, args: { since?: string; days?: number; person?: string }, resolveFn: (tx: Tracer, t: string) => Promise<{ hit: Resolved | null }>): Promise<ToolResult> {
  const sinceMs = args.since && !Number.isNaN(Date.parse(args.since)) ? Date.parse(args.since) : Date.now() - (args.days && args.days > 0 ? Math.min(args.days, 365) : 30) * DAY;
  let person: Resolved | null = null;
  if (args.person) {
    person = (await resolveFn(tx, args.person)).hit;
    if (!person || person.label !== "Person")
      return { outcome: "unknown_subject", data: { person: args.person, note: "No such person in the company graph." }, nodes: [], cites: [] };
  }

  const scope = person
    ? await tx.ro<{ key: string }>(
        "catch_up.scope",
        `MATCH (p:Person {key:$p})
         OPTIONAL MATCH (p)-[:MEMBER_OF]->(:Team)-[:OWNS]->(owned)
         OPTIONAL MATCH (p)-[:LEADS]->(led:Project)
         OPTIONAL MATCH (p)-[:AUTHORED|REVIEWED|ASSIGNED|ATTENDED]->(:Source)-[:MENTIONS|CHANGES]->(touched)
         OPTIONAL MATCH (:Source)-[:MENTIONS]->(p)
         WITH collect(DISTINCT owned.key) + collect(DISTINCT led.key) + collect(DISTINCT touched.key) AS ks
         UNWIND ks AS k WITH DISTINCT k WHERE k STARTS WITH 'system:' OR k STARTS WITH 'topic:' OR k STARTS WITH 'project:'
         RETURN k AS key`,
        { p: person.key },
      )
    : [];
  const scopeKeys = scope.map((s) => s.key);

  const decisions = await tx.ro<{ key: string; statement: string; at: number; status: string; makers: string[]; about: string[]; aboutKeys: string[]; replaced: string[]; src: string | null }>(
    "catch_up.decisions",
    `MATCH (d:Decision) WHERE d.at >= $since
     OPTIONAL MATCH (d)-[:ABOUT]->(s)
     WITH d, collect(DISTINCT s) AS subs
     WHERE size($scope) = 0 OR any(x IN subs WHERE x.key IN $scope)
     OPTIONAL MATCH (m:Person)-[:MADE]->(d)
     OPTIONAL MATCH (d)-[:SUPERSEDES]->(o:Decision)
     OPTIONAL MATCH (d)-[:DECIDED_IN]->(src:Source)
     RETURN d.key AS key, d.statement AS statement, d.at AS at, d.status AS status,
            collect(DISTINCT m.name) AS makers, [x IN subs | x.name] AS about, [x IN subs | x.key] AS aboutKeys,
            collect(DISTINCT o.statement) AS replaced, src.key AS src
     ORDER BY d.at DESC LIMIT 12`,
    { since: sinceMs, scope: scopeKeys },
  );

  const tickets = await tx.ro<{ key: string; title: string; status: string; assignee: string | null }>(
    "catch_up.open_tickets",
    `MATCH (t:Ticket) WHERE t.at >= $since AND t.status <> 'Done'
     OPTIONAL MATCH (a:Person)-[:ASSIGNED]->(t)
     OPTIONAL MATCH (t)-[:MENTIONS]->(x)
     WITH t, a, collect(x.key) AS mentioned
     WHERE size($scope) = 0 OR a.key = $person OR any(k IN mentioned WHERE k IN $scope)
     RETURN t.key AS key, t.title AS title, t.status AS status, a.name AS assignee ORDER BY t.at DESC LIMIT 6`,
    { since: sinceMs, scope: scopeKeys, person: person?.key ?? "" },
  );

  const absences = await tx.ro<{ key: string; name: string; from: number; to: number | null }>(
    "catch_up.absences",
    `MATCH (p:Person) WHERE p.away_from IS NOT NULL AND p.away_from >= $since RETURN p.key AS key, p.name AS name, p.away_from AS from, p.away_to AS to`,
    { since: sinceMs },
  );

  // Backups come from the graph, not the model: the next-best knowers on what each absent person works on most.
  const backups = new Map<string, { subject: string; backups: string[] }[]>();
  for (const a of absences) {
    const rows = await tx.ro<{ subject: string; backups: string[] }>(
      "catch_up.backups",
      `MATCH (p:Person {key:$k})-[:AUTHORED|ASSIGNED|REVIEWED]->(src:Source)-[:MENTIONS|CHANGES]->(s)
       WHERE s:System OR s:Project
       WITH p, s, count(DISTINCT src) AS n ORDER BY n DESC LIMIT 2
       MATCH (o:Person)-[:AUTHORED|ASSIGNED|REVIEWED|ATTENDED|REPORTED]->(src2:Source)-[:MENTIONS|CHANGES]->(s)
       WHERE o <> p
       WITH s, o, count(DISTINCT src2) AS m ORDER BY m DESC
       WITH s, collect(o.name)[0..2] AS backups
       RETURN s.name AS subject, backups`,
      { k: a.key },
    );
    backups.set(a.key, rows);
  }

  return {
    outcome: decisions.length || tickets.length ? "ok" : "empty",
    data: {
      since: day(sinceMs),
      for: person?.name ?? "everyone",
      decisions: decisions.map((d) => ({
        key: d.key,
        date: day(d.at),
        statement: d.statement,
        status: d.status,
        decided_by: d.makers,
        about: d.about,
        replaced: d.replaced,
        decided_in: d.src,
      })),
      open_tickets: tickets,
      people_going_away: absences.map((a) => ({ person: a.name, from: day(a.from), to: day(a.to), suggested_backups_by_subject: backups.get(a.key) ?? [] })),
    },
    nodes: [...(person ? [person.key] : []), ...decisions.flatMap((d) => [d.key, ...d.aboutKeys]), ...tickets.map((t) => t.key), ...absences.map((a) => a.key)],
    cites: [...decisions.map((d) => d.key), ...decisions.map((d) => d.src).filter((s): s is string => !!s), ...tickets.map((t) => t.key)],
  };
}
