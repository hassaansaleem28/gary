"use client";

import { useLenis } from "lenis/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { GaryFace } from "@/components/gary-face";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export const REPO = "https://github.com/hassaansaleem28/gary";
const LINKS = [
  { href: "#problem", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#graph", label: "Under the hood" },
];

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[22px] font-black tracking-tight text-ink", className)}>
      gary<span className="text-accent">.</span>
    </span>
  );
}

export function Nav() {
  const lenis = useLenis();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  const go = (href: string) => {
    setOpen(false);
    if (lenis) lenis.scrollTo(href, { offset: -72, duration: 1.4 });
    else document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5"
    >
      <nav
        className={cn(
          "mx-auto flex max-w-6xl items-center gap-3 rounded-2xl border px-3 py-2 transition-all duration-500 sm:px-4",
          scrolled ? "border-line bg-panel/75 shadow-[var(--shadow)] backdrop-blur-xl" : "border-transparent bg-transparent",
        )}
      >
        <button onClick={() => lenis?.scrollTo(0, { duration: 1.2 })} className="flex items-center gap-2" aria-label="Back to top">
          <GaryFace size={30} />
          <Wordmark />
        </button>

        <div className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <button key={l.href} onClick={() => go(l.href)} className="rounded-lg px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:bg-panel-2 hover:text-ink">
              {l.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <a href={REPO} target="_blank" rel="noreferrer" className="hidden items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink sm:flex">
            GitHub <ArrowUpRight size={14} />
          </a>
          <ThemeToggle />
          <Link
            href="/app"
            className="group hidden items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-bg transition-transform hover:-translate-y-0.5 sm:flex"
          >
            Ask Gary
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <button onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-full border border-line bg-panel md:hidden" aria-label="Menu">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="mx-auto mt-2 max-w-6xl rounded-2xl border border-line bg-panel/95 p-2 shadow-[var(--shadow)] backdrop-blur-xl md:hidden"
          >
            {LINKS.map((l, i) => (
              <motion.button
                key={l.href}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i }}
                onClick={() => go(l.href)}
                className="block w-full rounded-xl px-4 py-3 text-left text-[15px] text-ink hover:bg-panel-2"
              >
                {l.label}
              </motion.button>
            ))}
            <div className="mt-1 flex gap-2 p-2">
              <Link href="/app" className="flex-1 rounded-full bg-accent px-4 py-2.5 text-center text-[14px] font-semibold text-accent-ink">
                Ask Gary →
              </Link>
              <a href={REPO} target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-2.5 text-[14px] text-ink">
                GitHub
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
