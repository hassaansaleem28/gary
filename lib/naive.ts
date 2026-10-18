import { Tracer } from "./db";
import { chat } from "./llm";

// Baseline for comparison: classic "chunk retrieval" RAG. Same records, same model, but only the top text
// matches are handed over, with no relationships, dates or supersession. This is what most company chatbots do.
export async function naiveAnswer(question: string) {
  const tx = new Tracer();
  const words = question.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const rows = words.length
    ? await tx.ro<{ key: string; title: string; text: string }>(
        "naive.fulltext_topk",
        `CALL db.idx.fulltext.queryNodes('Source', $q) YIELD node, score
         RETURN node.key AS key, node.title AS title, node.text AS text ORDER BY score DESC LIMIT 4`,
        { q: words.map((w) => `${w}*`).join(" | ") },
      )
    : [];
  const context = rows.map((r, i) => `Document ${i + 1} (${r.title}):\n${r.text}`).join("\n\n");
  try {
    const { message, model } = await chat(
      [
        { role: "system", content: "Answer the employee's question using only the documents provided. Be concise (2-3 sentences)." },
        { role: "user", content: `${context || "(no documents found)"}\n\nQuestion: ${question}` },
      ],
      { fast: true, maxTokens: 400 },
    );
    return { text: message.content ?? "", model, docs: rows.map((r) => ({ key: r.key, title: r.title })), queries: tx.logs };
  } catch (e) {
    return { text: `(baseline unavailable: ${(e as Error).message.slice(0, 80)})`, model: "none", docs: rows.map((r) => ({ key: r.key, title: r.title })), queries: tx.logs };
  }
}

const STOP = new Set("what when where which who whom whose why how have does with after before about from into that this there their they them then than also just only allowed long much many some still keep kept".split(" "));
