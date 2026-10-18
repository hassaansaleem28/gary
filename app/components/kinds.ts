// Visual language shared by the graph, chips and cards.
export const KIND: Record<string, { color: string; icon: string; label: string }> = {
  Person: { color: "#7c9cff", icon: "●", label: "Person" },
  Team: { color: "#b18cff", icon: "◆", label: "Team" },
  System: { color: "#3ddc97", icon: "■", label: "System" },
  Project: { color: "#ff7eb6", icon: "▲", label: "Project" },
  Topic: { color: "#f5b942", icon: "★", label: "Topic" },
  Decision: { color: "#ff9f43", icon: "⬢", label: "Decision" },
  Message: { color: "#8fa3c7", icon: "💬", label: "Slack" },
  Ticket: { color: "#8fa3c7", icon: "🎫", label: "Jira" },
  Doc: { color: "#8fa3c7", icon: "📄", label: "Doc" },
  Meeting: { color: "#8fa3c7", icon: "🗓", label: "Meeting" },
  PR: { color: "#8fa3c7", icon: "⑂", label: "PR" },
  Finding: { color: "#38d6f5", icon: "🧠", label: "Memory" },
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
