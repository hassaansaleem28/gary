import fs from "node:fs";
import path from "node:path";

// A Source is one piece of raw company knowledge from any connector, normalised to one shape.
export type SourceKind = "Message" | "Ticket" | "Doc" | "Meeting" | "PR";

export interface Source {
  key: string;
  kind: SourceKind;
  origin: "slack" | "jira" | "notion" | "help-center" | "meetings" | "github";
  title: string;
  text: string;
  at: number; // epoch ms
  author?: string; // person handle
  channel?: string;
  thread?: string; // root message key
  living?: boolean; // docs that are supposed to describe the present (policies, playbooks, runbooks)
  status?: string;
  participants: { handle: string; rel: "REVIEWED" | "ATTENDED" | "ASSIGNED" | "REPORTED" }[];
  systems?: string[]; // explicit system keys (PRs)
  url: string;
}

export interface Org {
  company: { key: string; name: string; about: string };
  teams: { key: string; name: string }[];
  people: { key: string; name: string; handle: string; role: string; team: string; lead?: boolean; joined: string }[];
  systems: { key: string; name: string; owner: string; about: string }[];
  projects: { key: string; name: string; aliases?: string[]; about: string; lead: string; teams: string[]; uses: string[]; status: string }[];
  topics: { key: string; name: string; aliases?: string[]; owner: string }[];
}

const DATA_DIR = path.join(process.cwd(), "data", "kitestring");
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
const ts = (iso: string) => new Date(iso).getTime();

export function loadOrg(): Org {
  return read<Org>("org.json");
}

export function slackSource(m: { id: string; channel: string; author: string; at: string; text: string; thread?: string }): Source {
  return {
    key: m.id,
    kind: "Message",
    origin: "slack",
    title: `#${m.channel} · ${m.author}`,
    text: m.text,
    at: ts(m.at),
    author: m.author,
    channel: m.channel,
    thread: m.thread,
    participants: [],
    url: `https://kitestring.example/slack/${m.channel}/${m.id.split(":")[1]}`,
  };
}

export function loadSources(): Source[] {
  const slack = read<Parameters<typeof slackSource>[0][]>("slack.json").map(slackSource);

  const jira = read<{ id: string; type: string; title: string; reporter: string; assignee: string; status: string; at: string; text: string }[]>("jira.json").map(
    (t): Source => ({
      key: t.id,
      kind: "Ticket",
      origin: "jira",
      title: `${t.id.split(":")[1]}: ${t.title}`,
      text: t.text,
      at: ts(t.at),
      author: t.reporter,
      status: t.status,
      participants: [{ handle: t.assignee, rel: "ASSIGNED" }],
      url: `https://kitestring.example/jira/${t.id.split(":")[1]}`,
    }),
  );

  const docs = read<{ id: string; space: string; title: string; author: string; at: string; living: boolean; text: string }[]>("notion.json").map(
    (d): Source => ({
      key: d.id,
      kind: "Doc",
      origin: d.id.startsWith("help:") ? "help-center" : "notion",
      title: d.title,
      text: d.text,
      at: ts(d.at),
      author: d.author,
      living: d.living,
      channel: d.space,
      participants: [],
      url: `https://kitestring.example/${d.id.startsWith("help:") ? "help" : "notion"}/${d.id.split(":")[1]}`,
    }),
  );

  const meetings = read<{ id: string; title: string; at: string; attendees: string[]; text: string }[]>("meetings.json").map(
    (m): Source => ({
      key: m.id,
      kind: "Meeting",
      origin: "meetings",
      title: m.title,
      text: m.text,
      at: ts(m.at),
      participants: m.attendees.map((handle) => ({ handle, rel: "ATTENDED" as const })),
      url: `https://kitestring.example/meetings/${m.id.split(":")[1]}`,
    }),
  );

  const prs = read<{ id: string; repo: string; number: number; title: string; author: string; reviewers: string[]; at: string; systems: string[]; text: string }[]>("github.json").map(
    (p): Source => ({
      key: p.id,
      kind: "PR",
      origin: "github",
      title: `${p.repo}#${p.number}: ${p.title}`,
      text: p.text,
      at: ts(p.at),
      author: p.author,
      systems: p.systems,
      participants: p.reviewers.map((handle) => ({ handle, rel: "REVIEWED" as const })),
      url: `https://kitestring.example/github/${p.repo}/pull/${p.number}`,
    }),
  );

  return [...slack, ...jira, ...docs, ...meetings, ...prs].sort((a, b) => a.at - b.at);
}
