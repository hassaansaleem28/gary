"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolCards, Trail } from "./components/Cards";
import { GraphView, type GLink, type GNode } from "./components/GraphView";
import { KIND, fmtDate } from "./components/kinds";
import { LiveFeed } from "./components/LiveFeed";
import { Markdown, type Cite } from "./components/Markdown";

interface Step {
  id: string;
  name: string;
  args: any;
  outcome?: string;
  queries?: any[];
  data?: any;
}
interface Msg {
  id: string;
  role: "user" | "gary";
  text: string;
  steps: Step[];
  memories?: any[];
  answer?: { citations: Cite[]; model: string; grounded: boolean; invalidCitations: string[]; rebuilt?: string[] };
  compare?: { text: string; docs: { key: string; title: string }[]; model: string } | "loading";
  pending?: boolean;
}

const SUGGESTIONS: { area: string; q: string }[] = [
  { area: "Stale docs", q: "Can a customer get a full refund after 20 days?" },
  { area: "Decision lineage", q: "Why is usage-based pricing launching Dec 1?" },
  { area: "Current knowledge", q: "Are Friday deploys allowed?" },
  { area: "Ownership & expertise", q: "Who should I talk to about ledger-db?" },
  { area: "Risk", q: "What are our biggest knowledge risks right now?" },
  { area: "Multi-hop", q: "How is Kai Johnson connected to the refund policy?" },
  { area: "Org reality", q: "How do people actually work together here?" },
  { area: "Catch up", q: "I'm Priya, back from 3 weeks off. What did I miss?" },
  { area: "Decision lineage", q: "Who decided our API rate limits, and why?" },
  { area: "Honesty", q: "Who owns the mobile app?" },
];

