"use client";

import { createScope, createTimeline, stagger, svg, type Scope } from "animejs";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { GaryFace } from "@/components/gary-face";

type Kind = "topic" | "decision" | "person" | "ticket" | "doc" | "message";
interface N {
  x: number;
  y: number;
  label: string;
  sub?: string;
  kind: Kind;
  old?: boolean;
  current?: boolean;
  stale?: boolean;
}

// The refund-policy story from the real Kitestring graph, laid out by hand.
const NODES: Record<string, N> = {
  feb: { x: 112, y: 122, label: "30 days, no questions", sub: "Feb 3 · Notion policy", kind: "decision", old: true },
  jun: { x: 318, y: 122, label: "30 days (monthly)", sub: "Jun 16 · Pricing council", kind: "decision", old: true },
  aug: { x: 522, y: 122, label: "14 days (monthly)", sub: "Aug 12 · #billing", kind: "decision", current: true },
  topic: { x: 296, y: 262, label: "Refund policy", kind: "topic" },
  maya: { x: 448, y: 214, label: "Maya Chen", sub: "CEO", kind: "person" },
  bill: { x: 560, y: 322, label: "BILL-212", sub: "refund abuse · $18k", kind: "ticket" },
  doc1: { x: 96, y: 322, label: "Refund Policy", sub: "Notion · Jordan", kind: "doc", stale: true },
  doc2: { x: 132, y: 392, label: "Support Playbook", sub: "Notion · Mei", kind: "doc", stale: true },
  doc3: { x: 178, y: 462, label: "Help Center FAQ", sub: "public · Mei", kind: "doc", stale: true },
};

const EDGES: { id: string; from: string; to: string; type: string; label?: string }[] = [
  { id: "a1", from: "feb", to: "topic", type: "ABOUT" },
  { id: "a2", from: "jun", to: "topic", type: "ABOUT" },
  { id: "a3", from: "aug", to: "topic", type: "ABOUT", label: "about" },
  { id: "s1", from: "aug", to: "jun", type: "SUPERSEDES", label: "supersedes" },
  { id: "s2", from: "jun", to: "feb", type: "SUPERSEDES", label: "supersedes" },
  { id: "m1", from: "maya", to: "aug", type: "MADE", label: "decided" },
  { id: "b1", from: "aug", to: "bill", type: "BECAUSE_OF", label: "because of" },
  { id: "d1", from: "doc1", to: "feb", type: "ASSERTS", label: "still asserts" },
  { id: "d2", from: "doc2", to: "feb", type: "ASSERTS" },
  { id: "d3", from: "doc3", to: "feb", type: "ASSERTS" },
];

const KIND_COLOR: Record<Kind, string> = {
  topic: "var(--amber)",
  decision: "var(--accent)",
  person: "var(--blue)",
  ticket: "var(--violet)",
  doc: "var(--muted)",
  message: "var(--green)",
};

const w = (n: N) => Math.max(n.label.length, (n.sub ?? "").length * 0.86) * 6.5 + 36;
const h = (n: N) => (n.sub ? 42 : 30);

function curve(a: N, b: N, bend = 0.12) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return `M${a.x} ${a.y} Q${mx - dy * bend} ${my + dx * bend} ${b.x} ${b.y}`;
}

