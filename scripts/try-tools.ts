// Runs every tool against the live graph without an LLM. Usage: pnpm tools [tool] [json-args]
import { closeDb, Tracer } from "../lib/db";
import { runTool } from "../lib/tools";

const cases: [string, Record<string, unknown>][] = process.argv[2]
  ? [[process.argv[2], JSON.parse(process.argv[3] ?? "{}")]]
  : [
      ["decision_lineage", { subject: "refund window" }],
      ["decision_lineage", { subject: "Project Atlas" }],
      ["who_knows", { subject: "ledger-db" }],
      ["who_knows", { subject: "SSO" }],
      ["profile", { subject: "Tomasz" }],
      ["connect", { from: "Kai Johnson", to: "refund policy" }],
      ["risk_radar", {}],
      ["real_teams", {}],
      ["search", { query: "parental leave policy" }],
      ["decision_lineage", { subject: "mobile app" }],
    ];

async function main() {
  for (const [name, args] of cases) {
    const tx = new Tracer();
    try {
      const r = await runTool(tx, name, args, "test");
      console.log(`\n=== ${name} ${JSON.stringify(args)} → ${r.outcome} (${tx.logs.map((l) => `${l.label}:${l.rows}r/${l.ms}ms`).join(", ")})`);
      console.log(JSON.stringify(r.data, null, 1).slice(0, 2500));
    } catch (e) {
      console.log(`\n=== ${name} FAILED: ${(e as Error).message}\n${tx.logs.at(-1)?.cypher ?? ""}`);
    }
  }
}
main().finally(closeDb);
