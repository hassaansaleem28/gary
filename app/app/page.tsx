"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowUp, MessageSquare, Network, Radio, RotateCcw, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GaryFace, type GaryState } from "@/components/gary-face";
import { REPO } from "@/components/landing/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToolCards, Trail } from "@/components/workspace/cards";
import { GraphView, type GLink, type GNode } from "@/components/workspace/graph-view";
import { KIND, fmtDate } from "@/components/workspace/kinds";
import { LiveFeed } from "@/components/workspace/live-feed";
import { Markdown, type Cite } from "@/components/workspace/markdown";
import { cn } from "@/lib/utils";

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
  { area: "Expertise", q: "Who should I talk to about ledger-db?" },
  { area: "Why", q: "Why is usage-based pricing launching Dec 1?" },
  { area: "Current rules", q: "Are Friday deploys allowed?" },
  { area: "Risk", q: "What are our biggest knowledge risks right now?" },
  { area: "Catch up", q: "I'm Priya, back from 3 weeks off. What did I miss?" },
  { area: "Multi-hop", q: "How is Kai Johnson connected to the refund policy?" },
  { area: "Honesty", q: "Who owns the mobile app?" },
];

const ease = [0.22, 1, 0.36, 1] as const;

function faceFor(m: Msg | undefined, busy: boolean): GaryState {
  if (busy) return "thinking";
  if (!m?.answer) return "idle";
  const unknown = m.steps.length > 0 && m.steps.every((s) => s.outcome === "unknown_subject" || s.name === "search");
  if (m.answer.rebuilt?.length || unknown || /not in the company graph/i.test(m.text)) return "confused";
  return "happy";
}