export function HeroGraph() {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!root.current || reduce) return;
    // anime.js interpolates real colours, not var() strings, so resolve the theme tokens now (and again on theme change)
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const bad = css("--bad");
    const idle = css("--line-strong");
    const scope: Scope = createScope({ root: root.current }).add(() => {
      const tl = createTimeline({ loop: true, defaults: { ease: "outExpo", duration: 700 } });
      tl.set(".hg-node", { opacity: 0, scale: 0.6 })
        .set(".hg-q, .hg-answer, .hg-stale-tag", { opacity: 0, translateY: 10 })
        .set(".hg-ring", { opacity: 0, scale: 0.6 })
        .set(".hg-old", { opacity: 1 })
        .set(".hg-sup, .hg-asserts", { stroke: idle })
        .add(".hg-node", { opacity: 1, scale: 1, delay: stagger(70) })
        .add(svg.createDrawable(".hg-edge"), { draw: ["0 0", "0 1"], duration: 900, ease: "inOutQuad", delay: stagger(55) }, "-=500")
        .add(".hg-edge-label", { opacity: [0, 1], duration: 400 }, "-=300")
        .add(".hg-q", { opacity: 1, translateY: 0 }, "+=200")
        .add(".hg-pulse", { opacity: [0, 1, 1, 0], ...svg.createMotionPath("#hg-pulse-path"), duration: 1300, ease: "inOutSine" }, "+=300")
        .add(".hg-current", { scale: [1, 1.08, 1], duration: 600, ease: "outElastic" }, "-=200")
        .add(svg.createDrawable(".hg-strike"), { draw: ["0 0", "0 1"], duration: 500, delay: stagger(150) })
        .add(".hg-old", { opacity: 0.42, duration: 500 }, "<<")
        .add(".hg-sup", { stroke: bad, duration: 400 }, "<<")
        .add(".hg-asserts", { stroke: bad, duration: 400, delay: stagger(120) }, "+=250")
        .add(".hg-ring", { opacity: 1, scale: 1, duration: 600, ease: "outBack", delay: stagger(120) }, "<<")
        .add(".hg-stale-tag", { opacity: 1, translateY: 0, delay: stagger(120) }, "<<+=200")
        .add(".hg-answer", { opacity: 1, translateY: 0, duration: 800 }, "+=300")
        .add(".hg-fade", { opacity: [1, 1], duration: 3600 })
        .add(".hg-fade", { opacity: 0, duration: 600, ease: "inQuad" })
        .add(".hg-fade", { opacity: 1, duration: 1 });
    });
    return () => scope.revert();
  }, [reduce, resolvedTheme]);

  const pulseFrom = NODES.topic;
  const pulseTo = NODES.aug;

  return (
    <div ref={root} className="relative aspect-[640/520] w-full select-none">
      <div className="hg-fade absolute inset-0">
        <svg viewBox="0 0 640 520" className="absolute inset-0 h-full w-full overflow-visible" aria-label="Animated knowledge graph: the refund policy story">
          <defs>
            <marker id="hg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--muted)" />
            </marker>
          </defs>
          {EDGES.map((e) => {
            const a = NODES[e.from];
            const b = NODES[e.to];
            const cls = e.type === "SUPERSEDES" ? "hg-sup" : e.type === "ASSERTS" ? "hg-asserts" : "";
            return (
              <g key={e.id}>
                <path
                  className={`hg-edge ${cls}`}
                  d={curve(a, b, e.type === "SUPERSEDES" ? 0.18 : 0.1)}
                  fill="none"
                  stroke="var(--line-strong)"
                  strokeWidth={e.type === "SUPERSEDES" || e.type === "ASSERTS" ? 1.8 : 1.3}
                  strokeDasharray={e.type === "SUPERSEDES" ? "5 5" : undefined}
                />
                {e.label && (
                  <text
                    className="hg-edge-label"
                    x={(a.x + b.x) / 2 - (b.y - a.y) * 0.06}
                    y={(a.y + b.y) / 2 + (b.x - a.x) * 0.06 - 6}
                    textAnchor="middle"
                    style={{ fill: "var(--muted)", fontSize: 10, fontFamily: "var(--font-geist-mono)", letterSpacing: "0.04em" }}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          <path id="hg-pulse-path" d={curve(pulseFrom, pulseTo, -0.1)} fill="none" stroke="none" />

          {Object.entries(NODES).map(([k, n]) => (
            <g key={k} className={`hg-node ${n.old ? "hg-old" : ""} ${n.current ? "hg-current" : ""}`} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
              {n.stale && (
                <rect
                  className="hg-ring"
                  x={n.x - w(n) / 2 - 5}
                  y={n.y - h(n) / 2 - 5}
                  width={w(n) + 10}
                  height={h(n) + 10}
                  rx="16"
                  fill="none"
                  stroke="var(--bad)"
                  strokeWidth="1.6"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
              )}
              <rect
                x={n.x - w(n) / 2}
                y={n.y - h(n) / 2}
                width={w(n)}
                height={h(n)}
                rx="11"
                style={{
                  fill: n.current ? "var(--accent-soft)" : "var(--panel)",
                  stroke: n.current ? "var(--accent)" : "var(--line-strong)",
                  strokeWidth: n.current ? 1.8 : 1,
                }}
              />
              <circle cx={n.x - w(n) / 2 + 14} cy={n.y - (n.sub ? 7 : 0)} r="4" style={{ fill: KIND_COLOR[n.kind] }} />
              <text x={n.x - w(n) / 2 + 25} y={n.y + (n.sub ? -3 : 4)} style={{ fill: "var(--ink)", fontSize: 12.5, fontWeight: 600, fontFamily: "var(--font-geist-sans)" }}>
                {n.label}
              </text>
              {n.sub && (
                <text x={n.x - w(n) / 2 + 25} y={n.y + 13} style={{ fill: "var(--muted)", fontSize: 10.5, fontFamily: "var(--font-geist-sans)" }}>
                  {n.sub}
                </text>
              )}
              {n.old && <line className="hg-strike" x1={n.x - w(n) / 2 + 22} y1={n.y - 7} x2={n.x - w(n) / 2 + 26 + n.label.length * 6.6} y2={n.y - 7} stroke="var(--bad)" strokeWidth="1.6" />}
              {n.stale && (
                <g className="hg-stale-tag">
                  <rect x={n.x + w(n) / 2 - 8} y={n.y - h(n) / 2 - 12} width="44" height="17" rx="8.5" style={{ fill: "var(--bad)" }} />
                  <text x={n.x + w(n) / 2 + 14} y={n.y - h(n) / 2 + 0.5} textAnchor="middle" style={{ fill: "#fff", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em" }}>
                    STALE
                  </text>
                </g>
              )}
            </g>
          ))}
          <circle className="hg-pulse" r="6" cx="0" cy="0" style={{ fill: "var(--accent)", opacity: 0 }} />
        </svg>

        <div className="hg-q absolute top-[0%] left-[1%] max-w-[52%] rounded-2xl rounded-bl-sm border border-line bg-panel px-3 py-2 text-[12.5px] leading-snug text-ink shadow-[var(--shadow)] sm:text-[13px]">
          <span className="font-mono text-[10.5px] tracking-wide text-muted uppercase">Support asks</span>
          <br />
          Can a customer get a full refund after 20 days?
        </div>

        <div className="hg-answer absolute right-[1%] bottom-[2%] flex max-w-[60%] items-end gap-2">
          <div className="rounded-2xl rounded-br-sm border border-accent/40 bg-panel px-3 py-2 text-[12.5px] leading-snug text-ink shadow-[var(--shadow)] sm:text-[13px]">
            <b>No: 14 days</b> since Aug 12, decided by Maya in #billing because of BILL-212. <span className="text-bad">3 docs still say 30.</span>
          </div>
          <GaryFace size={46} state="happy" track={false} />
        </div>
      </div>
    </div>
  );
}
