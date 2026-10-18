# gary.

**Every company has a Gary: the person who has been there forever and knows *why* everything is the way it is. When Gary leaves, the company forgets. We built a Gary that never leaves.**

Gary is a company-brain agent built on **FalkorDB**. It reads a company's Slack, Jira, Notion/help center, meeting notes and GitHub into one graph of people, teams, systems, projects, records and **decisions**. It answers by walking that graph: what is *currently* true, which decisions it replaced, who decided, why, who actually knows, and **which docs are now lying**. Every answer shows the Cypher it ran and cites only records the graph returned.

> Graph Hacks: Context for AI Agents (WeMakeDevs × FalkorDB), October 2026
> **Tracks entered: Track 03 Company Brain (primary), Track 01 Agents That Act on Connected Data, Track 02 Agent Memory and Coordination**

- **Live demo:** https://gary-company-brain.vercel.app (FalkorDB Cloud ap-south-1 + Vercel bom1)
- **Demo video:** [`docs/demo.mp4`](docs/demo.mp4) (3 min captioned walkthrough, recorded by driving the real app)
- **Repo:** https://github.com/hassaansaleem28/gary

![Gary answering a refund question with decision lineage and stale docs](docs/refund.png)

---

## The problem (from what people actually complain about)

Before building, we read founder, engineer and operator discussions about company knowledge. The same complaints come up everywhere:

