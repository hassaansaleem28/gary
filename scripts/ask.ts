// CLI for the agent: pnpm ask "What's our refund window?"
import { closeDb } from "../lib/db";
import { runAgent } from "../lib/agent";

async function main() {
  const q = process.argv.slice(2).join(" ") || "What's our refund window?";
  const t0 = Date.now();
  for await (const ev of runAgent(q, [], "cli")) {
    if (ev.type === "memory") console.log("🧠 memory:", ev.memories.map((m) => `${m.outdated ? "[OUTDATED] " : ""}${m.text}`));
    if (ev.type === "tool") console.log(`🔧 ${ev.name}(${JSON.stringify(ev.args)})`);
    if (ev.type === "result") console.log(`   → ${ev.outcome}: ${ev.queries.map((q) => `${q.label} ${q.rows}r ${q.ms}ms`).join(" | ")}`);
    if (ev.type === "answer") {
      console.log(`\n💬 [${ev.model}${ev.rebuilt.length ? ", REBUILT (invented: " + ev.rebuilt.join(", ") + ")" : ""}${ev.invalidCitations.length ? ", stripped: " + ev.invalidCitations.join(",") : ""}]\n${ev.text}`);
      console.log("\n📎", ev.citations.map((c) => `${c.key} (${c.kind})`).join(", "));
    }
  }
  console.log(`\n⏱ ${Date.now() - t0}ms`);
}
main().finally(closeDb);
