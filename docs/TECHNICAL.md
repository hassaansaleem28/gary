# Gary: technical notes

Everything a judge or contributor needs that the main README keeps out of the way: the architecture, the exact graph model, every Cypher query the product depends on, and how to run it.

[Back to the README](../README.md)

## Architecture

```
 Slack ─┐                                        ┌─────────────── FalkorDB ───────────────┐
 Jira ──┤   normalise    gazetteer linking       │ Person Team System Project Topic       │
 Notion ┼─► Source ───►  (read from graph) ───►  │ Message Ticket Doc Meeting PR          │
 Mtgs ──┤                                        │ Decision ─SUPERSEDES─► Decision        │
 GitHub ┘   LLM decision extraction  ◄─context── │ Doc ─ASSERTS─► Decision  Finding (mem) │
            (active decisions from the graph)    └────────────▲───────────────────────────┘
                                                              │ parameterised Cypher only
 Question ─► memory recall ─► LLM picks tool(s) ─► Tool catalogue (12) ─► rows ─► answer
                                                   + citation validation + graph highlight
```

- **Next.js 16** (App Router) web app; API routes stream NDJSON agent events (tool call → Cypher → rows → answer).
- **FalkorDB** via the official `falkordb` Node client. Reads go through `GRAPH.RO_QUERY`.
- **LLM:** any OpenAI-compatible endpoint. We use **Groq** (`openai/gpt-oss-120b`, falling back to `gpt-oss-20b` and then `qwen3.8-27b` on rate limits). If no model is available, Gary answers from the rows alone.
- **Graph view:** `react-force-graph-2d` highlights exactly the nodes the answer used.
- **MCP:** `@modelcontextprotocol/sdk` stdio server in `mcp/server.ts`.

### Design rules (borrowed from the organisers' "agent that reasons over a graph" guide)
- **No model-written Cypher.** The model chooses from 12 fixed, parameterised tools.
- **Resolve before reasoning.** Names are matched against the graph (exact → alias → full-text with ≥50% word coverage). Unknown means *unknown_subject*, never a guess.
- **Answers carry their path.** Citations are validated against tool output, and the UI shows every query.
- **Names are validated too.** Our own demo recording caught the model citing real records while inventing a "Product-Mobile team led by Priya Patel". Every capitalised name pair and hyphenated proper noun in an answer must now exist in the graph or in this turn's tool results. Otherwise the answer is rebuilt from the graph rows, and the UI says which names were rejected. Backups for people going on leave are computed in Cypher, so the model never has to guess one.
- **Memory is just nodes**, linked to what it is about, with timestamps, so it can go stale with the graph.

## Graph data model

```cypher
(:Company)<-[:PART_OF]-(:Team)
(:Person {name, handle, role, joined, away_from?, away_to?})-[:MEMBER_OF]->(:Team)
(:Person)-[:LEADS]->(:Team | :Project)
(:Team)-[:OWNS]->(:System | :Topic)
(:Project {status})-[:INVOLVES]->(:Team)
(:Project)-[:USES]->(:System)

// every record from every connector
(:Source:Message | :Source:Ticket | :Source:Doc {living} | :Source:Meeting | :Source:PR
   {key, title, text, at, origin, url, conv})
(:Person)-[:AUTHORED | REVIEWED | ASSIGNED | REPORTED | ATTENDED]->(:Source)
(:Source)-[:MENTIONS]->(:Person | :System | :Project | :Topic)
(:Source)-[:CHANGES]->(:System)               // PRs
(:Source)-[:REFERENCES]->(:Source)            // PLAT-88, RFC-007 ...
(:Message)-[:REPLY_TO]->(:Message)            // threads

// decisions: extracted with graph context
(:Decision {statement, at, status: 'active' | 'superseded'})
(:Person)-[:MADE]->(:Decision)-[:ABOUT]->(:Topic | :System | :Project)
(:Decision)-[:DECIDED_IN]->(:Source)
(:Decision)-[:BECAUSE_OF]->(:Source)          // evidence: incidents, tickets
(:Decision)-[:SUPERSEDES]->(:Decision)
(:Source)-[:ASSERTS]->(:Decision)             // docs/tickets/PRs restating a decision

// derived + memory
(:Person)-[:COLLABORATES {w}]->(:Person)      // same thread/ticket/PR/meeting, or @-mentions
(:Finding {text, at, session, kind})-[:ABOUT]->(...)
(:Finding)-[:CITES]->(:Decision)              // → memory goes "outdated" when the decision is superseded
```