export default function Page() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
  const params = useSearchParams();
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [stale, setStale] = useState<Set<string>>(new Set());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [tab, setTab] = useState<"graph" | "live" | "how">(params.get("tab") === "live" ? "live" : "graph");
  const [pane, setPane] = useState<"chat" | "panel">(params.get("tab") === "live" ? "panel" : "chat");
  const [compare, setCompare] = useState(true);
  const [drawer, setDrawer] = useState<any | null>(null);
  const [session] = useState(() => Math.random().toString(36).slice(2, 10));
  const cites = useRef(new Map<string, Cite>());
  const scroller = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

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
    if (msgs.length) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
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

  const lastGary = [...msgs].reverse().find((m) => m.role === "gary");
  const face = faceFor(lastGary, busy);

  const openCite = useCallback(async (key: string) => {
    const known = cites.current.get(key);
    setDrawer(known ? { ...known, loading: true } : { key, loading: true });
    const r = await fetch(`/api/node?key=${encodeURIComponent(key)}`).then((r) => r.json());
    setDrawer(r.error ? { key, title: key, text: "Not found in graph" } : r);
    setHighlight((h) => [...new Set([...h, key])]);
  }, []);

  const ask = useCallback(
    async (q: string, opts: { compare?: boolean } = {}) => {
      const withCompare = opts.compare ?? compare;
      if (!q.trim() || busy) return;
      setBusy(true);
      setInput("");
      setTab("graph");
      setPane("chat");
      const history = msgs.filter((m) => !m.pending).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      const uid = `u${Date.now()}`;
      const gid = `g${Date.now()}`;
      setMsgs((m) => [...m, { id: uid, role: "user", text: q, steps: [] }, { id: gid, role: "gary", text: "", steps: [], pending: true, compare: withCompare ? "loading" : undefined }]);
      const patch = (fn: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m) => (m.id === gid ? fn(m) : m)));
      setHighlight([]);

      if (withCompare)
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

  // deep links from the landing page: /app?q=...
  useEffect(() => {
    const q = params.get("q");
    if (q && !asked.current) {
      asked.current = true;
      ask(q);
    }
  }, [params, ask]);

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
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/80 px-3 backdrop-blur-xl sm:px-5">
        <Link href="/" className="flex items-center gap-2" aria-label="Gary home">
          <GaryFace size={30} state={face} />
          <span className="text-[20px] font-black tracking-tight text-ink">
            gary<span className="text-accent">.</span>
          </span>
        </Link>
        <span className="hidden h-5 w-px bg-line sm:block" />
        <span className="hidden items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-2 sm:flex">
          <span className="size-1.5 rounded-full bg-good" /> Kitestring <span className="text-muted">· synthetic</span>
        </span>
        <div className="ml-4 hidden gap-4 font-mono text-[11px] text-muted xl:flex">
          <span>
            <b className="text-ink">{stats.records}</b> records
          </span>
          <span>
            <b className="text-ink">{stats.decisions}</b> decisions
          </span>
          <span>
            <b className="text-ink">{stats.nodes}</b> nodes · <b className="text-ink">{stats.edges}</b> edges
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={reset} disabled={busy} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-40" title="Reset demo">
            <RotateCcw size={14} /> <span className="hidden md:inline">Reset demo</span>
          </button>
          <a href={REPO} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink" aria-label="GitHub">
            <GitHubMark />
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* mobile pane switcher */}
      <div className="flex shrink-0 gap-1 border-b border-line p-2 lg:hidden">
        {(
          [
            ["chat", "graph", "Chat", MessageSquare],
            ["panel", "graph", "Graph", Network],
            ["panel", "live", "Live feed", Radio],
          ] as const
        ).map(([p, t, label, Icon]) => {
          const on = pane === p && (p === "chat" || tab === t);
          return (
            <button
              key={label}
              onClick={() => {
                setPane(p);
                if (p === "panel") setTab(t);
              }}
              className={cn("relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px]", on ? "text-ink" : "text-muted")}
            >
              {on && <motion.span layoutId="pane-pill" className="absolute inset-0 rounded-lg bg-panel-2" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <Icon size={14} className="relative" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
        {/* chat */}
        <section className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", pane === "chat" ? "flex" : "hidden")}>
          <div ref={scroller} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
            {!msgs.length && <EmptyState onAsk={ask} />}
            <AnimatePresence initial={false}>
              {msgs.map((m) =>
                m.role === "user" ? (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] text-bg">{m.text}</div>
                  </motion.div>
                ) : (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
                    <GaryMessage m={m} onCite={openCite} onAsk={ask} />
                  </motion.div>
                ),
              )}
            </AnimatePresence>
          </div>

          {/* composer */}
          <div className="shrink-0 border-t border-line bg-bg/60 p-3 sm:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex items-center gap-2 rounded-2xl border border-line-strong bg-panel p-1.5 pl-4 shadow-[var(--shadow)] transition-colors focus-within:border-accent"
            >
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask how Kitestring works…" className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-ink outline-none placeholder:text-muted" />
              <button disabled={busy || !input.trim()} aria-label="Ask" className="grid size-9 place-items-center rounded-xl bg-accent text-accent-ink transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-35">
                <ArrowUp size={18} />
              </button>
            </form>
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 px-1 text-[12px] text-muted select-none">
              <button
                type="button"
                role="switch"
                aria-checked={compare}
                onClick={() => setCompare((c) => !c)}
                className={cn("relative h-4.5 w-8 rounded-full transition-colors", compare ? "bg-accent" : "bg-line-strong")}
              >
                <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className={cn("absolute top-0.5 size-3.5 rounded-full bg-white shadow", compare ? "right-0.5" : "left-0.5")} />
              </button>
              Compare with plain RAG (same records, no graph)
            </label>
          </div>
        </section>

        {/* right panel */}
        <section className={cn("min-h-0 flex-col lg:flex", pane === "panel" ? "flex" : "hidden")}>
          <div className="hidden items-center gap-1 border-b border-line px-3 py-2 lg:flex">
            {(
              [
                ["graph", "Company graph"],
                ["live", "Live feed"],
                ["how", "How it works"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={cn("relative rounded-lg px-3 py-1.5 text-[13px]", tab === k ? "text-ink" : "text-muted hover:text-ink")}>
                {tab === k && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-lg bg-panel-2" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
            {highlight.length > 0 && tab === "graph" && (
              <button onClick={() => setHighlight([])} className="ml-auto font-mono text-[11px] text-muted hover:text-ink">
                {highlight.length} nodes from the last answer · clear
              </button>
            )}
          </div>
          <div className="relative min-h-[60vh] flex-1 lg:min-h-0">
            {tab === "graph" && <GraphView data={graph} highlight={highlight} staleDocs={stale} onNodeClick={(n) => openCite(n.id)} />}
            {tab === "live" && <LiveFeed people={people} onIngested={() => loadGraph()} />}
            {tab === "how" && <HowItWorks />}
          </div>
        </section>
      </main>

      {/* source drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(null)}>
            <motion.aside
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.35, ease }}
              className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-panel p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-wider text-muted uppercase">
                  <span style={{ color: KIND[drawer.kind]?.color }}>{KIND[drawer.kind]?.icon}</span> {KIND[drawer.kind]?.label ?? drawer.kind} · {drawer.key}
                </span>
                <button onClick={() => setDrawer(null)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-ink" aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <h3 className="font-display mt-4 text-[28px] leading-tight text-ink">{drawer.title}</h3>
              <div className="mt-2 text-[12.5px] text-muted">
                {fmtDate(drawer.at)}
                {drawer.author ? ` · by ${drawer.author}` : ""}
                {drawer.status ? ` · ${drawer.status}` : ""}
              </div>
              <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2">{drawer.loading ? "…" : drawer.text}</p>
              {drawer.decidedIn && (
                <button className="chip mt-4" onClick={() => openCite(drawer.decidedIn)}>
                  decided in {drawer.decidedIn}
                </button>
              )}
              {drawer.url && <div className="mt-6 font-mono text-[11px] break-all text-muted">{drawer.url}</div>}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-xl pt-4 sm:pt-8">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease }}>
        <GaryFace size={84} />
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6, ease }} className="font-display mt-5 text-[40px] leading-[1.02] text-ink sm:text-[46px]">
        Hi, I&apos;m Gary. <span className="text-muted italic">I know why things are the way they are.</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease }} className="mt-4 text-[14.5px] leading-relaxed text-muted">
        I&apos;ve read Kitestring&apos;s Slack, Jira, Notion, meetings and GitHub into one FalkorDB graph. Ask me what&apos;s current, who decided it, who actually knows, or what you missed. I&apos;ll show you every step and
        source.
      </motion.p>
      <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.q}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.05, duration: 0.5, ease }}
            whileHover={{ y: -2 }}
            onClick={() => onAsk(s.q)}
            className="group rounded-2xl border border-line bg-panel p-3.5 text-left transition-colors hover:border-accent/60"
          >
            <div className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase group-hover:text-accent">{s.area}</div>
            <div className="mt-1 text-[13.5px] leading-snug text-ink">{s.q}</div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function GaryMessage({ m, onCite, onAsk }: { m: Msg; onCite: (k: string) => void; onAsk: (q: string, o?: { compare?: boolean }) => void }) {
  const state = faceFor(m, !!m.pending);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <GaryFace size={28} state={state} track={false} />
        <span className="font-semibold text-ink">Gary</span>
        {m.answer && (
          <>
            <span className="font-mono text-[10.5px]">{m.answer.model}</span>
            {m.answer.rebuilt?.length ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">model named {m.answer.rebuilt.join(", ")} (not in the graph) · rebuilt from graph rows</span>
            ) : m.answer.grounded ? (
              <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] text-good">✓ citations verified against the graph</span>
            ) : (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">stripped {m.answer.invalidCitations.length} unverified citation(s)</span>
            )}
          </>
        )}
      </div>

      {m.memories?.length ? (
        <div className="mb-3 rounded-2xl border border-line bg-panel-2 px-4 py-3 text-[12.5px]">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider text-muted uppercase">
            <Sparkles size={12} className="text-accent" /> Remembered from earlier
          </div>
          {m.memories.slice(0, 2).map((mem: any) => (
            <div key={mem.key} className="mt-1.5 text-ink-2">
              {mem.outdated && <span className="mr-1.5 rounded bg-bad px-1.5 py-px font-mono text-[9.5px] font-bold text-white">OUTDATED</span>}
              <span className={cn(mem.outdated && "text-muted line-through decoration-bad/60")}>{mem.text}</span>
            </div>
          ))}
        </div>
      ) : null}

      <Trail steps={m.steps} />
      {m.pending && !m.steps.length && <div className="pulse-dot ml-1 font-mono text-[12px] text-muted">reading the question, choosing tools…</div>}

      {m.text && (
        <div className="rounded-2xl rounded-tl-md border border-line bg-panel px-4 py-3 shadow-[var(--shadow)]">
          <Markdown text={m.text} cites={m.answer?.citations ?? []} onCite={onCite} />
        </div>
      )}
      {!m.pending && m.steps.map((s) => <ToolCards key={s.id} name={s.name} data={s.data} onCite={onCite} onAsk={onAsk} />)}

      {m.answer?.citations?.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <span className="mr-1 font-mono text-[10.5px] tracking-wider text-muted uppercase">Sources</span>
          {m.answer.citations.map((c) => (
            <button key={c.key} className="chip" onClick={() => onCite(c.key)} title={c.title}>
              <span style={{ color: KIND[c.kind]?.color }}>{KIND[c.kind]?.icon}</span>
              {c.title.length > 34 ? c.title.slice(0, 32) + "…" : c.title}
            </button>
          ))}
        </div>
      ) : null}

      {m.compare && (
        <div className="mt-3 rounded-2xl border border-dashed border-line-strong p-4 text-[13px]">
          <div className="mb-1.5 font-mono text-[10.5px] tracking-wider text-muted uppercase">Same question · plain chunk-retrieval RAG (no graph)</div>
          {m.compare === "loading" ? (
            <span className="pulse-dot text-muted">retrieving top documents…</span>
          ) : (
            <>
              <div className="text-ink-2">{m.compare.text}</div>
              <div className="mt-1.5 text-[11.5px] text-muted">retrieved: {m.compare.docs.map((d) => d.title).join(" · ") || "nothing"}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="h-full overflow-y-auto p-6 text-[13.5px] leading-relaxed text-ink-2">
      <h3 className="font-display text-[30px] leading-tight text-ink">How Gary works</h3>
      <ol className="mt-4 list-decimal space-y-2.5 pl-5 marker:text-accent">
        <li>
          <b className="text-ink">Ingest:</b> Slack, Jira, Notion/help center, meeting notes and GitHub PRs become <code>Source</code> nodes; authors, reviewers, assignees and attendees become edges. Mentions are linked using
          a vocabulary read <i>from the graph itself</i>.
        </li>
        <li>
          <b className="text-ink">Extract decisions with graph context:</b> the LLM sees the currently active decisions and writes <code>Decision</code> nodes, <code>SUPERSEDES</code>, <code>BECAUSE_OF</code> and{" "}
          <code>ASSERTS</code> edges.
        </li>
        <li>
          <b className="text-ink">Answer by traversal:</b> the agent picks from 11 parameterised Cypher tools. Names are resolved against the graph first, so unknown things get &quot;not in the graph&quot;, never a guess.
        </li>
        <li>
          <b className="text-ink">Verify:</b> citations must be keys returned this turn, and people/team names must exist in the graph, or the answer is rebuilt from graph rows.
        </li>
        <li>
          <b className="text-ink">Remember:</b> each answer becomes a <code>Finding</code> that cites the decisions it relied on, and goes outdated when they&apos;re superseded.
        </li>
      </ol>
      <h4 className="mt-6 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Graph model</h4>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-panel-2 p-4 font-mono text-[11px] leading-5 text-ink-2">{`(:Person)-[:MEMBER_OF|LEADS]->(:Team)-[:OWNS]->(:System|:Topic)
(:Person)-[:LEADS]->(:Project)-[:USES]->(:System)
(:Person)-[:AUTHORED|REVIEWED|ASSIGNED|ATTENDED]->(:Source)
(:Source)-[:MENTIONS|CHANGES|REFERENCES|REPLY_TO]->(...)
(:Person)-[:MADE]->(:Decision)-[:ABOUT]->(:Topic|:System|:Project)
(:Decision)-[:DECIDED_IN|BECAUSE_OF]->(:Source)
(:Decision)-[:SUPERSEDES]->(:Decision)
(:Doc {living:true})-[:ASSERTS]->(:Decision)
(:Person)-[:COLLABORATES {w}]->(:Person)        // derived
(:Finding)-[:ABOUT]->(...), (:Finding)-[:CITES]->(:Decision)`}</pre>
      <h4 className="mt-6 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Graph algorithms as tools</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-accent">
        <li>
          <code>algo.SPpaths</code>: how any two things are connected
        </li>
        <li>
          <code>algo.betweenness</code>: knowledge brokers on the collaboration graph
        </li>
        <li>
          <code>algo.labelPropagation</code>: real teams vs the org chart
        </li>
        <li>
          <code>SUPERSEDES*1..6</code>: decision lineage and stale-doc detection
        </li>
      </ul>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
