// pnpm seed            rebuild from cached (human-reviewed) extractions
// pnpm seed --fresh    re-run LLM extraction for every record
import { closeDb } from "../lib/db";
import { seedGraph } from "../lib/seed";

seedGraph({ fresh: process.argv.includes("--fresh") })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
