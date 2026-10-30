// One chat completion from OpenRouter. Server only: the API key must never reach the browser.
// Never throws; OpenRouter's error text is never forwarded or logged, only the status code.
import "server-only";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export type ChatError = "timeout" | "rate_limited" | "upstream";

export type ChatResult =
  | { ok: true; content: string }
  | { ok: false; error: ChatError; status?: number };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

export async function callOpenRouter(apiKey: string, request: ChatRequest): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        // reasoning کم: برای خروجی‌های کوتاه JSON فکر کردن طولانی فقط زمان و توکن هدر می‌دهد.
        reasoning: { effort: "low" },
      }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    return { ok: false, error: isTimeout(error) ? "timeout" : "upstream" };
  }

  if (response.status === 429) return { ok: false, error: "rate_limited", status: 429 };
  if (!response.ok) return { ok: false, error: "upstream", status: response.status };

  let content: unknown;
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    content = body.choices?.[0]?.message?.content;
  } catch (error) {
    return { ok: false, error: isTimeout(error) ? "timeout" : "upstream" };
  }
  // An empty reply (e.g. all tokens spent on reasoning) is a failed call, not bad JSON.
  if (typeof content !== "string" || !content.trim()) return { ok: false, error: "upstream" };
  return { ok: true, content };
}
