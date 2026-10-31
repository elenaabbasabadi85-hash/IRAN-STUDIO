// Runs one agent: its prompt from prompts/, the channel profile, a JSON-only reply checked with Zod,
// one corrective retry, then the fallback model. Never throws; failures come back as a typed error.
// Without OPENROUTER_API_KEY it answers with the sample in fixtures (demo mode).
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ChannelProfile } from "@/core/types";
import { extractJson } from "@/agents/extractJson";
import { MODELS } from "@/agents/models.config";
import { callOpenRouter, type ChatError, type ChatMessage } from "@/agents/openrouter";
import { agentSchemas, type AgentOutput, type AgentRole } from "@/agents/schemas";
import ideaFixture from "../../fixtures/idea.json";
import testFixture from "../../fixtures/test.json";

// Each readFile gets its literal path right in the call, never built from the role string, so
// Next.js file tracing ships exactly these .md files with the server function on Vercel.
// (readFile(map[role]) would look dynamic to Turbopack and trace the whole project instead.)
const PROMPTS = {
  test: () => readFile(path.join(process.cwd(), "prompts", "test.md"), "utf8"),
  idea: () => readFile(path.join(process.cwd(), "prompts", "idea.md"), "utf8"),
} satisfies Record<AgentRole, () => Promise<string>>;

// Imported, not read from disk, so the samples are bundled like fixtures/transcript.json.
const FIXTURES = {
  test: testFixture,
  idea: ideaFixture,
} satisfies Record<AgentRole, unknown>;

/** Stays under the route's maxDuration (60 s) with room to send the response. */
const TOTAL_BUDGET_MS = 55_000;
const CALL_TIMEOUT_MS = 25_000;
/** With less time than this left, another call can't realistically finish. */
const MIN_CALL_MS = 3_000;

const START_MESSAGE = "شروع کن.";
const NO_JSON_FOUND = "هیچ JSON معتبری در پاسخ پیدا نشد.";

export type AgentError = ChatError | "invalid_output" | "internal";

export type AgentResult =
  | { ok: true; data: AgentOutput; demo: boolean; model: string | null }
  | { ok: false; error: AgentError };

function buildSystemPrompt(rolePrompt: string, channel: ChannelProfile, schema: z.ZodType): string {
  return [
    rolePrompt.trim(),
    "## پروفایل کانال",
    "همه‌ی پاسخ‌ها باید برای این کانال باشند:",
    JSON.stringify(channel, null, 2),
    "## قالب پاسخ",
    "فقط یک JSON معتبر برگردان، بدون توضیح، بدون Markdown و بدون هیچ متن دیگری. شکل آن باید با این JSON Schema بخواند:",
    // io: "input" یعنی شکل چیزی که مدل می‌فرستد، نه خروجی بعد از transform (مثل idهایی که کد می‌سازد).
    // در حالت پیش‌فرض، Zod 4 برای transform خطا می‌دهد، چون JSON Schema نمی‌تواند آن را نشان دهد.
    JSON.stringify(z.toJSONSchema(schema, { io: "input" })),
  ].join("\n\n");
}

function correctionMessage(problem: string): string {
  return `پاسخ قبلی قابل قبول نبود:\n${problem}\n\nفقط JSON اصلاح‌شده را برگردان، بدون هیچ متن دیگری.`;
}

export async function runAgent(role: AgentRole, channel: ChannelProfile, input: unknown): Promise<AgentResult> {
  const schema = agentSchemas[role];

  // حالت دمو: بدون کلید هم همه‌چیز باید کار کند. نمونه را هم با همان اسکیما می‌سنجیم
  // تا اگر قرارداد خروجی عوض شد، fixture کهنه بی‌صدا به صفحه‌ها نرسد.
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const sample = schema.safeParse(FIXTURES[role]);
    if (!sample.success) {
      console.error(`[agents] fixtures/${role}.json does not match its schema`);
      return { ok: false, error: "internal" };
    }
    return { ok: true, data: sample.data, demo: true, model: null };
  }

  let rolePrompt: string;
  try {
    rolePrompt = await PROMPTS[role]();
  } catch {
    console.error(`[agents] prompts/${role}.md could not be read`);
    return { ok: false, error: "internal" };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(rolePrompt, channel, schema) },
    { role: "user", content: input === undefined ? START_MESSAGE : JSON.stringify(input) },
  ];
  const config = MODELS[role];
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: AgentError = "upstream";

  for (const model of [config.primary, config.fallback]) {
    const conversation = [...messages];

    // چرا فقط یک بار تلاش دوباره؟ بیشتر خطاهای شکل JSON (فیلد جاافتاده، نوع اشتباه) با یک بار
    // نشان دادن پیام خطای Zod به خود مدل درست می‌شوند. اگر همان مدل دو بار نتواند، شانس بار سوم کم است
    // و هر تلاش زمان و سهمیه‌ی رایگان را مصرف می‌کند؛ بهتر است سراغ مدل جایگزین برویم.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const timeoutMs = Math.min(CALL_TIMEOUT_MS, deadline - Date.now());
      if (timeoutMs < MIN_CALL_MS) {
        console.info(`[agents] role=${role} out of time before calling ${model}`);
        return { ok: false, error: "timeout" };
      }

      const started = Date.now();
      const reply = await callOpenRouter(apiKey, {
        model,
        messages: conversation,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs,
      });
      const log = (result: string) =>
        console.info(`[agents] role=${role} model=${model} attempt=${attempt} result=${result} ms=${Date.now() - started}`);

      // خطای شبکه، سهمیه یا timeout به JSON ربطی ندارد؛ تکرار با همان مدل معمولاً همان خطا را می‌دهد.
      if (!reply.ok) {
        log(reply.status ? `${reply.error}(${reply.status})` : reply.error);
        lastError = reply.error;
        break;
      }

      const extracted = extractJson(reply.content);
      const parsed = extracted.ok ? schema.safeParse(extracted.value) : undefined;
      if (parsed?.success) {
        log("ok");
        return { ok: true, data: parsed.data, demo: false, model };
      }

      log(parsed ? "invalid" : "no_json");
      lastError = "invalid_output";
      conversation.push(
        { role: "assistant", content: reply.content },
        { role: "user", content: correctionMessage(parsed ? z.prettifyError(parsed.error) : NO_JSON_FOUND) },
      );
    }
  }
  return { ok: false, error: lastError };
}
