import { Tracer } from "@/lib/db";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const tx = new Tracer();
  const rows = await tx.ro(
    "node.detail",
    `MATCH (n:Node {key:$key})
     OPTIONAL MATCH (n)-[:DECIDED_IN]->(src:Source)
     OPTIONAL MATCH (a:Person)-[:AUTHORED]->(n)
     RETURN n.key AS key, coalesce(n.title, n.statement, n.name) AS title,
            [l IN labels(n) WHERE NOT l IN ['Node','Entity','Source']][0] AS kind, n.at AS at,
            coalesce(n.url, src.url, '') AS url, coalesce(n.text, n.statement, n.about, '') AS text,
            a.name AS author, n.status AS status, src.key AS decidedIn`,
    { key },
  );
  return rows.length ? Response.json(rows[0]) : Response.json({ error: "not found" }, { status: 404 });
}
