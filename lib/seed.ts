// Rebuilds the Kitestring company graph from the raw connector exports in data/kitestring.
// LLM extractions are cached in data/kitestring/extractions.json (human-reviewed) so re-seeding is fast and
// deterministic; fresh=true re-runs extraction for every record against the evolving graph.
import fs from "node:fs";
import path from "node:path";
import { graph, Tracer } from "./db";
import { linkMentions, linkReferences, loadGazetteer } from "./ingest/link";
import { extractUnit, toUnits, type ExtractionCache } from "./ingest/pipeline";
import { loadOrg, loadSources } from "./ingest/sources";
import { createIndexes, deriveCollaboration, writeExtraction, writeOrg, writeReferences, writeSource } from "./ingest/write";

const CACHE = path.join(process.cwd(), "data", "kitestring", "extractions.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function seedGraph({ fresh = false, log = console.log }: { fresh?: boolean; log?: (s: string) => void } = {}) {
  const tx = new Tracer();
  const g = await graph();
  try {
    await g.delete();
  } catch {}
  await createIndexes(tx);

  const org = loadOrg();
  await writeOrg(tx, org);
  log(`org: ${org.people.length} people, ${org.teams.length} teams, ${org.systems.length} systems, ${org.projects.length} projects`);

  const sources = loadSources();
  const { terms } = await loadGazetteer(tx);
  for (const s of sources) await writeSource(tx, s, linkMentions(s, terms));
  for (const s of sources) await writeReferences(tx, s.key, linkReferences(s));
  log(`sources: ${sources.length}`);

  const cache: ExtractionCache = !fresh && fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const writable = (() => {
    try {
      fs.accessSync(path.dirname(CACHE), fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  })();
  for (const unit of toUnits(sources)) {
    for (let attempt = 1; ; attempt++) {
      try {
        const { result, cached } = await extractUnit(tx, unit, cache);
        const w = await writeExtraction(tx, unit, result);
        if (!cached && writable) fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
        const note = [...w.created.map((d) => `+ ${d.key}: ${d.statement}`), ...w.superseded.map((d) => `  ↳ supersedes ${d.key}`), ...w.asserted.map((k) => `  asserts ${k}`)];
        log(`${cached ? "·" : "✓"} ${unit[0].key}${note.length ? "\n  " + note.join("\n  ") : ""}`);
        break;
      } catch (e) {
        if (attempt >= 6) throw e;
        log(`  retry ${attempt} ${unit[0].key}: ${String((e as Error).message ?? e).slice(0, 160)}`);
        await sleep(attempt * 8000);
      }
    }
  }

  await deriveCollaboration(tx);
  const [counts] = await tx.ro<{ nodes: number; edges: number }>("count", `MATCH (n) WITH count(n) AS nodes MATCH ()-[r]->() RETURN nodes, count(r) AS edges`);
  log(`graph ready: ${counts.nodes} nodes, ${counts.edges} edges`);
  return counts;
}
