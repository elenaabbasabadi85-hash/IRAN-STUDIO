// Zod schemas for agent requests, inputs and outputs, plus the response types of POST /api/agents/<role>.
// No server-only code here, so studio pages can import these types later.
//
// چرا Zod؟ پاسخ مدل فقط متن است و TypeScript فقط هنگام کامپایل بررسی می‌کند، نه هنگام اجرا.
// Zod شکل داده را هنگام اجرا بررسی می‌کند، پیام خطای دقیقی می‌دهد که می‌شود برای اصلاح به خود مدل
// برگرداند، و از همین اسکیما JSON Schema می‌سازد تا به مدل بگوییم دقیقاً چه شکلی می‌خواهیم.
// یک منبع حقیقت برای هر سه کار: اعتبارسنجی، پیام خطا و دستور به مدل.
import { z } from "zod";
import type { ChannelProfile, IdeaCard, Script, ScriptSection } from "@/core/types";
import { estimateSeconds, scriptTarget } from "@/agents/scriptTiming";

// Mirrors MAX_LENGTH, LENGTH_MIN, LENGTH_MAX and the color rule in src/app/studio/new/schema.ts
// (Platform lane). Copied, not imported, so this lane never depends on another lane's files.
const CHANNEL_LIMITS = {
  name: 80,
  niche: 120,
  audience: 200,
  sampleText: 2000,
  lengthMin: 1,
  lengthMax: 180,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const channelProfileSchema = z.object({
  name: text(CHANNEL_LIMITS.name),
  niche: text(CHANNEL_LIMITS.niche),
  audience: text(CHANNEL_LIMITS.audience),
  tone: z.enum(["formal", "casual", "mixed"]),
  avgLengthMin: z.number().int().min(CHANNEL_LIMITS.lengthMin).max(CHANNEL_LIMITS.lengthMax),
  sampleText: z.string().trim().max(CHANNEL_LIMITS.sampleText).optional(),
  colors: z.object({ primary: color, accent: color }).optional(),
});

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Fails to compile if this schema ever drifts from ChannelProfile in src/core/types.ts.
export const channelMatchesContract: Same<z.output<typeof channelProfileSchema>, ChannelProfile> = true;

export const agentRequestSchema = z.object({
  channel: channelProfileSchema,
  /** What this run works on (e.g. the chosen idea); its shape depends on the agent. */
  input: z.unknown().optional(),
});

export const testOutputSchema = z.object({
  message: z.string().trim().min(1),
});

// چرا دقیقاً پنج؟ آن‌قدر تنوع دارد که یوتیوبر انتخاب واقعی داشته باشد و آن‌قدر کم است که سریع خوانده
// شود و در maxTokens مدل‌های رایگان جا شود. اگر این عدد عوض شد، prompts/idea.md را هم عوض کن.
const IDEA_COUNT = 5;
// کمی دست‌ودل‌باز، تا جوابی که از یک مدل رایگان کمی بلند درآمده کل پاسخ را رد نکند و یک تلاش دوباره
// هزینه نکند؛ فقط جلوی پرحرفی واقعی را می‌گیرند.
export const IDEA_LIMITS = {
  workingTitle: 60,
  angle: 250,
  whyItWorks: 400,
  audience: 150,
} as const;

// چیزی که مدل می‌فرستد: بدون id و بدون references. مدل یوتیوب را نمی‌بیند، پس هر لینک یا عدد
// بازدیدی که بدهد ساختگی است؛ references در IdeaCard اختیاری است و نبودنش قرارداد را نمی‌شکند.
// صفحه‌ی ایده هم ایده‌ی ویرایش‌شده را پیش از ذخیره با همین اسکیما می‌سنجد.
export const ideaDraftSchema = z.object({
  workingTitle: text(IDEA_LIMITS.workingTitle),
  angle: text(IDEA_LIMITS.angle),
  whyItWorks: text(IDEA_LIMITS.whyItWorks),
  audience: text(IDEA_LIMITS.audience),
});

// قاعده‌های شمردنی (تعداد، طول، عنوان تکراری) را کد می‌سنجد، چون مدل در شمردن قابل‌اعتماد نیست و
// پیام خطای Zod در تلاش دوباره به خود مدل برمی‌گردد؛ برای همین پیام refine فارسی و راهنماست.
// قضاوت («زاویه تازه است؟»، «ایده‌ها واقعاً فرق دارند؟») را کد نمی‌تواند بسنجد و در پرامپت می‌ماند.
export const ideaOutputSchema = z.object({
  ideas: z
    .array(ideaDraftSchema)
    .length(IDEA_COUNT)
    .refine((ideas) => new Set(ideas.map((idea) => idea.workingTitle)).size === ideas.length, {
      message: "عنوان کاری ایده‌ها نباید تکراری باشد؛ ایده‌ی تکراری را با ایده‌ای تازه عوض کن.",
    })
    // شناسه را کد می‌سازد، نه مدل: مدل در ساختن شناسه‌ی یکتا قابل‌اعتماد نیست و شناسه‌ی تصادفی
    // با ایده‌های دفعه‌ی بعد هم قاطی نمی‌شود. runAgent برای همین JSON Schema را با io: "input" می‌سازد.
    .transform((ideas) => ideas.map((idea) => ({ id: crypto.randomUUID(), ...idea }))),
});

// Fails to compile if an idea in the response ever drifts from IdeaCard in src/core/types.ts.
export const ideaMatchesContract: Same<z.output<typeof ideaOutputSchema>["ideas"][number], IdeaCard> = true;

// ورودی سناریونویس: ایده‌ای که انسان در صفحه‌ی ایده تأیید کرده، با همان اسکیما و همان حدها. z.object
// کلیدهای اضافه (id و references) را دور می‌ریزد، پس به مدل فقط چهار فیلد ایده می‌رسد.
export const scriptInputSchema = z.object({ idea: ideaDraftSchema });

// چرا دقیقاً سه قلاب؟ بیشترین ریزش مخاطب در ثانیه‌های اول است، پس انتخاب میان سه شروع واقعاً متفاوت
// (پرسش، تضاد، صحنه) ارزش دارد. سه آن‌قدر کم است که یوتیوبر هر سه را بلند امتحان کند و همه در یک
// پاسخ جا شوند. اگر این عدد عوض شد، prompts/script.md را هم عوض کن.
const HOOK_COUNT = 3;
// یک بخش قول ویدیو و دست‌کم دو بخش بدنه؛ بیست بخش برای سقف ده دقیقه با بخش‌های نیم‌دقیقه‌ای هم جا دارد.
const SECTION_COUNT = { min: 3, max: 20 } as const;
// دست‌ودل‌بازتر از ایده‌ها: مدل‌های رایگان پرحرف‌اند و تلاش دوباره برای یک سناریوی بلند حدود یک دقیقه
// طول می‌کشد. sectionText حدود ۶۵۰ کلمه است.
export const SCRIPT_LIMITS = {
  hook: 400,
  sectionTitle: 80,
  sectionText: 4000,
  cta: 400,
} as const;

const scriptSectionDraftSchema = z.object({
  title: text(SCRIPT_LIMITS.sectionTitle),
  text: text(SCRIPT_LIMITS.sectionText),
});

// مثل ایده‌ها: قاعده‌های شمردنی را کد می‌سنجد و قضاوت («قلاب گیراست؟»، «متن گفتنی است؟») در پرامپت می‌ماند.
export const scriptOutputSchema = z.object({
  hooks: z
    .array(text(SCRIPT_LIMITS.hook))
    .length(HOOK_COUNT)
    .refine((hooks) => new Set(hooks).size === hooks.length, {
      message: "قلاب‌ها نباید تکراری باشند؛ قلاب تکراری را با شروعی از نوع دیگر عوض کن.",
    }),
  sections: z
    .array(scriptSectionDraftSchema)
    .min(SECTION_COUNT.min)
    .max(SECTION_COUNT.max)
    // شناسه و زمان را کد می‌سازد، نه مدل: مدل در ساختن شناسه‌ی یکتا و شمردن کلمه قابل‌اعتماد نیست، و
    // صفحه‌ی سناریو بعد از ویرایش با همان estimateSeconds همان عددی را می‌گیرد که سرور داده بود.
    // طول کل را عمداً رد نمی‌کنیم: تخمین تقریبی است و تلاش دوباره برای سناریوی بلند حدود یک دقیقه و یک
    // درخواست از سهمیه‌ی رایگان هزینه دارد. صفحه مجموع را کنار طول معمول کانال نشان می‌دهد و انسان تصمیم می‌گیرد.
    .transform((sections) =>
      sections.map((section) => ({ id: crypto.randomUUID(), ...section, estSeconds: estimateSeconds(section.text) })),
    ),
  cta: text(SCRIPT_LIMITS.cta),
});

type ScriptOutput = z.output<typeof scriptOutputSchema>;

// Fails to compile if a section in the response ever drifts from ScriptSection in src/core/types.ts.
export const sectionMatchesContract: Same<ScriptOutput["sections"][number], ScriptSection> = true;
// chosenHook and edited are optional in Script and stay unset, so the output is assignable to it, not the same.
export const scriptMatchesContract: [ScriptOutput] extends [Script] ? true : false = true;

// The agents the route accepts. A role is added here together with its prompt in prompts/ and its
// sample in fixtures/; runAgent fails to compile until all three exist.
export const agentSchemas = {
  test: testOutputSchema,
  idea: ideaOutputSchema,
  script: scriptOutputSchema,
} as const;

export type AgentRole = keyof typeof agentSchemas;
export type AgentOutput<R extends AgentRole = AgentRole> = z.output<(typeof agentSchemas)[R]>;

export function isAgentRole(value: string): value is AgentRole {
  return Object.hasOwn(agentSchemas, value);
}

/** Checks a role's input and turns it into what the model sees; fails only when the input is invalid. */
type InputStep = (input: unknown, channel: ChannelProfile) => { ok: true; input: unknown } | { ok: false };

// Ties a schema to its prepare function, so `prepare` gets the checked type instead of unknown.
function inputStep<T>(schema: z.ZodType<T>, prepare: (input: T, channel: ChannelProfile) => unknown): InputStep {
  return (input, channel) => {
    const parsed = schema.safeParse(input);
    return parsed.success ? { ok: true, input: prepare(parsed.data, channel) } : { ok: false };
  };
}

// Roles that need an input. The route runs this before the agent, so the model sees only checked
// fields; it stays here, next to agentSchemas, so the route and runAgent never name a role.
// Roles without one (test, idea) get their input unchanged, as before.
export const agentInputs: Partial<Record<AgentRole, InputStep>> = {
  // طول هدف را کد حساب می‌کند و کنار ایده می‌فرستد؛ src/agents/scriptTiming.ts را ببین.
  script: inputStep(scriptInputSchema, ({ idea }, channel) => ({ idea, target: scriptTarget(channel.avgLengthMin) })),
};

export interface AgentResponse<R extends AgentRole = AgentRole> {
  data: AgentOutput<R>;
  /** True when the server has no API key and returned the sample in fixtures. */
  demo: boolean;
  /** The OpenRouter model that answered; null in demo mode. */
  model: string | null;
}

export interface AgentErrorResponse {
  /** Persian message, safe to show to the user. */
  error: string;
}
