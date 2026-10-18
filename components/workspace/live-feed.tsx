"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";

const PRESETS = [
  {
    label: "CEO changes the refund policy again",
    author: "maya",
    channel: "billing",
    text: "Update after the board review: for monthly plans the refund window goes back to 30 days starting Nov 1, but only for customers who have been with us more than 90 days. Everyone else stays at 14 days.",
  },
  {
    label: "Omar names a backup for ledger-db",
    author: "omar",
    channel: "platform",
    text: "Decision: Hana is the backup owner for ledger-db and the checksum verifier while Tomasz is on leave. Tomasz will pair with Hana on the Atlas cutover runbook this week.",
  },
  {
    label: "Holiday deploy freeze",
    author: "arjun",
    channel: "engineering",
    text: "Heads up: all production deploys are frozen from Dec 20 to Jan 3 for the holidays, flagged or not.",
  },
];

export function LiveFeed({ people, onIngested }: { people: { handle: string; name: string }[]; onIngested: (r: any) => void }) {
  const [author, setAuthor] = useState("maya");
  const [channel, setChannel] = useState("billing");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<any[]>([]);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author, channel, text }) });
      const r = await res.json();
      setLog((l) => [{ ...r, author, channel, text }, ...l]);
      onIngested(r);
      if (r.ok) setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Live feed: the company keeps talking</h3>
        <p className="mt-1 text-[12.5px] text-muted">
          Post a new Slack message. Gary links it to the graph, extracts decisions against what it already knows, supersedes old ones and flags docs that just went stale. Then ask again.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setAuthor(p.author);
              setChannel(p.channel);
              setText(p.text);
            }}
            className="rounded-full border border-line bg-panel-2 px-2.5 py-1 text-[11.5px] text-muted hover:border-accent hover:text-ink"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-panel p-3">
        <div className="mb-2 flex gap-2 text-[12px]">
          <select value={author} onChange={(e) => setAuthor(e.target.value)} className="rounded-md border border-line bg-panel-2 px-2 py-1 text-ink">
            {people.map((p) => (
              <option key={p.handle} value={p.handle}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex items-center rounded-md border border-line bg-panel-2 px-2 text-muted">
            #<input value={channel} onChange={(e) => setChannel(e.target.value)} className="w-28 bg-transparent py-1 text-ink outline-none" />
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Type a Slack message…"
          className="w-full resize-none rounded-md border border-line bg-panel-2 p-2 text-[13px] text-ink outline-none focus:border-accent"
        />
        <button onClick={send} disabled={busy || !text.trim()} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-ink disabled:opacity-40">
          {busy ? "Ingesting into the graph…" : "Post to Slack → ingest"}
        </button>
      </div>
      {log.map((r, i) => (
        <div key={i} className="rounded-xl border border-line bg-panel p-3 text-[12.5px]">
          <div className="text-muted">
            <span className="text-ink">@{r.author}</span> in #{r.channel}: “{r.text.slice(0, 120)}
            {r.text.length > 120 ? "…" : ""}”
          </div>
          {!r.ok && <div className="mt-2 text-bad">Failed: {r.error}</div>}
          {r.ok && (
            <div className="mt-2 space-y-1">
              <div className="text-muted">Linked to: {r.mentions.length ? r.mentions.map((m: string) => m.split(":")[1]).join(", ") : "nothing yet"}</div>
              {r.created.map((d: any) => (
                <div key={d.key} className="text-good">+ Decision: {d.statement}</div>
              ))}
              {r.superseded.map((d: any) => (
                <div key={d.key} className="text-accent">↳ Superseded: {d.statement}</div>
              ))}
              {r.newlyStale.map((d: any) => (
                <div key={d.doc} className="text-bad">⚠ Now stale: {d.title}</div>
              ))}
              {!r.created.length && !r.superseded.length && <div className="text-muted">No new decision detected (stored as context).</div>}
              <div className="pt-1 text-[11px] text-muted">{r.queries.length} Cypher queries · {r.queries.reduce((a: number, q: any) => a + q.ms, 0).toFixed(1)}ms in FalkorDB</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
