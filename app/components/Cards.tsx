"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { KIND } from "./kinds";

type Q = { label: string; cypher: string; params: Record<string, unknown>; ms: number; rows: number };

const Box = ({ title, tone = "default", children }: { title: React.ReactNode; tone?: "default" | "warn" | "good"; children: React.ReactNode }) => (
  <div
    className={`fade-in mt-3 rounded-xl border p-3 ${tone === "warn" ? "border-bad/40 bg-bad/5" : tone === "good" ? "border-good/40 bg-good/5" : "border-line bg-panel-2/60"}`}
  >
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
    {children}
  </div>
);

const Key = ({ k, onCite }: { k?: string | null; onCite: (k: string) => void }) =>
  k ? (
    <button className="chip" onClick={() => onCite(k)}>
      {k.split(":")[1]}
    </button>
  ) : null;

export function ToolCards({ name, data, onCite, onAsk }: { name: string; data: any; onCite: (k: string) => void; onAsk: (q: string) => void }) {
  if (!data) return null;
  if (name === "decision_lineage" && data.current) {
    return (
      <>
        <Box title={<>Decision lineage · {data.subject?.name}{data.owner ? ` · owned by ${data.owner.team}` : ""}</>}>
          <div className="space-y-3">
            {data.current.map((c: any) => (
              <div key={c.key} className="relative border-l-2 border-good/70 pl-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="rounded bg-good/15 px-1.5 text-[10px] font-bold text-good">CURRENT</span>
                  <span className="font-medium text-white">{c.statement}</span>
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
                  <div key={r.key} className="mt-2 border-l-2 border-dashed border-[#5b6475] pl-3 text-[12.5px] text-muted">
                    <span className="mr-1.5 rounded bg-white/5 px-1.5 text-[10px] font-bold">REPLACED</span>
                    <span className="line-through decoration-white/20">{r.statement}</span>
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
                  <Key k={s.key} onCite={onCite} /> <span className="text-white">{s.title}</span>
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
              onClick={() => onAsk(`Open a ticket for each stale ${data.subject?.name} doc, assigned to its author, to update it to the current decision.`)}
              className="mt-3 rounded-lg bg-bad/90 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-bad"
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
                  <span className="font-medium text-white">{e.name}</span> <span className="text-muted">· {e.role} · {e.team}</span>
                  {e.on_leave && <span className="ml-1.5 rounded bg-bad/15 px-1.5 text-[10px] font-bold text-bad">{e.on_leave.toUpperCase()}</span>}
                </span>
                <span className="font-mono text-[11px] text-accent">{e.share_of_knowledge}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/5">
                <div className="h-full rounded bg-gradient-to-r from-accent-2 to-accent" style={{ width: e.share_of_knowledge }} />
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
              <span className="font-medium text-white">{r.subject}</span>
              <span className="text-muted">→ {r.main_knower} holds {r.share}</span>
              {r.main_knower_away_from && <span className="rounded bg-bad/15 px-1.5 text-[10px] font-bold text-bad">AWAY FROM {r.main_knower_away_from}</span>}
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
                <span className="font-mono text-[11px] text-muted">{d.date}</span> <span className="text-white">{d.statement}</span>
                {d.status === "superseded" && <span className="ml-1.5 rounded bg-white/5 px-1.5 text-[10px] font-bold text-muted">SINCE REPLACED</span>}
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
            <div className="text-[11.5px] text-muted">Going away: {data.people_going_away.map((a: any) => `${a.person} from ${a.from}`).join(" · ")}</div>
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
              <span className="text-white">{c.members.join(", ")}</span>
            </div>
          ))}
        </div>
      </Box>
    );
  }
  if (name === "open_ticket" && data.created) {
    return (
      <Box tone="good" title="Action taken">
        <div className="text-[12.5px]">
          ✅ Created <Key k={data.created} onCite={onCite} /> “{data.title}” → assigned to <span className="text-white">{data.assigned_to}</span>
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
    <div className="mb-2 space-y-1">
      {steps.map((s) => {
        const ms = s.queries?.reduce((a, q) => a + q.ms, 0);
        return (
          <div key={s.id} className="rounded-lg border border-line bg-black/20 text-[11.5px]">
            <button className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className={s.outcome ? (s.outcome === "ok" ? "text-good" : "text-accent") : "pulse-dot text-accent"}>●</span>
              <span className="font-mono text-white">{s.name}</span>
              <span className="truncate font-mono text-muted">{Object.values(s.args ?? {}).filter((v) => typeof v === "string").join(", ")}</span>
              <span className="ml-auto whitespace-nowrap text-muted">
                {s.outcome ? `${s.outcome === "unknown_subject" ? "not in graph" : s.outcome} · ${s.queries?.length ?? 0} queries · ${ms?.toFixed(1)}ms` : "running…"} {s.queries?.length ? (open === s.id ? "▾" : "▸") : ""}
              </span>
            </button>
            {open === s.id && s.queries && (
              <div className="space-y-2 border-t border-line px-2.5 py-2">
                {s.queries.map((q, i) => (
                  <div key={i}>
                    <div className="mb-0.5 flex justify-between text-[10.5px] text-muted">
                      <span className="font-mono">{q.label}</span>
                      <span>
                        {q.rows} rows · {q.ms}ms
                      </span>
                    </div>
                    <pre className="overflow-x-auto rounded-md bg-black/40 p-2 font-mono text-[10.5px] leading-4 text-[#c9d4ea]">
                      {q.cypher}
                      {Object.keys(q.params).length ? `\n// params ${JSON.stringify(q.params).slice(0, 200)}` : ""}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function KindDot({ kind }: { kind: string }) {
  return <span style={{ color: KIND[kind]?.color }}>{KIND[kind]?.icon ?? "•"}</span>;
}
