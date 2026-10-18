"use client";

import { Fragment, type ReactNode } from "react";
import { KIND, shortLabel } from "./kinds";

export interface Cite {
  key: string;
  title: string;
  kind: string;
  at: number | null;
  url: string;
  text: string;
}

const TOKEN = /(\*\*[^*]+\*\*|\[[a-z_]+:[^\]\s]+\]|`[^`]+`)/g;

function inline(text: string, cites: Map<string, Cite>, onCite: (k: string) => void): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("[") && part.includes(":")) {
      const key = part.slice(1, -1);
      const c = cites.get(key);
      const kind = c?.kind ?? (key.startsWith("decision:") ? "Decision" : "Doc");
      return (
        <span key={i} className="chip" title={c?.title ?? key} onClick={() => onCite(key)}>
          <span style={{ color: KIND[kind]?.color }}>{KIND[kind]?.icon ?? "•"}</span>
          {shortLabel(key, c?.title)}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// Tiny markdown: paragraphs, bullets, bold, code and [source:key] citation chips.
export function Markdown({ text, cites, onCite }: { text: string; cites: Cite[]; onCite: (k: string) => void }) {
  const map = new Map(cites.map((c) => [c.key, c]));
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list}</ul>);
    list = [];
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      list.push(<li key={i}>{inline(bullet[1], map, onCite)}</li>);
      return;
    }
    flush();
    if (!line.trim()) return;
    const h = line.match(/^#+\s+(.*)$/);
    blocks.push(<p key={i}>{h ? <strong>{h[1]}</strong> : inline(line, map, onCite)}</p>);
  });
  flush();
  return <div className="md text-[14px] leading-relaxed">{blocks}</div>;
}
