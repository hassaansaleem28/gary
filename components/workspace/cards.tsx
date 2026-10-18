"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { KIND, TOOL_LABEL } from "./kinds";

type Q = { label: string; cypher: string; params: Record<string, unknown>; ms: number; rows: number };

const Box = ({ title, tone = "default", children }: { title: React.ReactNode; tone?: "default" | "warn" | "good"; children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    className={`mt-3 rounded-2xl border p-4 ${tone === "warn" ? "border-bad/35 bg-bad-soft" : tone === "good" ? "border-good/35 bg-good-soft" : "border-line bg-panel"}`}
  >
    <div className="mb-2.5 font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">{title}</div>
    {children}
  </motion.div>
);

const Key = ({ k, onCite }: { k?: string | null; onCite: (k: string) => void }) =>
  k ? (
    <button className="chip" onClick={() => onCite(k)}>
      {k.split(":")[1]}
    </button>
  ) : null;

export function ToolCards({ name, data, onCite, onAsk }: { name: string; data: any; onCite: (k: string) => void; onAsk: (q: string, opts?: { compare?: boolean }) => void }) {
  if (!data) return null;
  if (name === "decision_lineage" && data.current) {
    return (
      <>
        <Box title={<>Decision lineage · {data.subject?.name}{data.owner ? ` · owned by ${data.owner.team}` : ""}</>}>
          <div className="space-y-3">
            {data.current.map((c: any) => (
              <div key={c.key} className="relative border-l-2 border-good/70 pl-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="rounded bg-good-soft px-1.5 text-[10px] font-bold text-good">CURRENT</span>
                  <span className="font-medium text-ink">{c.statement}</span>
                </div>
                <div className="mt-1 text-[11.5px] text-muted">
                  {c.date}
                  {c.decided_by?.length ? ` · decided by ${c.decided_by.join(", ")}` : ""} · in <Key k={c.decided_in} onCite={onCite} />
                  {c.because_of?.length ? (
                    <>
                      {" "}
                      · because of{" "}
                      {c.because_of.map((b: any) => (
                        <Key key={b.key} k={b.key} onCite={onCite} />
                      ))}
                    </>
                  ) : null}
                </div>
                {c.replaced?.map((r: any) => (
                  <div key={r.key} className="mt-2 border-l-2 border-dashed border-line-strong pl-3 text-[12.5px] text-muted">
                    <span className="mr-1.5 rounded bg-panel-2 px-1.5 text-[10px] font-bold">REPLACED</span>
                    <span className="line-through decoration-bad/60">{r.statement}</span>
                    <div className="text-[11px]">
                      {r.date}
                      {r.decided_by?.length ? ` · ${r.decided_by.join(", ")}` : ""} · <Key k={r.decided_in} onCite={onCite} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Box>
        {data.stale_docs?.length > 0 && (
          <Box tone="warn" title={`⚠ ${data.stale_docs.length} doc${data.stale_docs.length > 1 ? "s" : ""} still state an old decision`}>
            <ul className="space-y-1.5 text-[12.5px]">
              {data.stale_docs.map((s: any) => (
                <li key={s.key}>
                  <Key k={s.key} onCite={onCite} /> <span className="text-ink">{s.title}</span>
                  {s.author ? <span className="text-muted"> · {s.author}</span> : null}
                  <div className="pl-1 text-[11.5px] text-muted">still says: “{s.still_says}”</div>
                </li>
              ))}
            </ul>
            {data.confused_people_since?.length > 0 && (
              <div className="mt-2 text-[11.5px] text-muted">
                People confused since:{" "}
                {data.confused_people_since.map((c: any) => (
                  <Key key={c.key} k={c.key} onCite={onCite} />
                ))}
              </div>
            )}
            <button
              onClick={() => onAsk(`Fix the stale ${data.subject?.name} docs: open a ticket for each, assigned to its author.`, { compare: false })}
              className="mt-3 rounded-lg bg-bad px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-bad"
            >
              Fix it → open tickets for the doc owners
            </button>
          </Box>
        )}
      </>
    );
  }
  if (name === "who_knows" && data.experts) {
    return (
      <Box title={<>Who knows {data.subject?.name}{data.owner ? ` · owner: ${data.owner.team}${data.owner.lead ? ` (${data.owner.lead})` : ""}` : ""}</>}>
        <div className="space-y-2">
          {data.experts.map((e: any) => (
            <div key={e.key} className="text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-ink">{e.name}</span> <span className="text-muted">· {e.role} · {e.team}</span>
                  {e.on_leave && <span className="ml-1.5 rounded bg-bad-soft px-1.5 text-[10px] font-bold text-bad">{e.on_leave.toUpperCase()}</span>}
                </span>
                <span className="font-mono text-[11px] text-accent">{e.share_of_knowledge}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-panel-2">
                <div className="h-full rounded bg-gradient-to-r from-accent to-[#ffb86b]" style={{ width: e.share_of_knowledge }} />
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {e.records} records · last active {e.last_active} ·{" "}
                {e.evidence.map((k: string) => (
                  <Key key={k} k={k} onCite={onCite} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Box>
    );
  }
  if (name === "risk_radar") {
    return (
      <Box tone="warn" title="Risk radar">
        <div className="space-y-1.5 text-[12.5px]">
          {data.single_points_of_knowledge?.map((r: any) => (
            <div key={r.key} className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-ink">{r.subject}</span>
              <span className="text-muted">
                → {r.main_knower} holds {r.share}
                {r.next_best_knower ? `, next: ${r.next_best_knower}` : ""}
              </span>
              {r.main_knower_away_from && <span className="rounded bg-bad-soft px-1.5 text-[10px] font-bold text-bad">AWAY FROM {r.main_knower_away_from}</span>}
            </div>
          ))}
          {data.knowledge_brokers_betweenness?.length > 0 && (
            <div className="pt-1 text-[11.5px] text-muted">Knowledge brokers (betweenness): {data.knowledge_brokers_betweenness.map((b: any) => `${b.person} ${b.betweenness}`).join(" · ")}</div>
          )}
          {data.stale_docs?.length > 0 && (
            <div className="pt-1 text-[11.5px] text-muted">
              Stale docs:{" "}
              {data.stale_docs.map((s: any) => (
                <Key key={s.doc} k={s.doc} onCite={onCite} />
              ))}
            </div>
          )}
        </div>
      </Box>
    );
  }
  if (name === "catch_up" && data.decisions) {
    return (
      <Box title={`What changed since ${data.since} · for ${data.for}`}>
        <div className="space-y-2 text-[12.5px]">
          {data.decisions.map((d: any) => (
            <div key={d.key} className="border-l-2 border-accent/60 pl-2.5">
              <div>
                <span className="font-mono text-[11px] text-muted">{d.date}</span> <span className="text-ink">{d.statement}</span>
                {d.status === "superseded" && <span className="ml-1.5 rounded bg-panel-2 px-1.5 text-[10px] font-bold text-muted">SINCE REPLACED</span>}
              </div>
              <div className="text-[11px] text-muted">
                {d.decided_by?.length ? `${d.decided_by.join(", ")} · ` : ""}
                {d.about?.join(", ")}
                {d.replaced?.length ? <span className="text-accent"> · replaced: {d.replaced[0]}</span> : null} <Key k={d.decided_in} onCite={onCite} />
              </div>
            </div>
          ))}
          {data.open_tickets?.length > 0 && (
            <div className="pt-1 text-[11.5px] text-muted">
              Open tickets:{" "}
              {data.open_tickets.map((t: any) => (
                <Key key={t.key} k={t.key} onCite={onCite} />
              ))}
            </div>
          )}
          {data.people_going_away?.length > 0 && (
            <div className="text-[11.5px] text-muted">
              Going away:{" "}
              {data.people_going_away
                .map((a: any) => `${a.person} from ${a.from}${a.suggested_backups_by_subject?.length ? ` (backups: ${a.suggested_backups_by_subject.map((b: any) => `${b.subject} → ${b.backups.join(", ")}`).join("; ")})` : ""}`)
                .join(" · ")}
            </div>
          )}
        </div>
      </Box>
    );
  }
  if (name === "connect" && data.path) {
    return (
      <Box title={`Path · ${data.hops} hops`}>
        <div className="font-mono text-[11.5px] leading-6 text-muted">{data.path}</div>
      </Box>
    );
  }
  if (name === "real_teams" && data.clusters) {
    return (
      <Box title="How people actually work together (label propagation)">
        <div className="space-y-2 text-[12px]">
          {data.clusters.map((c: any, i: number) => (
            <div key={i}>
              <span className="text-muted">Cluster {i + 1} · spans {c.org_teams_spanned.length} org team{c.org_teams_spanned.length > 1 ? "s" : ""}: </span>
              <span className="text-ink">{c.members.join(", ")}</span>
            </div>
          ))}
        </div>
      </Box>
    );
  }
  if (name === "fix_stale_docs" && data.tickets) {
    return (
      <Box tone="good" title="Action taken">
        <ul className="space-y-1 text-[12.5px]">
          {data.tickets.map((t: any) => (
            <li key={t.key}>
              {t.already_open ? "↺ Already open" : "✅ Created"} <Key k={t.key} onCite={onCite} /> for <span className="text-ink">{t.title}</span> → assigned to{" "}
              <span className="text-ink">{t.assigned_to}</span>
            </li>
          ))}
        </ul>
      </Box>
    );
  }
  if (name === "open_ticket" && data.created) {
    return (
      <Box tone="good" title="Action taken">
        <div className="text-[12.5px]">
          ✅ Created <Key k={data.created} onCite={onCite} /> “{data.title}” → assigned to <span className="text-ink">{data.assigned_to}</span>
        </div>
      </Box>
    );
  }
  if (name === "remember" && data.remembered) {
    return (
      <Box tone="good" title="Saved to memory">
        <div className="text-[12.5px]">🧠 {data.remembered}</div>
      </Box>
    );
  }
  return null;
}

export function Trail({ steps }: { steps: { id: string; name: string; args: any; outcome?: string; queries?: Q[] }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!steps.length) return null;
  return (
    <ol className="relative mb-3 ml-1.5 space-y-1 border-l border-line pl-4">
      {steps.map((s) => {
        const ms = s.queries?.reduce((a, q) => a + q.ms, 0);
        const subject = Object.values(s.args ?? {}).filter((v) => typeof v === "string" && v).join(" → ");
        const status = !s.outcome ? "running" : s.outcome === "ok" ? "ok" : s.outcome === "unknown_subject" ? "unknown" : "empty";
        return (
          <motion.li key={s.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} className="relative">
            <span
              className={`absolute top-[11px] -left-[21px] size-2.5 rounded-full border-2 border-bg ${status === "ok" ? "bg-good" : status === "running" ? "pulse-dot bg-accent" : status === "unknown" ? "bg-bad" : "bg-muted"}`}
            />
            <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-panel-2" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="text-ink">{TOOL_LABEL[s.name] ?? s.name}</span>
              {subject && <span className="truncate font-mono text-[11.5px] text-accent">{subject}</span>}
              <span className="ml-auto shrink-0 font-mono text-[10.5px] whitespace-nowrap text-muted">
                {s.outcome ? `${status === "unknown" ? "not in graph" : s.outcome} · ${s.queries?.length ?? 0} cypher · ${ms?.toFixed(1)}ms` : "walking the graph…"}
                {s.queries?.length ? (open === s.id ? " ▾" : " ▸") : ""}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {open === s.id && s.queries && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="space-y-2 px-2 pt-1 pb-2">
                    {s.queries.map((q, i) => (
                      <div key={i}>
                        <div className="mb-0.5 flex justify-between font-mono text-[10.5px] text-muted">
                          <span>{q.label}</span>
                          <span>
                            {q.rows} rows · {q.ms}ms
                          </span>
                        </div>
                        <pre className="overflow-x-auto rounded-lg border border-line bg-panel-2 p-2.5 font-mono text-[10.5px] leading-4 text-ink-2">
                          {q.cypher}
                          {Object.keys(q.params).length ? `\n// params ${JSON.stringify(q.params).slice(0, 200)}` : ""}
                        </pre>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function KindDot({ kind }: { kind: string }) {
  return <span style={{ color: KIND[kind]?.color }}>{KIND[kind]?.icon ?? "•"}</span>;
}
