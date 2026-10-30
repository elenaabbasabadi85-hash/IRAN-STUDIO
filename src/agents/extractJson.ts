// Finds the JSON value in a model's reply. Even when told to answer with JSON only, models often
// wrap it in ```json fences, add a sentence around it, or (reasoning models) put a <think> block first.
// No imports, so the plain Node test can load this file directly.

export type ExtractResult = { ok: true; value: unknown } | { ok: false };

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;
const FENCED_BLOCK = /```(?:json)?[^\S\r\n]*\r?\n?([\s\S]*?)```/gi;

function tryParse(text: string): ExtractResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function extractJson(reply: string): ExtractResult {
  const text = reply.replace(THINK_BLOCK, "").trim();

  // 1. The whole reply is JSON, as asked.
  const whole = tryParse(text);
  if (whole.ok) return whole;

  // 2. Inside a Markdown code fence; the first one that parses wins.
  for (const [, body] of text.matchAll(FENCED_BLOCK)) {
    const fenced = tryParse(body.trim());
    if (fenced.ok) return fenced;
  }

  // 3. From the first { to the last } (or [ to ]), ignoring the words around it.
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start === -1 || end <= start) continue;
    const embedded = tryParse(text.slice(start, end + 1));
    if (embedded.ok) return embedded;
  }
  return { ok: false };
}
