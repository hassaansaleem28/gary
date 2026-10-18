"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { KIND } from "./kinds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any;

export interface GNode {
  id: string;
  name: string;
  label: string;
  status?: string | null;
  living?: boolean | null;
  origin?: string | null;
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

export function GraphView({ data, highlight, staleDocs, onNodeClick }: { data: { nodes: GNode[]; links: GLink[] }; highlight: string[]; staleDocs: Set<string>; onNodeClick?: (n: GNode) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(undefined);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [hover, setHover] = useState<string | null>(null);
  const hl = useMemo(() => new Set(highlight), [highlight]);

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
    if (!fg.current || !hl.size) return;
    const t = setTimeout(() => {
      fg.current?.zoomToFit(700, 80, (n: GNode) => hl.has(n.id));
      setTimeout(() => {
        if (fg.current && fg.current.zoom() > 3.2) fg.current.zoom(3.2, 400);
      }, 750);
    }, 250);
    return () => clearTimeout(t);
  }, [hl]);

  const neighbors = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    for (const l of data.links) {
      if (idOf(l.source) === hover) s.add(idOf(l.target));
      if (idOf(l.target) === hover) s.add(idOf(l.source));
    }
    return s;
  }, [hover, data.links]);

  const active = (id: string) => (neighbors ? neighbors.has(id) : hl.size ? hl.has(id) : true);

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
          if (!hl.size) fg.current?.zoomToFit(500, 40);
        }}
        nodeId="id"
        nodeRelSize={4}
        linkColor={(l: GLink) => {
          const on = active(idOf(l.source)) && active(idOf(l.target)) && (hl.size > 0 || neighbors);
          if (on) return l.type === "SUPERSEDES" ? "rgba(255,107,107,0.9)" : "rgba(245,185,66,0.75)";
          return "rgba(120,140,180,0.10)";
        }}
        linkWidth={(l: GLink) => (active(idOf(l.source)) && active(idOf(l.target)) && (hl.size > 0 || neighbors) ? 1.6 : 0.5)}
        linkDirectionalArrowLength={(l: GLink) => (active(idOf(l.source)) && active(idOf(l.target)) && hl.size ? 3 : 0)}
        linkDirectionalArrowRelPos={1}
        linkLineDash={(l: GLink) => (l.type === "SUPERSEDES" ? [3, 2] : null)}
        onNodeHover={(n: GNode | null) => setHover(n?.id ?? null)}
        onNodeClick={(n: GNode) => onNodeClick?.(n)}
        nodeCanvasObject={(n: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
          const on = active(n.id);
          const ent = ENTITY.has(n.label);
          const r = ent ? 5 : n.label === "Decision" ? 4 : 2.6;
          let color = KIND[n.label]?.color ?? "#888";
          if (n.label === "Decision" && n.status === "superseded") color = "#5b6475";
          if (n.origin === "gary") color = "#ff6b6b";
          ctx.globalAlpha = on ? 1 : 0.13;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          if (staleDocs.has(n.id)) {
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = "#ff6b6b";
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 2.2, 0, 2 * Math.PI);
            ctx.stroke();
          }
          if (hl.has(n.id) && hl.size) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r + 1, 0, 2 * Math.PI);
            ctx.stroke();
          }
          const showLabel = (on && (hl.size || neighbors) && (ent || n.label === "Decision" || scale > 2.2)) || (ent && scale > 1.6 && on);
          if (showLabel) {
            const text = n.name.length > 34 ? n.name.slice(0, 32) + "…" : n.name;
            const fs = 11 / scale;
            ctx.font = `${ent ? 600 : 400} ${fs}px var(--font-geist-sans), sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = on ? "rgba(231,235,243,0.95)" : "rgba(231,235,243,0.3)";
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
      <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[95%] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-panel/80 px-3 py-2 text-[11px] text-muted backdrop-blur">
        {["Person", "Team", "System", "Project", "Topic", "Decision", "Doc", "Finding"].map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: k === "Doc" ? KIND.Doc.color : KIND[k].color }} />
            {k === "Doc" ? "Record" : KIND[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#5b6475]" />
          Superseded
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-bad" />
          Stale doc
        </span>
      </div>
    </div>
  );
}
