"use client";

/* eslint-disable react-hooks/refs -- the beam diagram passes ref objects as props; nothing reads .current during render */

import { animate, splitText, stagger, svg } from "animejs";
import { useLenis } from "lenis/react";
import { ArrowRight, CalendarDays, FileText, GitPullRequest, MessageSquare, Network, Play, Ticket } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { GaryFace, type GaryState } from "@/components/gary-face";
import { HeroGraph } from "@/components/hero-graph";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { Backlight } from "@/components/ui/backlight";
import { Marquee } from "@/components/ui/marquee";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.8, delay, ease }} className={className}>
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-mono text-[11.5px] tracking-[0.16em] text-accent uppercase">{children}</div>;
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <Reveal className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display mt-3 text-[40px] leading-[1.02] text-ink sm:text-[56px]">{title}</h2>
      {sub && <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">{sub}</p>}
    </Reveal>
  );
}

const ask = (q: string) => `/app?q=${encodeURIComponent(q)}`;

/* ───────────────────────────── hero ───────────────────────────── */

export function Hero() {
  const h1 = useRef<HTMLHeadingElement>(null);
  const squiggle = useRef<SVGPathElement>(null);
  const reduce = useReducedMotion();
  const lenis = useLenis();

  useEffect(() => {
    if (!h1.current || reduce) return;
    const split = splitText(h1.current, { words: { wrap: "clip" } });
    animate(split.words, { y: ["110%", "0%"], duration: 1100, ease: "outExpo", delay: stagger(70, { start: 150 }) });
    if (squiggle.current) animate(svg.createDrawable(squiggle.current), { draw: ["0 0", "0 1"], duration: 900, delay: 1100, ease: "inOutQuad" });
    return () => {
      split.revert();
    };
  }, [reduce]);

  return (
    <section className="relative overflow-hidden pt-28 pb-10 sm:pt-36">
      <div aria-hidden className="hairline-grid absolute inset-0 -z-10 opacity-70" />
      <div aria-hidden className="absolute top-20 left-1/2 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1fr_1.12fr]">
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-[12px] text-muted backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-good" />
            </span>
            Live on FalkorDB · Company Brain agent
          </motion.div>

          <h1 ref={h1} className="font-display mt-6 text-[54px] leading-[0.95] text-ink sm:text-[76px] lg:text-[84px]">
            Every company has a{" "}
            <span className="relative inline-block italic text-accent">
              Gary.
              <svg aria-hidden viewBox="0 0 200 20" className="absolute -bottom-2 left-0 h-[0.28em] w-full overflow-visible" preserveAspectRatio="none">
                <path ref={squiggle} d="M2 12 C 40 2, 70 20, 104 9 S 168 4, 198 12" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            </span>
            <br />
            <span className="text-ink-2">Ours never leaves.</span>
          </h1>

          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.7, ease }} className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-muted">
            The one person who knows <i className="text-ink">why</i> the refund window is 14 days, who to ask about the ledger, and which docs quietly went stale. Gary reads your Slack, Jira, Notion,
            meetings and GitHub into one <b className="text-ink">FalkorDB</b> graph and answers by walking it, with every source shown.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.85, ease }} className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/app" className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-semibold text-accent-ink shadow-[0_10px_30px_-10px_var(--accent)] transition-transform hover:-translate-y-0.5">
              Ask Gary
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <button onClick={() => lenis?.scrollTo("#demo", { offset: -80, duration: 1.4 })} className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-5 py-3 text-[15px] text-ink backdrop-blur transition-colors hover:border-line-strong">
              <Play size={15} className="text-accent" /> Watch the demo
            </button>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }} className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px] text-muted">
            <span>5 sources → 1 graph</span>
            <span>12 Cypher tools</span>
            <span>~20 ms graph time / answer</span>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1, delay: 0.3, ease }} className="relative">
          <div className="absolute -top-10 -right-3 z-10 hidden sm:block">
            <GaryFace size={92} />
          </div>
          <div className="relative rounded-[28px] border border-line bg-panel/70 p-3 shadow-[var(--shadow)] backdrop-blur-sm sm:p-5">
            <div className="mb-1 flex items-center gap-2 px-1 font-mono text-[10.5px] tracking-wider text-muted uppercase">
              <span className="size-1.5 rounded-full bg-accent" /> kitestring graph · refund policy
            </div>
            <HeroGraph />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────── marquee ─────────────────────────── */

