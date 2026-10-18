"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { KIND, resolveColor } from "./kinds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any;

export interface GNode {
  id: string;
  name: string;
  label: string;
  status?: string | null;
  living?: boolean | null;
  origin?: string | null;
  at?: number | null;
  supersededAt?: number | null;
  joined?: number | null;
  x?: number;
  y?: number;
}
export interface GLink {
  source: string | GNode;
  target: string | GNode;
  type: string;
}

const ENTITY = new Set(["Person", "Team", "System", "Project", "Topic"]);
const idOf = (v: string | GNode) => (typeof v === "string" ? v : v.id);

function usePalette() {
  const { resolvedTheme } = useTheme();
  const [p, setP] = useState<Record<string, string>>({});
  useEffect(() => {
    // read tokens after the theme class has been applied
    const t = setTimeout(() => {
      const kinds = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, resolveColor(v.color)]));
      setP({ ...kinds, ink: resolveColor("var(--ink)"), muted: resolveColor("var(--muted)"), line: resolveColor("var(--line-strong)"), accent: resolveColor("var(--accent)"), bad: resolveColor("var(--bad)"), bg: resolveColor("var(--bg)") });
    }, 30);
    return () => clearTimeout(t);
  }, [resolvedTheme]);
  return p;
}

export function GraphView({
  data,
  highlight,
  staleDocs,
  onNodeClick,
  fitOnHighlight = true,
  dimOthers = true,
  statusOf,
}: {
  data: { nodes: GNode[]; links: GLink[] };
  highlight: string[];
  staleDocs: Set<string>;
  onNodeClick?: (n: GNode) => void;
  /** zoom to the highlighted nodes when they change (off for the time machine, which highlights every tick) */
  fitOnHighlight?: boolean;
  /** dim everything that isn't highlighted (off for the time machine, which only pulses recent changes) */
  dimOthers?: boolean;
  /** override a node's status (the time machine shows decisions as they stood on a past date) */
  statusOf?: (n: GNode) => string | null | undefined;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(undefined);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [hover, setHover] = useState<string | null>(null);
  const hl = useMemo(() => new Set(highlight), [highlight]);
  const pal = usePalette();

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fg.current) return;
    fg.current.d3Force("charge")?.strength(-55);
    fg.current.d3Force("link")?.distance(38);
  }, [data]);

  useEffect(() => {
    if (!fg.current || !hl.size || !fitOnHighlight) return;
    const t = setTimeout(() => {
      fg.current?.zoomToFit(700, 80, (n: GNode) => hl.has(n.id));
      setTimeout(() => {
        if (fg.current && fg.current.zoom() > 3.2) fg.current.zoom(3.2, 400);
      }, 750);
    }, 250);
    return () => clearTimeout(t);
  }, [hl, fitOnHighlight]);

  const neighbors = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    for (const l of data.links) {
      if (idOf(l.source) === hover) s.add(idOf(l.target));
      if (idOf(l.target) === hover) s.add(idOf(l.source));
    }
    return s;
  }, [hover, data.links]);

  const active = (id: string) => (neighbors ? neighbors.has(id) : hl.size && dimOthers ? hl.has(id) : true);
  const lit = (l: GLink) =>
    neighbors ? neighbors.has(idOf(l.source)) && neighbors.has(idOf(l.target)) : hl.size > 0 && hl.has(idOf(l.source)) && hl.has(idOf(l.target));

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden">
      <ForceGraph2D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={120}
        onEngineStop={() => {
          if (!hl.size || !fitOnHighlight) fg.current?.zoomToFit(500, 40);
        }}
        nodeId="id"
        nodeRelSize={4}
        linkColor={(l: GLink) => (lit(l) ? (l.type === "SUPERSEDES" ? pal.bad : pal.accent) : pal.line)}
        linkWidth={(l: GLink) => (lit(l) ? 1.6 : 0.45)}
        linkDirectionalArrowLength={(l: GLink) => (lit(l) ? 3 : 0)}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(l: GLink) => (lit(l) ? 2 : 0)}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleColor={() => pal.accent}
        linkLineDash={(l: GLink) => (l.type === "SUPERSEDES" ? [3, 2] : null)}
        onNodeHover={(n: GNode | null) => setHover(n?.id ?? null)}
        onNodeClick={(n: GNode) => onNodeClick?.(n)}
        nodeCanvasObject={(n: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
          const on = active(n.id);
          const ent = ENTITY.has(n.label);
          const r = ent ? 5 : n.label === "Decision" ? 4 : 2.6;
          let color = pal[n.label] ?? pal.muted ?? "#888";
          if (n.label === "Decision" && (statusOf ? statusOf(n) : n.status) === "superseded") color = pal.muted;
          if (n.origin === "gary") color = pal.bad;
          ctx.globalAlpha = on ? 1 : 0.14;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          if (staleDocs.has(n.id)) {
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = pal.bad;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 2.2, 0, 2 * Math.PI);
            ctx.stroke();
          }
          if (hl.has(n.id) && hl.size) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = pal.ink;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 1, 0, 2 * Math.PI);
            ctx.stroke();
          }
          const showLabel = (on && (hl.size || neighbors) && (ent || n.label === "Decision" || scale > 2.2)) || (ent && scale > 1.6 && on);
          if (showLabel) {
            const text = n.name.length > 34 ? n.name.slice(0, 32) + "…" : n.name;
            ctx.font = `${ent ? 600 : 400} ${11 / scale}px system-ui, -apple-system, "Segoe UI", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = pal.ink;
            ctx.fillText(text, n.x!, n.y! + r + 1.5);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(n: GNode, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, 6, 0, 2 * Math.PI);
          ctx.fill();
        }}
        nodeLabel={(n: GNode) => `${KIND[n.label]?.label ?? n.label}: ${n.name}${n.status ? ` (${n.status})` : ""}`}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[95%] flex-wrap gap-x-3 gap-y-1 rounded-xl border border-line bg-panel/85 px-3 py-2 text-[11px] text-muted backdrop-blur">
        {["Person", "Team", "System", "Project", "Topic", "Decision", "Doc", "Finding"].map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full" style={{ background: KIND[k].color }} />
            {k === "Doc" ? "Record" : KIND[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-muted" />
          Superseded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border border-bad" />
          Stale doc
        </span>
      </div>
    </div>
  );
}
