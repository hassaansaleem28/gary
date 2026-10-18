import { seedGraph } from "@/lib/seed";

export const maxDuration = 60;

export async function POST() {
  const lines: string[] = [];
  const counts = await seedGraph({ log: (s) => lines.push(s) });
  return Response.json({ ok: true, ...counts, log: lines.slice(-3) });
}