Every node has a `:Node` label with a range index on `key`. Entities carry `:Entity` with a **full-text index** on `name` and aliases, and sources have a **full-text index** on `title` and `text`.

## The Cypher Gary depends on

All tools live in [`lib/tools.ts`](../lib/tools.ts). These are the core ones:

**Decision lineage:** the longest `SUPERSEDES` chain behind each active decision about a subject (or the systems it uses):
```cypher
MATCH (s:Entity {key:$key})
MATCH (cur:Decision {status:'active'})-[:ABOUT]->(x)
WHERE x = s OR (s)-[:USES]->(x)
OPTIONAL MATCH chain = (cur)-[:SUPERSEDES*1..6]->(:Decision)
WITH cur, chain ORDER BY length(chain) DESC
WITH cur, collect(chain)[0] AS longest
RETURN cur.key AS key, [n IN nodes(longest) | n.key] AS lineage
```

**Stale docs:** living docs that state (or were the origin of) a superseded decision and don't assert the current one:
```cypher
MATCH (cur:Decision)-[:SUPERSEDES*1..6]->(old:Decision) WHERE cur.key IN $heads
MATCH (doc:Doc {living:true})
WHERE ((doc)-[:ASSERTS]->(old) OR (old)-[:DECIDED_IN]->(doc)) AND NOT (doc)-[:ASSERTS]->(cur)
OPTIONAL MATCH (a:Person)-[:AUTHORED]->(doc)
RETURN DISTINCT doc.key AS doc, doc.title AS title, old.key AS old, cur.key AS current, a.name AS author
```

**Who knows:** role-weighted, recency-decayed expertise (questions count less than answers):
```cypher
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
RETURN p.name, score, n, last, evidence, p.away_from ORDER BY score DESC LIMIT 5
```

**Time travel (`as_of`):** decisions are never deleted, only stamped `superseded_at`, so "what was in force on date t" is one filter:
```cypher
MATCH (s:Entity {key:$key})
MATCH (d:Decision)-[:ABOUT]->(x)
WHERE (x = s OR (s)-[:USES]->(x)) AND d.at <= $t AND (d.superseded_at IS NULL OR d.superseded_at > $t)
OPTIONAL MATCH (n:Decision)-[:SUPERSEDES]->(d)
RETURN d.statement, d.at, n.statement AS later_replaced_by, n.at AS replaced_on
```
The Time machine tab applies the same rule client side to every node (records appear at their `at`, people at `joined`, decisions grey out at `superseded_at`, docs turn stale when a decision they assert is superseded).

**Graph algorithms as agent tools:**
```cypher
// how are two things connected? (multi-hop, any direction)
MATCH (a:Node {key:$a}), (b:Node {key:$b})
CALL algo.SPpaths({sourceNode: a, targetNode: b, relTypes: $rels, relDirection: 'both', maxLen: 8, pathCount: 1})
YIELD path RETURN [n IN nodes(path) | n.name], [r IN relationships(path) | type(r)]

// knowledge brokers on the derived collaboration graph
CALL algo.betweenness({nodeLabels: ['Person'], relationshipTypes: ['COLLABORATES']}) YIELD node, score

// who actually works together vs the org chart
CALL algo.labelPropagation({nodeLabels: ['Person'], relationshipTypes: ['COLLABORATES'], maxIterations: 20})
YIELD node, communityId
```

