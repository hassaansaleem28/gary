import crypto from "node:crypto";
import type { Tracer } from "../db";
import { buildContext, extractDecisions, type Extraction } from "./extract";
import { linkMentions, linkReferences, loadGazetteer } from "./link";
import type { Source } from "./sources";
import { deriveCollaboration, writeExtraction, writeReferences, writeSource, type WriteResult } from "./write";

export type ExtractionCache = Record<string, { hash: string; result: Extraction }>;

export const unitHash = (unit: Source[]) =>
  crypto
    .createHash("sha1")
    .update(unit.map((s) => `${s.key}|${s.text}`).join("\n"))
    .digest("hex")
    .slice(0, 12);

// Group a chronologically sorted list of records into extraction units: Slack threads travel together.
export function toUnits(sources: Source[]): Source[][] {
  const byRoot = new Map<string, Source[]>();
  for (const s of sources) {
    const root = s.thread ?? s.key;
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(s);
  }
  return [...byRoot.values()].sort((a, b) => a[0].at - b[0].at);
}

export async function extractUnit(tx: Tracer, unit: Source[], cache?: ExtractionCache, contextOnly: Source[] = []) {
  const hash = unitHash(unit);
  const cacheKey = unit[0].key;
  if (cache?.[cacheKey]?.hash === hash) return { result: cache[cacheKey].result, cached: true };
  const ctx = await buildContext(tx);
  const result = await extractDecisions(unit, ctx, contextOnly);
  if (cache) cache[cacheKey] = { hash, result };
  return { result, cached: false };
}

export interface LiveIngestResult extends WriteResult {
  source: string;
  mentions: string[];
  references: string[];
  newlyStale: { doc: string; title: string }[];
}

// Live path: one new record lands, gets linked, decisions get extracted against the current graph,
// and anything it invalidates is reported back.
export async function ingestLive(tx: Tracer, src: Source, threadContext: Source[] = []): Promise<LiveIngestResult> {
  const { terms } = await loadGazetteer(tx);
  const before = new Set((await staleDocKeys(tx)).map((d) => d.doc));
  const mentions = linkMentions(src, terms);
  await writeSource(tx, src, mentions);
  const references = linkReferences(src);
  await writeReferences(tx, src.key, references);
  const { result } = await extractUnit(tx, [src], undefined, threadContext);
  const written = await writeExtraction(tx, [src], result);
  await deriveCollaboration(tx);
  const after = await staleDocKeys(tx);
  return { source: src.key, mentions, references, ...written, newlyStale: after.filter((d) => !before.has(d.doc)) };
}

export async function staleDocKeys(tx: Tracer) {
  return tx.ro<{ doc: string; title: string }>(
    "stale.docs",
    `MATCH (cur:Decision {status:'active'})-[:SUPERSEDES*1..6]->(old:Decision)
     MATCH (doc:Doc {living:true})
     WHERE ((doc)-[:ASSERTS]->(old) OR (old)-[:DECIDED_IN]->(doc)) AND NOT (doc)-[:ASSERTS]->(cur)
     RETURN DISTINCT doc.key AS doc, doc.title AS title`,
  );
}
