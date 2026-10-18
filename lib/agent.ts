import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Tracer, type QueryLog } from "./db";
import { chat, llmConfigured } from "./llm";
import { recall, saveEpisode, type Memory } from "./memory";
import { resolve, runTool, TOOLS, type ToolResult } from "./tools";

export type AgentEvent =
  | { type: "memory"; memories: Memory[] }
  | { type: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { type: "result"; id: string; name: string; outcome: ToolResult["outcome"]; queries: QueryLog[]; nodes: string[]; data: unknown }
  | { type: "answer"; text: string; citations: Citation[]; invalidCitations: string[]; model: string; grounded: boolean; nodes: string[]; rebuilt: string[] };

export interface Citation {
  key: string;
  title: string;
  kind: string;
  at: number | null;
  url: string;
  text: string;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = (today: string, memory: string) => `You are Gary, the company brain of Kitestring (a 21-person B2B billing SaaS). You answer questions about how the company works using ONLY your tools, which query a FalkorDB knowledge graph built from Slack, Jira, Notion, meeting notes and GitHub.
Tool choice: decision_lineage for "what is our X / why / when / what was decided"; who_knows for "who knows / who owns / who should I ask"; profile for "what/who is X"; connect for "how is A related to B"; risk_radar for risks, bus factor, what could go wrong; catch_up for "what did I miss / what changed since"; real_teams for how people really collaborate; search only as a last resort.
Rules:
- Call a tool before answering any factual question. You may call several.
- Cite record keys from tool results (evidence, decided_in, key fields such as [github:ledger-158] or [decision:billing-0812c-1]) ONLY in square brackets right after each claim. Never cite tool names or person/team/system keys, e.g. [slack:billing-0812c] [decision:billing-0812c-1]. Never invent keys, people, dates or numbers.
- If a tool returns unknown_subject, you may retry ONCE with a shorter subject (e.g. one of "similar") or use search. If still nothing, say plainly it is not in the company graph. Never name a team, owner or person that no tool returned.
- If a recommended person is on_leave/away, say so and name a backup.
- Only name owners, experts or backups that decision_lineage, who_knows, profile, risk_radar or catch_up returned. Search results are keyword matches: never infer owners or people from them.
- When a decision replaced older ones, say what changed and when. Flag stale docs that still state old decisions, and name their authors.
- Only call fix_stale_docs, open_ticket or remember when the user explicitly asks you to act or remember. To fix stale docs, call fix_stale_docs once (it handles every doc).
- Be concise: a direct answer first, then 2-5 short bullet points. Plain markdown, no tables.
Today is ${today}.${memory}`;

const KEY_RE = /\[([a-z_]+:[^\]\s]+)\]/g;

export async function* runAgent(question: string, history: Turn[], session: string): AsyncGenerator<AgentEvent> {
  const tx = new Tracer();
  const results: { name: string; args: Record<string, unknown>; result: ToolResult }[] = [];
  let logCursor = 0;

  // Memory first: anything Gary learned in earlier sessions about the subjects in this question,
  // flagged if a decision it relied on has since been superseded.
  const { keys: subjects, vocab: graphVocab } = await subjectsIn(tx, question);
  const memories = await recall(tx, subjects);
  if (memories.length) yield { type: "memory", memories };
  const memoryText = memories.length
    ? `\nMemory from earlier sessions (mention it if relevant, and warn when outdated):\n${memories.map((m) => `- ${m.date}: ${m.text}${m.outdated ? " [OUTDATED: a decision it relied on was superseded since]" : ""}`).join("\n")}`
    : "";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM(new Date().toISOString().slice(0, 10), memoryText) },
    ...history.slice(-4).map((t) => ({ role: t.role, content: t.content.slice(0, 600) }) as ChatCompletionMessageParam),
    { role: "user", content: question },
  ];

  let finalText = "";
  let model = "none";
  let llmFailed = !llmConfigured();

  for (let step = 0; step < 4 && !llmFailed; step++) {
    let msg;
    try {
      ({ message: msg, model } = await chat(messages, { tools: TOOLS }));
    } catch (e) {
      console.error("llm failed", (e as Error).message);
      llmFailed = true;
      break;
    }
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      finalText = msg.content ?? "";
      break;
    }
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls } as ChatCompletionMessageParam);
    for (const call of calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {}
      yield { type: "tool", id: call.id, name: call.function.name, args };
      const result = await runTool(tx, call.function.name, args, session).catch(
        (e): ToolResult => ({ outcome: "empty", data: { error: String((e as Error).message) }, nodes: [], cites: [] }),
      );
      results.push({ name: call.function.name, args, result });
      yield { type: "result", id: call.id, name: call.function.name, outcome: result.outcome, queries: tx.logs.slice(logCursor), nodes: result.nodes, data: result.data };
      logCursor = tx.logs.length;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ outcome: result.outcome, ...(result.data as object) }).slice(0, 5000) });
    }
  }

  // No model available (rate limit / outage): route deterministically and answer from the rows.
  if (llmFailed && !results.length) {
    const [name, args] = route(question, subjects);
    yield { type: "tool", id: "fallback", name, args };
    const result = await runTool(tx, name, args, session);
    results.push({ name, args, result });
    yield { type: "result", id: "fallback", name, outcome: result.outcome, queries: tx.logs.slice(logCursor), nodes: result.nodes, data: result.data };
  }

  const allowed = new Set(results.flatMap((r) => r.result.cites));
  let grounded = true;
  let rebuilt: string[] = [];
  if (!finalText) {
    finalText = composeFromRows(results);
    model = llmFailed ? "graph-only (LLM unavailable)" : model;
  } else {
    const vocab = new Set([...graphVocab, ...words(JSON.stringify(results.map((r) => r.result.data))), ...words(question)]);
    rebuilt = inventedNames(finalText, vocab);
    if (rebuilt.length) {
      grounded = false;
      finalText = composeFromRows(results);
    }
  }

  // Validate: every cited key must come from a tool result in this turn.
  finalText = finalText
    .replace(/【([^】]+)】/g, "[$1]")
    .replace(/\[([a-z]+:[^\]\s]+?)(?:†[^\]]*)?\]/g, "[$1]")
    .replace(/\[(?:[a-z_]+)\]/g, "");
  // Keys written in prose, e.g. "(decision:x)", become citations too.
  for (const k of [...allowed].sort((a, b) => b.length - a.length)) {
    finalText = finalText.replace(new RegExp(`(?<![\\[\\w:-])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-]|\\])`, "g"), `[${k}]`);
  }
  finalText = finalText.replace(/\(\s*((?:\[[^\]]+\][,;\s]*)+)\)/g, " $1").replace(/ {2,}\[/g, " [");
  // Salvage compound citations like [evidence:meeting:x] when they end in a real key.
  finalText = finalText.replace(KEY_RE, (whole, k: string) => {
    if (allowed.has(k)) return whole;
    const real = [...allowed].find((a) => k.endsWith(a));
    return real ? `[${real}]` : whole;
  });
  const cited = [...new Set([...finalText.matchAll(KEY_RE)].map((m) => m[1]))];
  const invalid = cited.filter((k) => !allowed.has(k));
  if (invalid.length) {
    grounded = false;
    for (const k of invalid) finalText = finalText.split(`[${k}]`).join("");
  }
  const valid = cited.filter((k) => allowed.has(k));
  // with no explicit citations, fall back to the tools' records, but never when the subject wasn't found (those would be unrelated)
  const nothingFound = results.some((r) => r.result.outcome === "unknown_subject") && !results.some((r) => r.result.outcome === "ok" && r.name !== "search");
  const citations = await loadCitations(tx, valid.length ? valid : nothingFound ? [] : [...allowed].slice(0, 6));

  const nodes = [...new Set(results.flatMap((r) => r.result.nodes))];
  // only answers the graph actually supported become memories
  if (results.some((r) => r.result.outcome === "ok" && !["open_ticket", "remember", "fix_stale_docs"].includes(r.name)))
    await saveEpisode(tx, { session, question, answer: finalText, subjects: [...new Set([...subjects, ...results.flatMap((r) => r.result.nodes.filter((n) => /^(person|team|system|project|topic):/.test(n)))])].slice(0, 6), decisions: valid.filter((k) => k.startsWith("decision:")).concat(nodes.filter((n) => n.startsWith("decision:"))) }).catch(() => {});

  yield { type: "answer", text: finalText.trim(), citations, invalidCitations: invalid, model, grounded, nodes, rebuilt };
}

