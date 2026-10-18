import { Tracer } from "@/lib/db";
import { staleDocKeys } from "@/lib/ingest/pipeline";

export const dynamic = "force-dynamic";


const LABEL = `[l IN labels(n) WHERE NOT l IN ['Node','Entity','Source']][0]`;

export async function GET() {
  const tx = new Tracer();
  const nodes = await tx.ro<{ id: string; name: string; label: string; status: string | null; living: boolean | null; origin: string | null; at: number | null }>(
    "viz.nodes",
    `MATCH (n:Node) WHERE NOT n:Company RETURN n.key AS id, n.name AS name, ${LABEL} AS label, n.status AS status, n.living AS living, n.origin AS origin, n.at AS at`,
  );
  const links = await tx.ro<{ source: string; target: string; type: string }>(
    "viz.links",
    `MATCH (a:Node)-[r]->(b:Node) WHERE NOT a:Company AND NOT b:Company AND type(r) <> 'COLLABORATES' RETURN a.key AS source, b.key AS target, type(r) AS type`,
  );
  const stale = (await staleDocKeys(tx)).map((d) => d.doc);
  return Response.json({ nodes, links, stale });
}