const QUESTIONS = [
  "Can a customer get a full refund after 20 days?",
  "Who should I talk to about ledger-db?",
  "Are Friday deploys allowed?",
  "Why is usage-based pricing launching Dec 1?",
  "What are our biggest knowledge risks?",
  "I'm Priya, back from 3 weeks off. What did I miss?",
  "Who decided our API rate limits, and why?",
  "How do people actually work together here?",
  "How is Kai Johnson connected to the refund policy?",
  "What was our refund policy on July 1?",
  "Who owns the mobile app?",
];

export function QuestionsMarquee() {
  return (
    <section className="relative py-8">
      <div className="mask-[linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <Marquee pauseOnHover className="[--duration:55s] [--gap:0.75rem]">
          {QUESTIONS.slice(0, 5).map((q) => (
            <QuestionChip key={q} q={q} />
          ))}
        </Marquee>
        <Marquee pauseOnHover reverse className="[--duration:60s] [--gap:0.75rem]">
          {QUESTIONS.slice(5).map((q) => (
            <QuestionChip key={q} q={q} />
          ))}
        </Marquee>
      </div>
    </section>
  );
}

function QuestionChip({ q }: { q: string }) {
  return (
    <Link href={ask(q)} className="group flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-[14px] whitespace-nowrap text-ink-2 transition-colors hover:border-accent hover:text-ink">
      <span className="text-accent">“</span>
      {q}
      <ArrowRight size={14} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}

/* ─────────────────────────── problem ─────────────────────────── */

export function Problem() {
  return (
    <section id="problem" className="mx-auto max-w-6xl px-5 py-24">
      <SectionTitle
        eyebrow="The problem"
        title={
          <>
            Your docs are lying. <span className="text-muted italic">Your chatbot believes them.</span>
          </>
        }
        sub="A Notion page from March says 30 days. A Slack reply from August changed it to 14. Search finds the page with the right words; it has no idea one replaced the other. Most teams have watched an AI tool confidently quote an outdated doc."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-3xl border border-line bg-panel p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-wider text-muted uppercase">Plain RAG · same records, no graph</span>
              <span className="rounded-full bg-bad-soft px-2.5 py-0.5 text-[11px] font-semibold text-bad">wrong</span>
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-muted">
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[10.5px] tracking-wide uppercase">
                <FileText size={12} /> retrieved · Pricing Council, June
              </div>
              “…monthly plans keep a <b className="text-ink">30-day full refund window</b>…”
            </div>
            <div className="mt-4 flex gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-panel-2 font-mono text-[11px] text-muted">AI</div>
              <p className="rounded-2xl rounded-tl-sm bg-panel-2 px-4 py-3 text-[15px] text-ink">Yes. Monthly plans have a 30-day full-refund window, so day 20 qualifies.</p>
            </div>
            <p className="mt-5 text-[13px] text-muted">Superseded on Aug 12. Support would refund the wrong customers, and nobody would know why.</p>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="h-full rounded-3xl border border-accent/35 bg-panel p-6 shadow-[0_30px_80px_-40px_var(--accent)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-wider text-muted uppercase">Gary · FalkorDB graph</span>
              <span className="rounded-full bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good">correct + sourced</span>
            </div>
            <LineageMini />
            <div className="mt-4 flex gap-3">
              <GaryFace size={34} state="happy" track={false} />
              <p className="rounded-2xl rounded-tl-sm bg-accent-soft px-4 py-3 text-[15px] text-ink">
                <b>No: 14 days</b> since Aug 12, decided by Maya because of BILL-212. 3 docs still say 30 days.
                <span className="text-accent"> Fix them?</span>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LineageMini() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const rows = [
    { t: "14 days (monthly) · Aug 12 · #billing", current: true },
    { t: "30 days (monthly) · Jun 16 · Pricing council" },
    { t: "30 days, no questions · Feb 3 · Notion" },
  ];
  return (
    <div ref={ref} className="mt-5 space-y-2">
      {rows.map((r, i) => (
        <motion.div
          key={r.t}
          initial={{ opacity: 0, x: -10 }}
          animate={inView ? { opacity: r.current ? 1 : 0.55, x: 0 } : {}}
          transition={{ delay: 0.15 * i + 0.2, duration: 0.6, ease }}
          className={cn("relative flex items-center gap-2 rounded-xl border px-3 py-2 text-[13.5px]", r.current ? "border-good/50 bg-good-soft text-ink" : "border-line text-muted")}
        >
          <span className={cn("rounded px-1.5 font-mono text-[9.5px] font-bold tracking-wide", r.current ? "bg-good text-white" : "bg-panel-2")}>{r.current ? "CURRENT" : "SUPERSEDED"}</span>
          <span className="relative">
            {r.t}
            {!r.current && (
              <motion.span
                className="absolute top-1/2 left-0 h-[1.5px] bg-bad"
                initial={{ width: 0 }}
                animate={inView ? { width: "100%" } : {}}
                transition={{ delay: 0.9 + i * 0.2, duration: 0.6, ease }}
              />
            )}
          </span>
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.5 }} className="flex flex-wrap gap-1.5 pt-1">
        {["Refund Policy", "Support Playbook", "Help Center FAQ"].map((d) => (
          <span key={d} className="rounded-full border border-bad/40 bg-bad-soft px-2.5 py-0.5 text-[11.5px] text-bad">
            ⚠ stale · {d}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ─────────────────────────── how it works ─────────────────────────── */

const Circle = forwardRef<HTMLDivElement, { className?: string; children: ReactNode; label?: string }>(({ className, children, label }, ref) => (
  <div className="flex flex-col items-center gap-1.5">
    <div ref={ref} className={cn("z-10 grid size-12 place-items-center rounded-2xl border border-line bg-panel text-ink shadow-[var(--shadow)]", className)}>
      {children}
    </div>
    {label && <span className="font-mono text-[10.5px] tracking-wide text-muted">{label}</span>}
  </div>
));
Circle.displayName = "Circle";

export function HowItWorks() {
  const box = useRef<HTMLDivElement>(null);
  const src = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const graph = useRef<HTMLDivElement>(null);
  const gary = useRef<HTMLDivElement>(null);
  const sources = [
    { icon: <MessageSquare size={20} />, label: "Slack" },
    { icon: <Ticket size={20} />, label: "Jira" },
    { icon: <FileText size={20} />, label: "Notion" },
    { icon: <CalendarDays size={20} />, label: "Meetings" },
    { icon: <GitPullRequest size={20} />, label: "GitHub" },
  ];
  const steps = [
    { n: "01", t: "Ingest", d: "Every record becomes a node. Authors, reviewers, assignees and attendees become edges. Threads stay threads." },
    { n: "02", t: "Link", d: "People, systems, projects and topics are matched using a vocabulary read from the graph itself, so the graph teaches the parser." },
    { n: "03", t: "Decide", d: "An LLM extracts decisions while seeing what the graph already believes, writing SUPERSEDES, BECAUSE_OF and ASSERTS edges." },
    { n: "04", t: "Answer", d: "The agent picks from 12 fixed Cypher tools, never writes Cypher, and every citation and name is verified against the graph." },
  ];
  const accent = "var(--accent)";
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-24">
      <SectionTitle eyebrow="How it works" title={<>Five sources. One graph. <span className="italic text-accent">One Gary.</span></>} sub="Gary doesn't search your documents. It reads them once, turns them into a graph of who decided what, why, and what replaced it, and then answers by walking that graph." />
      <Reveal className="mt-14">
        <div ref={box} className="relative flex items-center justify-between gap-6 overflow-hidden rounded-3xl border border-line bg-panel/60 px-6 py-10 sm:px-14">
          <div className="flex flex-col gap-4">
            {sources.map((s, i) => (
              <Circle key={s.label} ref={src[i]} label={s.label}>
                {s.icon}
              </Circle>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2">
            <div ref={graph} className="z-10 grid size-24 place-items-center rounded-[28px] border border-accent/40 bg-panel shadow-[0_20px_60px_-25px_var(--accent)] sm:size-28">
              <Network size={40} className="text-accent" />
            </div>
            <span className="font-mono text-[11px] tracking-wide text-muted">FalkorDB graph</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div ref={gary} className="z-10">
              <GaryFace size={88} />
            </div>
            <span className="font-mono text-[11px] tracking-wide text-muted">Gary</span>
          </div>
          {src.map((r, i) => (
            <AnimatedBeam key={i} containerRef={box} fromRef={r} toRef={graph} curvature={(2 - i) * 28} duration={4 + i * 0.4} delay={i * 0.35} pathColor="var(--line-strong)" pathOpacity={1} gradientStartColor={accent} gradientStopColor="#ffb86b" />
          ))}
          <AnimatedBeam containerRef={box} fromRef={graph} toRef={gary} duration={3} pathColor="var(--line-strong)" pathOpacity={1} gradientStartColor={accent} gradientStopColor="#ffb86b" />
        </div>
      </Reveal>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.08}>
            <div className="h-full rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-strong">
              <div className="font-mono text-[12px] text-accent">{s.n}</div>
              <div className="mt-2 text-[18px] font-semibold text-ink">{s.t}</div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── features (bento) ─────────────────────────── */

function Tile({ className, title, body, children, href }: { className?: string; title: string; body: string; children: ReactNode; href?: string }) {
  const inner = (
    <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className={cn("group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-panel p-5 transition-colors hover:border-line-strong", className)}>
      <div className="relative min-h-[150px] flex-1">{children}</div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-[17px] font-semibold text-ink">
          {title}
          {href && <ArrowRight size={16} className="text-muted transition-all group-hover:translate-x-1 group-hover:text-accent" />}
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{body}</p>
      </div>
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function useInViewOnce<T extends Element>() {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return [ref, inView] as const;
}

function ExpertBars() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const rows = [
    { n: "Tomasz Novak", v: 55, away: true },
    { n: "Omar Haddad", v: 25 },
    { n: "Hana Kim", v: 13 },
  ];
  return (
    <div ref={ref} className="space-y-3 pt-2">
      {rows.map((r, i) => (
        <div key={r.n}>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-ink">
              {r.n}
              {r.away && <span className="ml-1.5 rounded bg-bad-soft px-1.5 font-mono text-[9.5px] font-bold text-bad">AWAY NOV 2</span>}
            </span>
            <span className="font-mono text-muted">{r.v}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-[#ffb86b]" initial={{ width: 0 }} animate={inView ? { width: `${r.v}%` } : {}} transition={{ delay: 0.15 * i, duration: 1.1, ease }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Radar() {
  return (
    <div className="relative mx-auto aspect-square h-[150px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0">
        {[45, 32, 19].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="0.6" />
        ))}
        <line x1="5" y1="50" x2="95" y2="50" stroke="var(--line)" strokeWidth="0.5" />
        <line x1="50" y1="5" x2="50" y2="95" stroke="var(--line)" strokeWidth="0.5" />
      </svg>
      <motion.div
        className="absolute inset-[5%] rounded-full"
        style={{ background: "conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, var(--accent) 45%, transparent) 50deg, transparent 60deg)" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      {[
        { x: 68, y: 30, l: "ledger-db", hot: true },
        { x: 30, y: 62, l: "auth-service" },
        { x: 60, y: 70, l: "warehouse" },
      ].map((b, i) => (
        <div key={b.l} className="absolute" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
          <motion.span
            className={cn("block size-2.5 -translate-1/2 rounded-full", b.hot ? "bg-bad" : "bg-accent")}
            animate={{ scale: [1, 1.8, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.5 }}
          />
          <span className="absolute top-1 left-2 font-mono text-[9.5px] whitespace-nowrap text-muted">{b.l}</span>
        </div>
      ))}
    </div>
  );
}

function MemoryFlip() {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setOutdated((o) => !o), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pt-2 [perspective:800px]">
      <motion.div animate={{ rotateX: outdated ? 360 : 0 }} transition={{ duration: 0.7, ease }} className="rounded-2xl border border-line bg-panel-2 p-3 text-[12.5px]">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-muted uppercase">
          🧠 remembered · Oct 18
          {outdated && <span className="rounded bg-bad px-1.5 font-bold text-white">outdated</span>}
        </div>
        <p className={cn("mt-1 text-ink transition-all", outdated && "text-muted line-through decoration-bad")}>Refund window for monthly plans is 14 days.</p>
        {outdated && <p className="mt-1 text-[11.5px] text-accent">↳ the decision it cited was just superseded by the CEO in #billing</p>}
      </motion.div>
    </div>
  );
}

function LiveFeedMini() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} className="space-y-2 pt-1 text-[12.5px]">
      <motion.div initial={{ opacity: 0, x: 30 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.6, ease }} className="rounded-2xl border border-line bg-panel-2 p-3">
        <span className="font-semibold text-ink">@maya</span> <span className="text-muted">in #billing</span>
        <p className="mt-0.5 text-ink-2">Refunds go back to 30 days for customers older than 90 days.</p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.6 }} className="font-mono text-[11px] text-good">
        + Decision extracted against the graph
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.9 }} className="font-mono text-[11px] text-accent">
        ↳ SUPERSEDES “14 days (Aug 12)”
      </motion.div>
    </div>
  );
}

function HonestMini() {
  const [state, setState] = useState<GaryState>("thinking");
  useEffect(() => {
    const t = setInterval(() => setState((s) => (s === "thinking" ? "confused" : "thinking")), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-4 pt-2">
      <GaryFace size={72} state={state} track={false} />
      <div className="text-[13px]">
        <div className="rounded-2xl rounded-bl-sm border border-line bg-panel-2 px-3 py-2 text-ink-2">Who owns the mobile app?</div>
        <motion.div key={state} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 font-mono text-[11.5px] text-muted">
          {state === "thinking" ? "resolving “mobile app” against the graph…" : "not in the company graph: no guessing"}
        </motion.div>
      </div>
    </div>
  );
}

function TicketsMini() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const t = [
    ["GARY-1", "Refund Policy", "Jordan Lee"],
    ["GARY-2", "Support Playbook", "Mei Tanaka"],
    ["GARY-3", "Help Center FAQ", "Mei Tanaka"],
  ];
  return (
    <div ref={ref} className="space-y-1.5 pt-1">
      {t.map((x, i) => (
        <motion.div key={x[0]} initial={{ opacity: 0, scale: 0.9 }} animate={inView ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 0.2 * i, type: "spring", stiffness: 300, damping: 20 }} className="flex items-center gap-2 rounded-xl border border-good/30 bg-good-soft px-3 py-1.5 text-[12.5px]">
          <span className="font-mono text-[11px] font-semibold text-good">{x[0]}</span>
          <span className="truncate text-ink">{x[1]}</span>
          <span className="ml-auto text-[11.5px] whitespace-nowrap text-muted">→ {x[2]}</span>
        </motion.div>
      ))}
    </div>
  );
}

const TM_PHASES = [
  { date: "3 Feb 2026", pct: 8, belief: ["Full refund within 30 days, no questions asked"], stale: 0 },
  { date: "16 Jun 2026", pct: 50, belief: ["Monthly plans: 30-day full refund", "Annual plans: prorated refunds"], stale: 3 },
  { date: "12 Aug 2026", pct: 72, belief: ["Monthly plans: 14 days", "Annual plans: prorated refunds"], stale: 3 },
];

function TimeMachineMini() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % TM_PHASES.length), 2300);
    return () => clearInterval(t);
  }, []);
  const ph = TM_PHASES[i];
  return (
    <div className="grid h-full gap-5 pt-1 md:grid-cols-[1.2fr_1fr] md:items-center">
      <div>
        <div className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">Kitestring as of</div>
        <AnimatePresence mode="wait">
          <motion.div key={ph.date} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="font-display text-[36px] leading-none text-ink">
            {ph.date}
          </motion.div>
        </AnimatePresence>
        <div className="relative mt-5 h-6">
          <div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-panel-2" />
          <motion.div className="absolute top-2.5 left-0 h-1 rounded-full bg-accent/70" animate={{ width: `${ph.pct}%` }} transition={{ duration: 0.9, ease }} />
          {[8, 50, 72].map((p, k) => (
            <span key={p} className={cn("absolute top-1 h-4 w-[3px] -translate-x-1/2 rounded-full", k === 0 ? "bg-accent" : "bg-bad")} style={{ left: `${p}%` }} />
          ))}
          <motion.span className="absolute top-0 size-5 -translate-x-1/2 rounded-full border-2 border-accent bg-panel" animate={{ left: `${ph.pct}%` }} transition={{ duration: 0.9, ease }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>Jan</span>
          <span>today</span>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-panel-2 p-4">
        <div className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">What Kitestring believed about refunds</div>
        <div className="mt-2 min-h-[52px] space-y-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {ph.belief.map((b) => (
              <motion.div key={b} layout initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: -10, filter: "blur(4px)" }} transition={{ duration: 0.4 }} className="text-[14px] text-ink">
                {b}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {["Refund Policy", "Support Playbook", "Help Center"].map((d, k) => (
            <span key={d} className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-500", k < ph.stale ? "border-bad/40 bg-bad-soft text-bad" : "border-line text-muted")}>
              {k < ph.stale ? "⚠ stale · " : ""}
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24">
      <SectionTitle eyebrow="What Gary does" title={<>A colleague who <span className="italic text-accent">remembers why.</span></>} sub="Every capability below is a graph traversal, not a prompt. Try any of them live." />
      <div className="mt-14 grid auto-rows-[minmax(280px,auto)] gap-4 md:grid-cols-3">
        <Reveal className="md:col-span-2">
          <Tile title="Decision lineage" body="What's true now, what it replaced, who decided, and why: SUPERSEDES*1..6 traversals, cited to the Slack message." href={ask("Why is usage-based pricing launching Dec 1?")}>
            <LineageMini />
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile title="Who actually knows" body="Role-weighted, recency-decayed expertise. Asking counts less than answering." href={ask("Who should I talk to about ledger-db?")}>
            <ExpertBars />
          </Tile>
        </Reveal>
        <Reveal className="md:col-span-3">
          <Tile
            title="Time machine"
            body="Decisions are never deleted, only superseded with a date. So Gary can rebuild the company as it was on any day: what was true, who had decided it, and which docs had already gone stale. Ask “what was our refund policy on July 1?” or drag the timeline and watch the graph rewrite itself."
            href="/app?tab=time"
          >
            <TimeMachineMini />
          </Tile>
        </Reveal>
        <Reveal>
          <Tile title="Risk radar" body="Single points of knowledge, upcoming absences, and betweenness-central knowledge brokers." href={ask("What are our biggest knowledge risks right now?")}>
            <Radar />
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile title="Memory that expires" body="Memories cite decisions. When a decision is superseded, every memory that relied on it is flagged." href={ask("Can a customer get a full refund after 20 days?")}>
            <MemoryFlip />
          </Tile>
        </Reveal>
        <Reveal delay={0.12}>
          <Tile title="Live feed" body="Post a Slack message. Gary links it, extracts the decision, and supersedes the old one in milliseconds." href="/app?tab=live">
            <LiveFeedMini />
          </Tile>
        </Reveal>
        <Reveal>
          <Tile title="Honest by design" body="Names are resolved against the graph before any reasoning. Unknown means unknown, never a near-miss guess." href={ask("Who owns the mobile app?")}>
            <HonestMini />
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile title="It acts, too" body="“Fix it” opens one ticket per stale doc, assigned to its author. Idempotent, written back to the graph." href={ask("Fix the stale Refund policy docs: open a ticket for each, assigned to its author.")}>
            <TicketsMini />
          </Tile>
        </Reveal>
        <Reveal delay={0.12}>
          <Tile title="Speaks MCP" body="The same 12 graph tools as an MCP server, for Claude Desktop, Claude Code, or any agent.">
            <pre className="h-full overflow-hidden rounded-2xl bg-panel-2 p-3 font-mono text-[11px] leading-[1.6] text-ink-2">
              {`{
  "mcpServers": {
    "gary": {
      "command": "pnpm",
      "args": ["-s", "mcp"],
      "env": {
        "FALKORDB_URL": "falkor://…"
      }
    }
  }
}`}
            </pre>
          </Tile>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────── numbers ─────────────────────────── */

export function Numbers() {
  const [s, setS] = useState<{ records: number; people: number; decisions: number; nodes: number; edges: number } | null>(null);
  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((g: { nodes: { label: string }[]; links: unknown[] }) => {
        const by = (l: string[]) => g.nodes.filter((n) => l.includes(n.label)).length;
        setS({ records: by(["Message", "Ticket", "Doc", "Meeting", "PR"]), people: by(["Person"]), decisions: by(["Decision"]), nodes: g.nodes.length, edges: g.links.length });
      })
      .catch(() => {});
  }, []);
  const items = s
    ? [
        { v: s.records, l: "records from 5 tools" },
        { v: s.people, l: "people" },
        { v: s.decisions, l: "decisions with lineage" },
        { v: s.nodes, l: "graph nodes" },
        { v: s.edges, l: "relationships" },
      ]
    : [];
  return (
    <section className="border-y border-line bg-panel/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-14 sm:grid-cols-3 lg:grid-cols-5">
        {(items.length ? items : Array.from({ length: 5 }, () => ({ v: 0, l: "…" }))).map((it, i) => (
          <div key={i}>
            <div className="font-display text-[52px] leading-none text-ink">{it.v ? <NumberTicker value={it.v} delay={i * 0.08} className="tracking-tight text-ink" /> : "–"}</div>
            <div className="mt-2 font-mono text-[11.5px] tracking-wide text-muted uppercase">{it.l}</div>
          </div>
        ))}
      </div>
      <p className="mx-auto max-w-6xl px-5 pb-8 font-mono text-[11px] text-muted">live from the Kitestring graph on FalkorDB Cloud</p>
    </section>
  );
}

/* ─────────────────────────── demo video ─────────────────────────── */

export function Demo() {
  const [play, setPlay] = useState(false);
  return (
    <section id="demo" className="mx-auto max-w-6xl px-5 py-24">
      <SectionTitle eyebrow="See it think" title={<>Watch Gary <span className="italic text-accent">work.</span></>} sub="Recorded by driving the real, deployed app: stale answers, decision lineage, a live policy change, memory going stale, and an honest “I don't know”." />
      <Reveal className="mt-12">
        <Backlight blur={34} className="rounded-3xl">
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-line bg-panel">
            {play ? (
              <video src="/demo.mp4" controls autoPlay playsInline className="h-full w-full" />
            ) : (
              <button onClick={() => setPlay(true)} className="group relative block h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/poster.png" alt="Gary answering a refund question with decision lineage" className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-20 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_20px_60px_-10px_var(--accent)] transition-transform group-hover:scale-110">
                    <Play size={30} className="translate-x-0.5" fill="currentColor" />
                  </span>
                </span>
              </button>
            )}
          </div>
        </Backlight>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────── under the hood ─────────────────────────── */

const CYPHER = [
  {
    t: "Decision lineage",
    q: `MATCH (cur:Decision {status:'active'})-[:ABOUT]->(s)
OPTIONAL MATCH chain = (cur)-[:SUPERSEDES*1..6]->(:Decision)
RETURN cur, [n IN nodes(chain) | n.statement]`,
  },
  {
    t: "Stale docs",
    q: `MATCH (cur)-[:SUPERSEDES*1..6]->(old:Decision)
MATCH (doc:Doc {living:true})-[:ASSERTS]->(old)
WHERE NOT (doc)-[:ASSERTS]->(cur)
RETURN doc.title, old.statement`,
  },
  {
    t: "Knowledge brokers",
    q: `CALL algo.betweenness({
  nodeLabels: ['Person'],
  relationshipTypes: ['COLLABORATES']
}) YIELD node, score`,
  },
  {
    t: "How is A connected to B?",
    q: `CALL algo.SPpaths({sourceNode: a, targetNode: b,
  relTypes: $rels, relDirection: 'both',
  maxLen: 8, pathCount: 1}) YIELD path`,
  },
];

export function UnderTheHood() {
  return (
    <section id="graph" className="mx-auto max-w-6xl px-5 py-24">
      <SectionTitle eyebrow="Under the hood" title={<>The graph does the thinking.</>} sub="The model never writes Cypher. It picks from fixed, parameterised tools like these, and every query it runs is shown with rows and milliseconds." />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {CYPHER.map((c, i) => (
          <Reveal key={c.t} delay={i * 0.06}>
            <div className="h-full rounded-2xl border border-line bg-panel">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="size-2 rounded-full bg-accent" />
                <span className="text-[13.5px] font-semibold text-ink">{c.t}</span>
                <span className="ml-auto font-mono text-[10.5px] text-muted">cypher</span>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-[1.7] text-ink-2">{c.q}</pre>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── final CTA ─────────────────────────── */

export function FinalCta() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <section className="mx-auto max-w-4xl px-5 pt-16 text-center">
      <Reveal>
        <div className="flex justify-center">
          <GaryFace size={110} />
        </div>
        <h2 className="font-display mt-6 text-[44px] leading-[1.02] text-ink sm:text-[64px]">
          Ask Gary anything <br className="hidden sm:block" />
          about <span className="italic text-accent">Kitestring.</span>
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(q.trim() ? ask(q.trim()) : "/app");
          }}
          className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-full border border-line-strong bg-panel p-1.5 pl-5 shadow-[var(--shadow)] focus-within:border-accent"
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Why did we move the ledger cutover?" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
          <button className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-accent-ink">
            Ask <ArrowRight size={16} />
          </button>
        </form>
        <p className="mt-4 text-[12.5px] text-muted">Kitestring is a fictional 21-person startup. Every record is synthetic.</p>
      </Reveal>
    </section>
  );
}