**Entity resolution** (exact, then alias, then full-text with word coverage), **knowledge concentration / bus factor**, **memory recall with staleness**, **ticket creation** and the **ingestion writers** (MERGE-based, idempotent) are in [`lib/tools.ts`](../lib/tools.ts), [`lib/memory.ts`](../lib/memory.ts) and [`lib/ingest/write.ts`](../lib/ingest/write.ts).

### Why the graph is not decoration
Remove FalkorDB and Gary cannot do any of these: tell current from superseded, find stale docs, rank expertise, detect a single point of knowledge, explain *why* across hops, or invalidate memories. The side-by-side "plain RAG" panel uses the same records, the same model and FalkorDB's full-text index, but no relationships. It confidently answers the refund and Friday-deploy questions with the stale policy.

## Run it locally

Requirements: Docker, Node 20+, pnpm, and a free [Groq API key](https://console.groq.com/keys) (or any OpenAI-compatible endpoint, including local Ollama).

```bash
git clone https://github.com/hassaansaleem28/gary && cd gary
docker compose up -d                 # FalkorDB on :6379 and FalkorDB Browser on :3000
cp .env.example .env.local           # add your LLM_API_KEY
pnpm install
pnpm seed                            # builds the Kitestring graph from data/kitestring (cached extractions)
pnpm dev --port 3100                 # http://localhost:3100 (landing) and /app (workspace)
```

Other scripts:

| Command | What it does |
|---|---|
| `pnpm seed --fresh` | Re-run LLM decision extraction for every record against the evolving graph |
| `pnpm ask "Who knows about SSO?"` | Run the agent in the terminal, printing every tool call and query |
| `pnpm tools who_knows '{"subject":"ledger-db"}'` | Run one graph tool with no LLM |
| `pnpm mcp` | Start the MCP server (stdio) |

**Use Gary from Claude Desktop / Claude Code (MCP):**
```json
{
  "mcpServers": {
    "gary": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/gary", "-s", "mcp"],
      "env": { "FALKORDB_URL": "falkor://localhost:6379", "GRAPH_NAME": "kitestring" }
    }
  }
}
```

### Environment
| Variable | Default | |
|---|---|---|
| `FALKORDB_URL` | `falkor://localhost:6379` | `falkor://user:pass@host:port` for FalkorDB Cloud |
| `GRAPH_NAME` | `kitestring` | One graph per company/tenant |
| `LLM_BASE_URL` | Groq | Any OpenAI-compatible endpoint |
| `LLM_API_KEY` | – | |
| `LLM_MODEL` / `LLM_FAST_MODEL` | `openai/gpt-oss-120b` / `openai/gpt-oss-20b` | Fallback chain on 429 |

## Data

All data is **synthetic**. Kitestring is a fictional 21-person B2B billing startup: 65 records across Slack (33 messages), Jira (11), Notion + help center (8), meetings (3) and GitHub (10). The storylines (refund-policy reversals, a SOC2-delayed migration, a staff engineer going on leave, a lifted deploy freeze, a data-retention exception) are planted so that the answers *depend on how things connect*. No private, personal or scraped data is used.

`data/kitestring/extractions.json` caches the LLM's decision extraction. We ran extraction with `gpt-oss-120b`, then **reviewed it by hand**: we fixed a handful of mislabelled supersessions, such as a PR that was wrongly treated as replacing the release policy. That keeps the demo deterministic and the rate limits low. Live-feed messages always go through the LLM against the current graph.

## AI assistance

Built during the hackathon with **Claude Code** (Anthropic) as a pair programmer: research, scaffolding and much of the code were written with it, and design decisions, data storylines, reviews and testing were done together. Runtime LLMs: Groq-hosted open-weight models (`gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`). The graph model, queries and architecture are documented above and in the code.

## Limitations and next steps
- Real connectors (Slack/Jira/Notion/GitHub APIs and webhooks) instead of JSON exports. The ingestion pipeline (`lib/ingest/pipeline.ts → ingestLive`) is already per-record and incremental.
- Permissions that travel with content (`(:Person)-[:CAN_READ]->(:Source)` filters in every tool).
- One graph per tenant is already supported via `GRAPH_NAME`. A multi-tenant UI is next.
