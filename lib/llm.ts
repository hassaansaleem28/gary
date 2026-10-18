import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

// Any OpenAI-compatible endpoint works (Groq, Ollama, OpenRouter...). Models are tried in order;
// a rate-limited or failing model falls through to the next one.
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
  apiKey: process.env.LLM_API_KEY ?? "missing",
  maxRetries: 0,
  timeout: 45_000,
});

const AGENT_MODELS = uniq([process.env.LLM_MODEL ?? "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]);
const FAST_MODELS = uniq([process.env.LLM_FAST_MODEL ?? "openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);

export const llmConfigured = () => !!process.env.LLM_API_KEY;

function uniq(xs: string[]) {
  return [...new Set(xs.filter(Boolean))];
}

function extraParams(model: string): Record<string, unknown> {
  return model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {};
}

export async function chat(
  messages: ChatCompletionMessageParam[],
  opts: { tools?: ChatCompletionTool[]; fast?: boolean; json?: boolean; maxTokens?: number } = {},
) {
  const models = opts.fast ? FAST_MODELS : AGENT_MODELS;
  let lastErr: unknown;
  for (const model of models) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages,
        tools: opts.tools,
        tool_choice: opts.tools ? "auto" : undefined,
        response_format: opts.json ? { type: "json_object" } : undefined,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: 0.1,
        ...extraParams(model),
      } as never);
      return { message: (res as OpenAI.ChatCompletion).choices[0].message, model };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status && status < 500 && status !== 429 && status !== 413 && status !== 400) throw err;
    }
  }
  throw lastErr;
}

export async function chatJSON<T>(system: string, user: string): Promise<T> {
  const { message } = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { json: true, maxTokens: 1500 },
  );
  const text = message.content ?? "{}";
  const start = text.indexOf("{");
  return JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) as T;
}