| Complaint | What we found |
|---|---|
| **Stale knowledge gives confident wrong answers** | "Stale knowledge does not announce itself." A [company-brain essay](https://marcosnewsletter.substack.com/p/how-to-build-a-company-brain) and its commenters call *"which parts are current and authoritative at the moment of action"* the next problem after building the brain. A [Slite survey](https://slite.com/learn/dangers-of-stale-documentation) reports that most respondents had seen an AI tool surface an outdated doc as fact. |
| **Decisions get lost in Slack threads** | "A decision made in a Slack thread last week has the same retrieval weight as a requirements document written six months ago" ([DEV](https://dev.to/rubab_zahra_9260/your-ai-gives-confident-wrong-answers-because-your-docs-are-a-mess-not-because-the-model-is-bad-57n9)). Teams [keep reopening the same decisions](https://thehybridleader.substack.com/p/the-decision-log-stop-reopening-the-same-engineering-decisions). |
| **"Who do I even ask?"** | The main onboarding bottleneck is [knowing who to ask](https://www.read.ai/it/articles/how-to-improve-the-employee-onboarding-experience). |
| **Bus factor** | When one person holds the knowledge, ["the interpretive layer" leaves with them](https://developers.fabric.so/blog/the-bus-factor). |
| **Search that doesn't act** | The top criticism of enterprise search: ["great at finding information but stops short of actually doing anything with it"](https://devrev.ai/blog/top-glean-alternatives). |

Every one of these is about **relationships, not text**. A vector index cannot know that an August Slack reply overrides a March Notion page. A graph can, through one `SUPERSEDES` edge.

## What Gary does (mapped to the Track 3 focus areas)

| Track 3 focus area | How Gary does it in the graph |
|---|---|
| **Knowledge from multiple sources** | 5 connectors (Slack, Jira, Notion + help center, meetings, GitHub) become `Source` nodes. Authors, reviewers, assignees and attendees become edges. Mentions are linked with a gazetteer read *from the graph itself*. |
| **Ownership and expertise** | `who_knows` ranks people by recency-weighted, role-weighted traversal (`AUTHORED`, `ASSIGNED`, `REVIEWED`...) and also returns the owning team and lead. It flags people who are about to be on leave. |
| **Decision lineage** | Decisions are extracted with *graph context* (the LLM sees the currently active decisions) into `(:Decision)-[:SUPERSEDES]->(:Decision)` chains with `DECIDED_IN`, `MADE` and `BECAUSE_OF` edges, traversed with `SUPERSEDES*1..6`. |
| **Current knowledge** | The live feed ingests a new message. If it contains a decision, older ones are superseded and **every living doc that still `ASSERTS` the old decision is flagged stale**. Memories that relied on it are flagged **outdated**. |
| **Sourced answers** | Every citation in the answer must be a key returned by a tool in this turn; anything else is stripped. Each answer shows the exact Cypher, params, row counts and timings. |

**Plus:**
- **Acts** (Track 1): "Fix it" opens tickets in the graph, assigned to the stale docs' authors (or the owning team's lead).
- **Remembers** (Track 2): episodic memory as `Finding` nodes that know when they've gone stale.
- **Algorithms as tools** (Track 1): `algo.SPpaths`, `algo.betweenness`, `algo.labelPropagation`.
- **MCP server** (Track 1): the same tools are exposed to Claude Desktop, Claude Code or any MCP client.

## Demo storyline (try these)

1. **"Can a customer get a full refund after 20 days?"** Plain RAG (shown side by side) retrieves the June meeting notes and says *yes, 30 days*. Gary walks `SUPERSEDES` and answers **no: 14 days since Aug 12, decided by Maya in #billing because of BILL-212 (refund abuse)**. It shows the two older decisions it replaced and flags **3 docs that still say 30 days** (Notion policy, support playbook, help center) with their authors. It also surfaces Carlos's confused #support message.
2. Click **"Fix it"**: Gary opens tickets assigned to Jordan and Mei. They appear as red nodes in the graph.
3. **"Who should I talk to about ledger-db?"** Tomasz holds about 55% of the hands-on knowledge, **but he is on parental leave from Nov 2**, inside the Atlas rollback window. Omar and Hana are the backups.
4. **"What are our biggest knowledge risks right now?"** Knowledge concentration per system/project, upcoming absences, betweenness-central knowledge brokers and stale docs.
5. **"Why is usage-based pricing launching Dec 1?"** Multi-hop: Dec 1 replaced Nov 15 because the Atlas ledger cutover is Oct 28, which moved there because of the SOC2 audit change freeze.
6. **Live feed:** post the preset "CEO changes the refund policy again". Gary extracts a new decision and supersedes the 14-day one. Ask question 1 again: the old memories are marked **OUTDATED** and the answer changes.
7. **"Who owns the mobile app?"** The answer is **not in the graph**. Gary resolves names strictly, so "mobile app" never silently becomes `web-app`.

## Architecture

```
 Slack ─┐                                        ┌─────────────── FalkorDB ───────────────┐
 Jira ──┤   normalise    gazetteer linking       │ Person Team System Project Topic       │
 Notion ┼─► Source ───►  (read from graph) ───►  │ Message Ticket Doc Meeting PR          │
 Mtgs ──┤                                        │ Decision ─SUPERSEDES─► Decision        │
 GitHub ┘   LLM decision extraction  ◄─context── │ Doc ─ASSERTS─► Decision  Finding (mem) │
            (active decisions from the graph)    └────────────▲───────────────────────────┘
                                                              │ parameterised Cypher only
 Question ─► memory recall ─► LLM picks tool(s) ─► Tool catalogue (9) ─► rows ─► answer
                                                   + citation validation + graph highlight
```

- **Next.js 16** (App Router) web app; API routes stream NDJSON agent events (tool call → Cypher → rows → answer).
- **FalkorDB** via the official `falkordb` Node client. Reads go through `GRAPH.RO_QUERY`.
- **LLM:** any OpenAI-compatible endpoint. We use **Groq** (`openai/gpt-oss-120b`, falling back to `gpt-oss-20b` and then `qwen3.8-27b` on rate limits). If no model is available, Gary answers from the rows alone.
- **Graph view:** `react-force-graph-2d` highlights exactly the nodes the answer used.
- **MCP:** `@modelcontextprotocol/sdk` stdio server in `mcp/server.ts`.

### Design rules (borrowed from the organisers' "agent that reasons over a graph" guide)
- **No model-written Cypher.** The model chooses from 9 fixed, parameterised tools.
- **Resolve before reasoning.** Names are matched against the graph (exact → alias → full-text with ≥50% word coverage). Unknown means *unknown_subject*, never a guess.
- **Answers carry their path.** Citations are validated against tool output, and the UI shows every query.
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

All tools live in [`lib/tools.ts`](lib/tools.ts). These are the core ones:

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

**Entity resolution** (exact, then alias, then full-text with word coverage), **knowledge concentration / bus factor**, **memory recall with staleness**, **ticket creation** and the **ingestion writers** (MERGE-based, idempotent) are in [`lib/tools.ts`](lib/tools.ts), [`lib/memory.ts`](lib/memory.ts) and [`lib/ingest/write.ts`](lib/ingest/write.ts).

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
pnpm dev --port 3100                 # http://localhost:3100
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

## AI assistance disclosure

Built during the hackathon with **Claude Code** (Anthropic) as a pair programmer: research, scaffolding and much of the code were written with it, and design decisions, data storylines, reviews and testing were done together. Runtime LLMs: Groq-hosted open-weight models (`gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`). The graph model, queries and architecture are documented above and in the code.

## Limitations and next steps
- Real connectors (Slack/Jira/Notion/GitHub APIs and webhooks) instead of JSON exports. The ingestion pipeline (`lib/ingest/pipeline.ts → ingestLive`) is already per-record and incremental.
- Permissions that travel with content (`(:Person)-[:CAN_READ]->(:Source)` filters in every tool).
- One graph per tenant is already supported via `GRAPH_NAME`. A multi-tenant UI is next.
