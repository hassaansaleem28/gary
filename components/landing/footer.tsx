"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { GaryFace } from "@/components/gary-face";
import { REPO, Wordmark } from "./nav";

const COLS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Ask Gary", href: "/app" },
      { label: "Live feed", href: "/app?tab=live" },
      { label: "Catch me up", href: "/app?q=I'm Priya, back from 3 weeks off. What did I miss?" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Source code", href: REPO, external: true },
      { label: "Demo video", href: "/#demo" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.6fr_repeat(2,1fr)]">
        <div>
          <div className="flex items-center gap-2">
            <GaryFace size={38} />
            <Wordmark className="text-[26px]" />
          </div>
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted">
            Every company has a Gary: the one who knows <i>why</i>. This one lives in a FalkorDB graph and never leaves.
          </p>
          <p className="mt-4 font-mono text-[11px] tracking-wide text-muted uppercase">All company data is synthetic</p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <div className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{c.title}</div>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 text-[14px] text-ink-2 transition-colors hover:text-accent">
                      {l.label}
                      <ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  ) : (
                    <Link href={l.href} className="text-[14px] text-ink-2 transition-colors hover:text-accent">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-5 py-6 text-[12.5px] text-muted sm:flex-row sm:items-center">
          <span>© 2026 Gary</span>
          <span>Built for the Graph Hacks hackathon by Hassaan ❤️</span>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none overflow-hidden">
        <div className="font-display mx-auto -mb-[0.22em] max-w-6xl px-5 text-[22vw] leading-none text-ink/[0.045] select-none md:text-[15rem]">gary.</div>
      </div>
    </footer>
  );
}
