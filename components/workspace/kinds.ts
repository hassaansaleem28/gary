// Visual language shared by the graph, chips and cards. Colours are CSS variables so both themes work;
// the canvas resolves them with resolveColor().
export const KIND: Record<string, { color: string; icon: string; label: string }> = {
  Person: { color: "var(--blue)", icon: "●", label: "Person" },
  Team: { color: "var(--violet)", icon: "◆", label: "Team" },
  System: { color: "var(--green)", icon: "■", label: "System" },
  Project: { color: "var(--pink)", icon: "▲", label: "Project" },
  Topic: { color: "var(--amber)", icon: "★", label: "Topic" },
  Decision: { color: "var(--accent)", icon: "⬢", label: "Decision" },
  Message: { color: "var(--muted)", icon: "#", label: "Slack" },
  Ticket: { color: "var(--muted)", icon: "◫", label: "Jira" },
  Doc: { color: "var(--muted)", icon: "▤", label: "Doc" },
  Meeting: { color: "var(--muted)", icon: "◷", label: "Meeting" },
  PR: { color: "var(--muted)", icon: "⑂", label: "PR" },
  Finding: { color: "var(--blue)", icon: "✦", label: "Memory" },
};

// Plain-English names for each graph tool, shown in the agent's step trail.
export const TOOL_LABEL: Record<string, string> = {
  decision_lineage: "Tracing decision lineage",
  who_knows: "Ranking who knows",
  profile: "Looking up",
  connect: "Finding the path between",
  risk_radar: "Scanning for knowledge risks",
  real_teams: "Detecting real teams",
  catch_up: "Catching up",
  search: "Searching records for",
  fix_stale_docs: "Opening tickets for stale docs about",
  open_ticket: "Opening a ticket",
  remember: "Saving to memory",
};

export function shortLabel(key: string, title?: string) {
  const [ns, id] = key.split(":");
  if (ns === "slack") return title?.split(" · ")[0] ?? "#slack";
  if (ns === "jira") return id;
  if (ns === "github") return title?.split(":")[0] ?? id;
  if (ns === "decision") return "decision";
  if (ns === "gary") return id;
  if (ns === "help") return "help center";
  if (ns === "meeting") return title ?? id;
  return title && title.length < 28 ? title : id;
}

export const fmtDate = (ms?: number | null) => (ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export function resolveColor(cssValue: string): string {
  if (typeof window === "undefined" || !cssValue.startsWith("var(")) return cssValue;
  return getComputedStyle(document.documentElement).getPropertyValue(cssValue.slice(4, -1)).trim() || "#888";
}
