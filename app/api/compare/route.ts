import { naiveAnswer } from "@/lib/naive";


export async function POST(req: Request) {
  const { question } = (await req.json()) as { question: string };
  return Response.json(await naiveAnswer(String(question).slice(0, 500)));
}