export async function subjectsIn(tx: Tracer, question: string): Promise<{ keys: string[]; vocab: Set<string> }> {
  const rows = await tx.ro<{ key: string; name: string; aliases: string[]; extra: string | null }>(
    "memory.subjects",
    `MATCH (n:Entity) WHERE NOT n:Company RETURN n.key AS key, n.name AS name, n.aliases AS aliases, coalesce(n.role, n.about) AS extra`,
  );
  const q = question.toLowerCase();
  const keys = rows.filter((r) => [r.name, ...(r.aliases ?? [])].some((t) => t.length > 2 && new RegExp(`(?<![\\w-])${t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(q))).map((r) => r.key);
  const vocab = new Set(words(rows.map((r) => `${r.name} ${(r.aliases ?? []).join(" ")} ${r.extra ?? ""}`).join(" ")));
  return { keys, vocab };
}

const words = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [];

// Plain-English capitalised words that may legitimately start a phrase ("Bottom Line", "Next Steps").
const COMMON = new Set(
  `a an the yes no not key points point bottom line next steps step primary secondary contact contacts owner owners owned backup backups current currently policy note notes
  evidence other others summary short answer answers action actions item items open question questions why what who whom how when where which today tl dr also however therefore
  so if and or but for with since until from to of on in at by about after before during talk reach ask ping start check update updates use see stale docs doc document
  documents decision decisions lineage risk risks radar team teams people person expert experts knowledge share records record active replaced superseded monthly annual plans
  plan refund refunds window days day weeks week months month quick takeaway takeaways overview details detail status timeline history context recommendation recommendations
  suggested suggestion important warning caveat sources source slack jira notion github meeting meetings ticket tickets thread threads channel help center playbook handbook
  engineering product follow ups up follow-up you your we our they their he she his her it its this that these those there here is are was were be been being has have had`.split(/\s+/),
);
const MONTHS = new Set("january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec monday tuesday wednesday thursday friday saturday sunday".split(" "));

// Guard against invented people/teams: every capitalised name pair (and hyphenated proper noun) must exist in the
// graph vocabulary or in this turn's tool results. Citations alone can't catch a made-up "Priya Patel".
export function inventedNames(text: string, vocab: Set<string>): string[] {
  const clean = text.replace(/\[[^\]]+\]/g, " ").replace(/[*_`#>|]/g, " ");
  const known = (w: string) => vocab.has(w) || COMMON.has(w) || MONTHS.has(w);
  const out = new Set<string>();
  for (const m of clean.matchAll(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g)) {
    const [a, b] = [m[1].toLowerCase(), m[2].toLowerCase()];
    if (COMMON.has(b) && (COMMON.has(a) || vocab.has(a))) continue;
    if (!known(a) || !known(b)) out.add(`${m[1]} ${m[2]}`);
  }
  for (const m of clean.matchAll(/\b([A-Z][a-z]+(?:-[A-Z][a-z]+)+)\b/g)) {
    if (m[1].toLowerCase().split("-").some((w) => !known(w))) out.add(m[1]);
  }
  return [...out];
}

function route(q: string, subjects: string[] = []): [string, Record<string, unknown>] {
  const s = q.toLowerCase();
  if (/\b(fix|open (a )?tickets?)\b/.test(s) && subjects.length) return ["fix_stale_docs", { subject: subjects[0] }];
  const subject = q.replace(/^(who|what|why|when|how|where)\b.*?\b(about|on|for|is|are|of)\s+/i, "").replace(/[?.!]+$/, "");
  if (/risk|bus factor|single point|what could go wrong/.test(s)) return ["risk_radar", {}];
  if (/what did i miss|catch me up|what changed|while i was (away|out)/.test(s)) return ["catch_up", { days: 30 }];
  if (/actually work|real team|collaborat/.test(s)) return ["real_teams", {}];
  if (/who (knows|owns|should|can|to ask)|expert/.test(s)) return ["who_knows", { subject }];
  if (/why|decid|policy|when|what('s| is) our|window|date/.test(s)) return ["decision_lineage", { subject }];
  return ["search", { query: q }];
}

export function composeFromRows(results: { name: string; result: ToolResult }[]): string {
  const out: string[] = [];
  // one honest "not in the graph" line, however many lookups the model tried
  const unknown = [...new Set(results.filter((r) => r.result.outcome === "unknown_subject").map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = r.result.data as Record<string, any>;
    return String(d.subject ?? d.person ?? d.unknown?.join(", "));
  }))];
  const anyKnown = results.some((r) => r.result.outcome === "ok" && r.name !== "search");
  if (unknown.length) out.push(`**Not in the company graph.** Kitestring has no person, team, system, project or topic called ${unknown.map((u) => `"${u}"`).join(" or ")}, so there is no owner or decision I can point to.`);
  for (const { name, result } of results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = result.data as Record<string, any>;
    if (result.outcome === "unknown_subject") continue;
    if (name === "search" && unknown.length && !anyKnown) {
      if (d.results?.length) out.push(`Nearest keyword matches, for reference only: ${d.results.slice(0, 2).map((r: { title: string; key: string }) => `${r.title} [${r.key}]`).join(" · ")}`);
      continue;
    }
    if (name === "decision_lineage" && d.current) {
      for (const c of d.current) {
        out.push(`**${c.statement}** Decided ${c.date}${c.decided_by.length ? ` by ${c.decided_by.join(", ")}` : ""} [${c.decided_in}] [${c.key}].`);
        for (const r of c.replaced) out.push(`- Replaced (${r.date}): ${r.statement} [${r.key}]`);
      }
      for (const s of d.stale_docs ?? []) out.push(`- ⚠️ Stale doc: "${s.title}"${s.author ? ` (${s.author})` : ""} still says: ${s.still_says} [${s.key}]`);
    } else if (name === "who_knows" && d.experts) {
      out.push(`People who know **${d.subject.name}** best:`);
      for (const e of d.experts.slice(0, 3)) out.push(`- **${e.name}** (${e.role}, ${e.team}) · ${e.share_of_knowledge} · last active ${e.last_active}${e.on_leave ? ` · ⚠️ ${e.on_leave}` : ""} [${e.evidence[0]}]`);
      if (d.owner) out.push(`- Owner: ${d.owner.team}${d.owner.lead ? ` (lead: ${d.owner.lead})` : ""}`);
    } else if (name === "risk_radar") {
      for (const r of d.single_points_of_knowledge.slice(0, 3)) out.push(`- **${r.subject}**: ${r.main_knower} holds ${r.share} of the knowledge${r.main_knower_away_from ? ` and is away from ${r.main_knower_away_from}` : ""}.`);
      for (const s of d.stale_docs) out.push(`- ⚠️ Stale: "${s.title}" [${s.doc}]`);
    } else if (name === "connect" && d.path) {
      out.push(`${d.from.name} → ${d.to.name} in ${d.hops} hops: ${d.path}`);
    } else if (name === "search" && d.results) {
      out.push(`Top records for "${d.query}":`);
      for (const r of d.results.slice(0, 4)) out.push(`- ${r.title} (${r.date}): ${r.excerpt} [${r.key}]`);
    } else if (name === "fix_stale_docs" && d.tickets) {
      out.push(`Opened tickets to bring the stale **${d.subject.name}** docs in line with the current decision:`);
      for (const t of d.tickets) out.push(`- ${t.already_open ? "Already open" : "Created"} [${t.key}] for "${t.title}" [${t.doc}] → ${t.assigned_to}`);
    } else if (name === "catch_up" && d.decisions) {
      out.push(`Since ${d.since} (${d.for}):`);
      for (const x of d.decisions.slice(0, 6)) out.push(`- ${x.date}: ${x.statement}${x.replaced.length ? " (replaced an earlier decision)" : ""} [${x.key}]`);
      for (const t of d.open_tickets.slice(0, 3)) out.push(`- Open: ${t.title}${t.assignee ? ` → ${t.assignee}` : ""} [${t.key}]`);
    } else if (name === "real_teams" && d.clusters) {
      for (const c of d.clusters) out.push(`- ${c.members.join(", ")}`);
    } else if (result.outcome === "empty") {
      out.push(`Nothing in the graph answers this.${d.owner ? ` The owner is ${d.owner.team}${d.owner.lead ? ` (${d.owner.lead})` : ""}.` : ""}`);
    } else {
      out.push("```json\n" + JSON.stringify(d, null, 1).slice(0, 800) + "\n```");
    }
  }
  return out.join("\n") || "I couldn't find anything in the company graph for that.";
}

async function loadCitations(tx: Tracer, keys: string[]): Promise<Citation[]> {
  if (!keys.length) return [];
  const rows = await tx.ro<{ key: string; title: string; kind: string; at: number | null; url: string; text: string; dsrc: string | null }>(
    "citations",
    `MATCH (n:Node) WHERE n.key IN $ks
     OPTIONAL MATCH (n)-[:DECIDED_IN]->(src:Source)
     RETURN n.key AS key, coalesce(n.title, n.statement, n.name) AS title,
            [l IN labels(n) WHERE NOT l IN ['Node','Entity','Source']][0] AS kind, n.at AS at,
            coalesce(n.url, src.url, '') AS url, coalesce(n.text, n.statement, '') AS text, src.key AS dsrc`,
    { ks: keys },
  );
  const order = new Map(keys.map((k, i) => [k, i]));
  return rows.sort((a, b) => order.get(a.key)! - order.get(b.key)!).map(({ key, title, kind, at, url, text }) => ({ key, title, kind, at, url, text }));
}

export { resolve };
