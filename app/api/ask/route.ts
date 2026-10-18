import { runAgent, type Turn } from "@/lib/agent";

export const maxDuration = 60;

// Streams agent events as NDJSON so the UI can show each tool call and its Cypher as it happens.
export async function POST(req: Request) {
  const { question, history = [], session = "web" } = (await req.json()) as { question: string; history?: Turn[]; session?: string };
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent(String(question).slice(0, 500), history, session)) controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ type: "error", message: String((e as Error).message) }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
