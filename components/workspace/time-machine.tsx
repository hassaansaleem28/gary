"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GraphView, type GLink, type GNode } from "./graph-view";

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const ease = [0.22, 1, 0.36, 1] as const;
const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const RECORD = new Set(["Message", "Ticket", "Doc", "Meeting", "PR", "Decision", "Finding"]);
const TOPICS: { key: string; label: string }[] = [
  { key: "topic:refund-policy", label: "Refund policy" },
  { key: "topic:release-process", label: "Friday deploys" },
  { key: "topic:data-retention", label: "Data retention" },
  { key: "project:usage-pricing", label: "Usage pricing" },
  { key: "project:atlas", label: "Project Atlas" },
];
const idOf = (v: string | GNode) => (typeof v === "string" ? v : v.id);

// The graph never forgets: superseded decisions keep their superseded_at, so any past day can be rebuilt.
export function TimeMachine({ graph, initial, onNodeClick }: { graph: { nodes: GNode[]; links: GLink[] }; initial?: number | null; onNodeClick?: (n: GNode) => void }) {
  // the timeline runs to the newest thing in the graph (memories and live posts are stamped "now")
  const end = useMemo(() => Math.max(START + 290 * DAY, ...graph.nodes.map((n) => n.at ?? 0)) + DAY, [graph.nodes]);
  const [t, setT] = useState(() => initial ?? START + 20 * DAY);
  const [playing, setPlaying] = useState(!initial);
  const [topic, setTopic] = useState(TOPICS[0].key);
  const raf = useRef<number | null>(null);

  // own copies of the nodes, so we can show each decision's status *as of t* without touching the live graph
  const clones = useMemo(() => {
    const nodes = graph.nodes.map((n) => ({ ...n, x: undefined, y: undefined }));
    // logic reads these plain id pairs; the renderer gets its own link objects (force-graph rewrites source/target in place)
    const links = graph.links.map((l) => ({ source: idOf(l.source), target: idOf(l.target), type: l.type }));
    return { nodes, links: links as { source: string; target: string; type: string }[], byId: new Map(nodes.map((n) => [n.id, n])) };
  }, [graph]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((cur) => {
        const next = cur + dt * 22 * (DAY / 1000); // ~22 days per second
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, end]);

  const visibleAt = (n: GNode, at: number) => (n.label === "Person" ? !n.joined || n.joined <= at : RECORD.has(n.label) ? !!n.at && n.at <= at : true);
  const activeAt = (n: GNode, at: number) => n.label === "Decision" && !!n.at && n.at <= at && !(n.supersededAt && n.supersededAt <= at);

  // visible set only changes at event boundaries; key the graph data on it so the layout isn't rebuilt every frame
  const visibleKey = clones.nodes.filter((n) => visibleAt(n, t)).map((n) => n.id).join("|");
  const data = useMemo(() => {
    const vis = new Set(visibleKey.split("|"));
    const nodes = clones.nodes.filter((n) => vis.has(n.id));
    const links: GLink[] = clones.links.filter((l) => vis.has(l.source) && vis.has(l.target)).map((l) => ({ ...l }));
    return { nodes, links };
  }, [visibleKey, clones]);


  const stale = useMemo(() => {
    const out = new Set<string>();
    for (const l of clones.links) {
      const [docId, decId] = l.type === "ASSERTS" ? [l.source, l.target] : l.type === "DECIDED_IN" ? [l.target, l.source] : [null, null];
      if (!docId || !decId) continue;
      const doc = clones.byId.get(docId);
      const dec = clones.byId.get(decId);
      if (!doc || !dec || doc.label !== "Doc" || !doc.living || !visibleAt(doc, t)) continue;
      if (dec.supersededAt && dec.supersededAt <= t) out.add(docId);
    }
    // a doc that also asserts a decision still in force isn't stale
    for (const l of clones.links) if (l.type === "ASSERTS" && out.has(l.source) && activeAt(clones.byId.get(l.target)!, t)) out.delete(l.source);
    return out;
  }, [t, clones]);

  const recent = useMemo(() => data.nodes.filter((n) => n.at && n.at <= t && n.at > t - 12 * DAY).map((n) => n.id), [data.nodes, t]);

  // events for the scrubber ticks and the ticker
  const events = useMemo(() => {
    const ev: { at: number; kind: "decided" | "superseded"; text: string; key: string }[] = [];
    for (const n of clones.nodes) {
      if (n.label !== "Decision" || !n.at) continue;
      ev.push({ at: n.at, kind: "decided", text: n.name, key: n.id + "+" });
      if (n.supersededAt) ev.push({ at: n.supersededAt, kind: "superseded", text: n.name, key: n.id + "-" });
    }
    return ev.sort((a, b) => a.at - b.at);
  }, [clones]);
  const past = events.filter((e) => e.at <= t).slice(-3).reverse();

  // what Kitestring believed about the chosen topic at t
  const belief = useMemo(() => {
    const uses = new Set(clones.links.filter((l) => l.type === "USES" && l.source === topic).map((l) => l.target));
    const about = clones.links.filter((l) => l.type === "ABOUT" && (l.target === topic || uses.has(l.target))).map((l) => clones.byId.get(l.source)!);
    const inForce = about.filter((d) => d && activeAt(d, t)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    const decIds = new Set(about.map((d) => d.id));
    const staleDocs = [...stale].filter((doc) => clones.links.some((l) => ((l.type === "ASSERTS" && l.source === doc) || (l.type === "DECIDED_IN" && l.target === doc)) && decIds.has(l.type === "ASSERTS" ? l.target : l.source)));
    return { inForce, staleDocs: staleDocs.map((id) => clones.byId.get(id)!) };
  }, [topic, t, clones, stale]);

  const pct = ((t - START) / (end - START)) * 100;

  return (
    <div className="flex h-full flex-col">
      {/* controls */}
      <div className="border-b border-line px-4 pt-3 pb-4 sm:px-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <div>
            <div className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">Kitestring as of</div>
            <div className="font-display text-[34px] leading-none text-ink tabular-nums">{fmt(t)}</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => {
                if (t >= end - DAY) setT(START);
                setPlaying((p) => !p);
              }}
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Pause" : t >= end - DAY ? "Replay" : "Play"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setT(end);
              }}
              className="grid size-9 place-items-center rounded-full border border-line text-muted hover:text-ink"
              aria-label="Jump to today"
              title="Jump to today"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <div className="relative mt-4 h-8">
          <div className="absolute inset-x-0 top-3.5 h-1 rounded-full bg-panel-2" />
          <div className="absolute top-3.5 left-0 h-1 rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
          {events.map((e) => (
            <span
              key={e.key}
              title={`${fmt(e.at)} · ${e.kind === "superseded" ? "superseded: " : ""}${e.text}`}
              className={cn("absolute top-2 h-3.5 w-[3px] -translate-x-1/2 rounded-full", e.kind === "superseded" ? "bg-bad" : "bg-accent", e.at > t && "opacity-35")}
              style={{ left: `${((e.at - START) / (end - START)) * 100}%` }}
            />
          ))}
          <div className="pointer-events-none absolute top-1 size-5 -translate-x-1/2 rounded-full border-2 border-accent bg-panel shadow-[var(--shadow)]" style={{ left: `${pct}%` }} />
          <input
            type="range"
            min={START}
            max={end}
            step={DAY / 4}
            value={t}
            onChange={(e) => {
              setPlaying(false);
              setT(Number(e.target.value));
            }}
            aria-label="Date"
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>Jan 2026</span>
          <span>today</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <GraphView
          data={data}
          highlight={recent}
          staleDocs={stale}
          onNodeClick={onNodeClick}
          fitOnHighlight={false}
          dimOthers={false}
          statusOf={(n) => (n.label === "Decision" ? (activeAt(n, t) ? "active" : "superseded") : n.status)}
        />

        {/* belief card */}
        <div className="absolute top-3 left-3 w-[min(360px,calc(100%-24px))] rounded-2xl border border-line bg-panel/90 p-3.5 shadow-[var(--shadow)] backdrop-blur-md">
          <div className="flex flex-wrap gap-1">
            {TOPICS.map((tp) => (
              <button
                key={tp.key}
                onClick={() => setTopic(tp.key)}
                className={cn("relative rounded-full px-2.5 py-1 text-[11.5px]", topic === tp.key ? "text-accent-ink" : "text-muted hover:text-ink")}
              >
                {topic === tp.key && <motion.span layoutId="tm-topic" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                <span className="relative">{tp.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">What Kitestring believed</div>
          <div className="mt-1.5 min-h-[44px] space-y-1.5">
            <AnimatePresence mode="popLayout" initial={false}>
              {belief.inForce.length ? (
                belief.inForce.map((d) => (
                  <motion.div
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: -12, filter: "blur(4px)", textDecoration: "line-through" }}
                    transition={{ duration: 0.45, ease }}
                    className="text-[13.5px] leading-snug text-ink"
                  >
                    {d.name}
                    <span className="ml-1.5 font-mono text-[10.5px] text-muted">since {d.at ? fmt(d.at) : "?"}</span>
                  </motion.div>
                ))
              ) : (
                <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[13px] text-muted">
                  Nothing decided yet.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {belief.staleDocs.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {belief.staleDocs.map((d) => (
                    <span key={d.id} className="rounded-full border border-bad/40 bg-bad-soft px-2 py-0.5 text-[11px] text-bad">
                      ⚠ stale · {d.name}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* change ticker */}
        <div className="absolute top-3 right-3 hidden w-[260px] space-y-1.5 xl:block">
          <AnimatePresence initial={false}>
            {past.slice(0, 2).map((e) => (
              <motion.div
                key={e.key}
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="rounded-xl border border-line bg-panel/90 px-3 py-2 text-[11.5px] backdrop-blur-md"
              >
                <div className={cn("font-mono text-[10px] tracking-wide uppercase", e.kind === "superseded" ? "text-bad" : "text-accent")}>
                  {fmt(e.at)} · {e.kind === "superseded" ? "superseded" : "decided"}
                </div>
                <div className={cn("mt-0.5 leading-snug text-ink-2", e.kind === "superseded" && "line-through decoration-bad/60")}>{e.text}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
