// Gary as an MCP server: the same graph tools the web agent uses, for Claude Desktop / Claude Code / any MCP client.
//   FALKORDB_URL=falkor://localhost:6379 pnpm mcp
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Tracer } from "../lib/db";
import { runTool, TOOLS } from "../lib/tools";

const server = new McpServer({ name: "gary-company-brain", version: "1.0.0" });

const subject = { subject: z.string().describe("Person, team, system, project or topic name, e.g. 'refund policy', 'ledger-db', 'Priya'") };
const SHAPES: Record<string, z.ZodRawShape> = {
  decision_lineage: subject,
  who_knows: subject,
  profile: subject,
  connect: { from: z.string(), to: z.string() },
  risk_radar: {},
  real_teams: {},
  search: { query: z.string() },
  open_ticket: {
    title: z.string(),
    details: z.string(),
    subject: z.string(),
    assignee: z.string().optional(),
    refs: z.array(z.string()).optional(),
  },
  remember: { note: z.string(), subject: z.string() },
};
const WRITES = new Set(["open_ticket", "remember"]);

for (const tool of TOOLS) {
  if (tool.type !== "function") continue;
  const name = tool.function.name;
  server.registerTool(
    name,
    {
      description: tool.function.description,
      inputSchema: SHAPES[name],
      annotations: { readOnlyHint: !WRITES.has(name), openWorldHint: false },
    },
    async (args: Record<string, unknown>) => {
      const tx = new Tracer();
      const result = await runTool(tx, name, args ?? {}, "mcp");
      const payload = {
        outcome: result.outcome,
        data: result.data,
        cite_these_keys: result.cites,
        cypher: tx.logs.map((l) => ({ label: l.label, ms: l.ms, rows: l.rows, query: l.cypher })),
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 1) }] };
    },
  );
}

server.connect(new StdioServerTransport()).catch((e) => {
  console.error(e);
  process.exit(1);
});