export default function Home() {
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [stale, setStale] = useState<Set<string>>(new Set());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [tab, setTab] = useState<"graph" | "live" | "how">("graph");
  const [compare, setCompare] = useState(true);
  const [drawer, setDrawer] = useState<any | null>(null);
  const [session] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : String(Date.now())));
  const cites = useRef(new Map<string, Cite>());
  const scroller = useRef<HTMLDivElement>(null);

  const loadGraph = useCallback(async () => {
    const r = await fetch("/api/graph").then((r) => r.json());
    // keep existing node objects (and their x/y) so the layout doesn't restart on every refresh
    setGraph((prev) => {
      const old = new Map(prev.nodes.map((n) => [n.id, n]));
      const nodes = (r.nodes as GNode[]).map((n) => (old.has(n.id) ? Object.assign(old.get(n.id)!, n) : n));
      return { nodes, links: r.links };
    });
    setStale(new Set(r.stale));
  }, []);
  useEffect(() => {
    loadGraph();
  }, [loadGraph]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const people = useMemo(
    () =>
      graph.nodes
        .filter((n) => n.label === "Person")
        .map((n) => ({ handle: n.id.replace("person:", "").split("-")[0], name: n.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [graph.nodes],
  );
  const stats = useMemo(() => {
    const by = (l: string) => graph.nodes.filter((n) => n.label === l).length;
    return { nodes: graph.nodes.length, edges: graph.links.length, decisions: by("Decision"), people: by("Person"), records: graph.nodes.filter((n) => ["Message", "Ticket", "Doc", "Meeting", "PR"].includes(n.label)).length };
  }, [graph]);

  const openCite = useCallback(async (key: string) => {
    const known = cites.current.get(key);
    setDrawer(known ? { ...known, loading: true } : { key, loading: true });
    const r = await fetch(`/api/node?key=${encodeURIComponent(key)}`).then((r) => r.json());
    setDrawer(r.error ? { key, title: key, text: "Not found in graph" } : r);
    setHighlight((h) => [...new Set([...h, key])]);
  }, []);

  const ask = useCallback(
    async (q: string) => {
      if (!q.trim() || busy) return;
      setBusy(true);
      setInput("");
      setTab("graph");
      const history = msgs.filter((m) => !m.pending).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      const uid = `u${Date.now()}`;
      const gid = `g${Date.now()}`;
      setMsgs((m) => [...m, { id: uid, role: "user", text: q, steps: [] }, { id: gid, role: "gary", text: "", steps: [], pending: true, compare: compare ? "loading" : undefined }]);
      const patch = (fn: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m) => (m.id === gid ? fn(m) : m)));
      setHighlight([]);

      if (compare)
        fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) })
          .then((r) => r.json())
          .then((c) => patch((m) => ({ ...m, compare: c })))
          .catch(() => patch((m) => ({ ...m, compare: undefined })));

      try {
        const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history, session }) });
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop()!;
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line);
            if (ev.type === "memory") patch((m) => ({ ...m, memories: ev.memories }));
            if (ev.type === "tool") patch((m) => ({ ...m, steps: [...m.steps, { id: ev.id, name: ev.name, args: ev.args }] }));
            if (ev.type === "result") {
              patch((m) => ({ ...m, steps: m.steps.map((s) => (s.id === ev.id ? { ...s, outcome: ev.outcome, queries: ev.queries, data: ev.data } : s)) }));
              setHighlight((h) => [...new Set([...h, ...ev.nodes])]);
            }
            if (ev.type === "answer") {
              ev.citations.forEach((c: Cite) => cites.current.set(c.key, c));
              patch((m) => ({ ...m, text: ev.text, pending: false, answer: { citations: ev.citations, model: ev.model, grounded: ev.grounded, invalidCitations: ev.invalidCitations, rebuilt: ev.rebuilt } }));
              setHighlight(ev.nodes);
            }
            if (ev.type === "error") patch((m) => ({ ...m, text: `Something went wrong: ${ev.message}`, pending: false }));
          }
        }
        // every answer writes a memory episode (and maybe tickets), so refresh the graph
        loadGraph();
      } catch (e) {
        patch((m) => ({ ...m, text: `Network error: ${(e as Error).message}`, pending: false }));
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, compare, session, loadGraph],
  );

  async function reset() {
    if (!confirm("Rebuild the Kitestring graph from the raw sources? Live-feed messages, tickets and memory will be cleared.")) return;
    setBusy(true);
    await fetch("/api/reset", { method: "POST" });
    await loadGraph();
    setMsgs([]);
    setHighlight([]);
    setBusy(false);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-panel/70 px-5 py-3 backdrop-blur">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight text-white">
            gary<span className="text-accent">.</span>
          </span>
          <span className="hidden text-[12.5px] text-muted md:inline">Every company has a Gary. This one never leaves.</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11.5px] text-muted">
          <span className="hidden gap-3 lg:flex">
            <span>
              <b className="text-white">{stats.records}</b> records
            </span>
            <span>
              <b className="text-white">{stats.people}</b> people
            </span>
            <span>
              <b className="text-white">{stats.decisions}</b> decisions
            </span>
            <span>
              <b className="text-white">{stats.nodes}</b> nodes · <b className="text-white">{stats.edges}</b> edges
            </span>
          </span>
          <span className="rounded-full border border-line px-2 py-0.5">Kitestring · synthetic data</span>
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent">FalkorDB</span>
          <button onClick={reset} disabled={busy} className="rounded-md border border-line px-2 py-0.5 hover:text-white disabled:opacity-40">
            Reset demo
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
        {/* chat */}
        <section className="flex min-h-0 flex-col border-r border-line">
          <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {!msgs.length && (
              <div className="fade-in mx-auto max-w-xl pt-6">
                <h1 className="text-3xl font-black leading-tight tracking-tight text-white">
                  Ask Gary why things are <span className="text-accent">the way they are.</span>
                </h1>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">
                  Gary reads Kitestring&apos;s Slack, Jira, Notion, meetings and GitHub into one FalkorDB graph of people, teams, systems, projects and <i>decisions</i>. He answers by
                  walking that graph: what&apos;s current, what it replaced, who decided, who knows, and which docs are lying. Every answer shows its path and sources.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.q} onClick={() => ask(s.q)} className="group rounded-xl border border-line bg-panel-2/60 p-3 text-left transition hover:border-accent/60">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted group-hover:text-accent">{s.area}</div>
                      <div className="mt-0.5 text-[13.5px] text-white">{s.q}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="fade-in flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-2/15 px-4 py-2 text-[14px] text-white">{m.text}</div>
                </div>
              ) : (
                <div key={m.id} className="fade-in">
                  <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-muted">
                    <span className="font-bold text-white">gary</span>
                    {m.answer && (
                      <>
                        <span>· {m.answer.model}</span>
                        {m.answer.rebuilt?.length ? (
                          <span className="text-accent">· ⚠ model named {m.answer.rebuilt.join(", ")} (not in the graph), so the answer was rebuilt from graph rows</span>
                        ) : (
                          <span className={m.answer.grounded ? "text-good" : "text-accent"}>· {m.answer.grounded ? "✓ all citations verified against the graph" : `stripped ${m.answer.invalidCitations.length} unverified citation(s)`}</span>
                        )}
                      </>
                    )}
                  </div>
                  {m.memories?.length ? (
                    <div className="mb-2 rounded-lg border border-[#38d6f5]/30 bg-[#38d6f5]/5 px-3 py-2 text-[12px] text-[#9fe8f8]">
                      🧠 Remembered from earlier:
                      {m.memories.slice(0, 2).map((mem: any) => (
                        <div key={mem.key} className="mt-0.5 text-muted">
                          {mem.outdated && <span className="mr-1 rounded bg-bad/20 px-1 text-[10px] font-bold text-bad">OUTDATED · decision since superseded</span>}
                          {mem.date}: {mem.text}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <Trail steps={m.steps} />
                  {m.pending && !m.steps.length && <div className="pulse-dot text-[13px] text-muted">Gary is thinking…</div>}
                  {m.text && (
                    <div className="rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-3">
                      <Markdown text={m.text} cites={m.answer?.citations ?? []} onCite={openCite} />
                    </div>
                  )}
                  {!m.pending && m.steps.map((s) => <ToolCards key={s.id} name={s.name} data={s.data} onCite={openCite} onAsk={ask} />)}
                  {m.answer?.citations?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-[11px] text-muted">Sources:</span>
                      {m.answer.citations.map((c) => (
                        <button key={c.key} className="chip" onClick={() => openCite(c.key)} title={c.title}>
                          <span style={{ color: KIND[c.kind]?.color }}>{KIND[c.kind]?.icon}</span>
                          {c.title.length > 34 ? c.title.slice(0, 32) + "…" : c.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {m.compare && (
                    <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-[12.5px]">
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Same question, plain chunk-retrieval RAG (no graph)</div>
                      {m.compare === "loading" ? (
                        <span className="pulse-dot text-muted">retrieving top documents…</span>
                      ) : (
                        <>
                          <div className="text-[#b9c2d6]">{m.compare.text}</div>
                          <div className="mt-1 text-[11px] text-muted">retrieved: {m.compare.docs.map((d) => d.title).join(" · ") || "nothing"}</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
          <div className="border-t border-line bg-panel/60 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about how Kitestring works…"
                className="flex-1 rounded-xl border border-line bg-black/30 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-muted focus:border-accent"
              />
              <button disabled={busy || !input.trim()} className="rounded-xl bg-accent px-4 text-[14px] font-semibold text-black disabled:opacity-40">
                Ask
              </button>
            </form>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11.5px] text-muted">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[#f5b942]" />
              Also show what plain RAG (no graph) answers
            </label>
          </div>
        </section>

        {/* right panel */}
        <section className="flex min-h-[60vh] flex-col lg:min-h-0">
          <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12.5px]">
            {(
              [
                ["graph", "Company graph"],
                ["live", "Live feed"],
                ["how", "How it works"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 ${tab === k ? "bg-panel-2 text-white" : "text-muted hover:text-white"}`}>
                {label}
              </button>
            ))}
            {highlight.length > 0 && tab === "graph" && (
              <button onClick={() => setHighlight([])} className="ml-auto text-[11.5px] text-muted hover:text-white">
                showing {highlight.length} nodes from the last answer · clear
              </button>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            {tab === "graph" && <GraphView data={graph} highlight={highlight} staleDocs={stale} onNodeClick={(n) => openCite(n.id)} />}
            {tab === "live" && (
              <LiveFeed
                people={people}
                onIngested={() => {
                  loadGraph();
                }}
              />
            )}
            {tab === "how" && <HowItWorks />}
          </div>
        </section>
      </main>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDrawer(null)}>
          <div className="fade-in h-full w-full max-w-md overflow-y-auto border-l border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                <span style={{ color: KIND[drawer.kind]?.color }}>{KIND[drawer.kind]?.icon}</span> {KIND[drawer.kind]?.label ?? drawer.kind} · {drawer.key}
              </span>
              <button onClick={() => setDrawer(null)} className="text-muted hover:text-white">
                ✕
              </button>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-white">{drawer.title}</h3>
            <div className="mt-1 text-[12px] text-muted">
              {fmtDate(drawer.at)}
              {drawer.author ? ` · by ${drawer.author}` : ""}
              {drawer.status ? ` · ${drawer.status}` : ""}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-[#d4dbe8]">{drawer.loading ? "…" : drawer.text}</p>
            {drawer.decidedIn && (
              <button className="chip mt-3" onClick={() => openCite(drawer.decidedIn)}>
                decided in {drawer.decidedIn}
              </button>
            )}
            {drawer.url && <div className="mt-4 break-all font-mono text-[11px] text-muted">{drawer.url}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="h-full overflow-y-auto p-5 text-[13px] leading-relaxed text-[#c9d2e3]">
      <h3 className="text-base font-semibold text-white">How Gary works</h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          <b className="text-white">Ingest:</b> Slack, Jira, Notion/help center, meeting notes and GitHub PRs become <code>Source</code> nodes. Authors, reviewers, assignees and attendees become edges. Mentions of
          people, systems, projects and topics are linked using a gazetteer read <i>from the graph itself</i>.
        </li>
        <li>
          <b className="text-white">Extract decisions with graph context:</b> for each record, the LLM is shown the subjects and the <i>currently active decisions</i> in FalkorDB, and returns new{" "}
          <code>Decision</code> nodes, <code>SUPERSEDES</code> edges to the ones they replace, <code>BECAUSE_OF</code> evidence and <code>ASSERTS</code> links from docs that restate them.
        </li>
        <li>
          <b className="text-white">Answer by traversal:</b> the agent picks from a fixed catalogue of parameterised Cypher tools (no model-written Cypher). Names are resolved against the graph first, so unknown things
          get &quot;not in the graph&quot;, never a guess.
        </li>
        <li>
          <b className="text-white">Verify:</b> every citation in the answer must be a key returned by a tool in this turn; anything else is stripped. If the LLM is down, Gary answers from the rows alone.
        </li>
        <li>
          <b className="text-white">Remember:</b> each answer becomes a <code>Finding</code> linked to its subjects and the decisions it relied on. When one of those decisions is superseded, the memory is flagged outdated.
        </li>
      </ol>
      <h4 className="mt-5 font-semibold text-white">Graph model</h4>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-5 text-[#c9d4ea]">{`(:Person)-[:MEMBER_OF|LEADS]->(:Team)-[:OWNS]->(:System|:Topic)
(:Person)-[:LEADS]->(:Project)-[:USES]->(:System)
(:Person)-[:AUTHORED|REVIEWED|ASSIGNED|ATTENDED]->(:Source)
(:Source)-[:MENTIONS|CHANGES|REFERENCES|REPLY_TO]->(...)
(:Person)-[:MADE]->(:Decision)-[:ABOUT]->(:Topic|:System|:Project)
(:Decision)-[:DECIDED_IN|BECAUSE_OF]->(:Source)
(:Decision)-[:SUPERSEDES]->(:Decision)
(:Doc {living:true})-[:ASSERTS]->(:Decision)
(:Person)-[:COLLABORATES {w}]->(:Person)        // derived
(:Finding)-[:ABOUT]->(...), (:Finding)-[:CITES]->(:Decision)`}</pre>
      <h4 className="mt-5 font-semibold text-white">Graph algorithms as tools</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <code>algo.SPpaths</code>: how any two things are connected
        </li>
        <li>
          <code>algo.betweenness</code>: knowledge brokers on the collaboration graph
        </li>
        <li>
          <code>algo.labelPropagation</code>: real teams versus the org chart
        </li>
        <li>
          <code>SUPERSEDES*1..6</code> variable-length paths: decision lineage and stale-doc detection
        </li>
        <li>Full-text indexes for entity resolution and search</li>
      </ul>
    </div>
  );
}
