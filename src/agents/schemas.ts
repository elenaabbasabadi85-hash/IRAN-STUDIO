// Zod schemas for agent requests, inputs and outputs, plus the response types of POST /api/agents/<role>.
// No server-only code here, so studio pages can import these types later.
//
// چرا Zod؟ پاسخ مدل فقط متن است و TypeScript فقط هنگام کامپایل بررسی می‌کند، نه هنگام اجرا.
// Zod شکل داده را هنگام اجرا بررسی می‌کند، پیام خطای دقیقی می‌دهد که می‌شود برای اصلاح به خود مدل
// برگرداند، و از همین اسکیما JSON Schema می‌سازد تا به مدل بگوییم دقیقاً چه شکلی می‌خواهیم.
// یک منبع حقیقت برای هر سه کار: اعتبارسنجی، پیام خطا و دستور به مدل.
import { z } from "zod";
import type { ChannelProfile, IdeaCard, PublishKit, Script, ScriptSection } from "@/core/types";
import { PART_KEY, scriptParts, type EditSuggestion } from "@/agents/editorRules";
import { estimateSeconds, scriptTarget } from "@/agents/scriptTiming";
import { allDifferent, collapseSpaces, coverWordCount, normalizeHashtag } from "@/agents/writerRules";

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

// سناریویی که انسان تأیید کرده، برای نویسنده و ویراستار، با همان اسکیماها و همان حدها؛ هیچ حدی شل نمی‌شود.
// قلاب‌ها و cta خود اسکیمای خروجی سناریو هستند، پس از آن جدا نمی‌شوند. بخش‌ها از scriptSectionDraftSchema
// می‌آیند، چون transform خروجی سناریو شناسه‌ی تازه می‌سازد. z.object کلیدهای اضافه را دور می‌ریزد:
// id، estSeconds و edited سناریو (و در ورودی نویسنده، id و references ایده).
const approvedScriptSchema = z.object({
  hooks: scriptOutputSchema.shape.hooks,
  chosenHook: z.number().int().min(0).max(HOOK_COUNT - 1).optional(),
  sections: z.array(scriptSectionDraftSchema).min(SECTION_COUNT.min).max(SECTION_COUNT.max),
  cta: scriptOutputSchema.shape.cta,
});

// ورودی نویسنده: ایده و سناریویی که انسان تأیید کرده.
export const writerInputSchema = z.object({
  idea: ideaDraftSchema,
  script: approvedScriptSchema,
});

// چرا دقیقاً پنج عنوان؟ مثل ایده‌ها: آن‌قدر تنوع که یوتیوبر میان پرسش، فایده، تضاد، آموزش و کنجکاوی
// انتخاب واقعی داشته باشد، و آن‌قدر کم که سریع خوانده شود. چرا سه متن کاور؟ کاور کنار عنوان انتخاب‌شده
// می‌نشیند؛ سه گزینه انتخاب واقعی است و هر سه با یک نگاه خوانده می‌شوند.
// اگر این عددها عوض شدند، prompts/writer.md را هم عوض کن.
const TITLE_COUNT = 5;
const COVER_COUNT = 3;
// کمینه‌ی سه: یوتیوب سه هشتگ اول را بالای عنوان نشان می‌دهد. بیشینه‌ی ده: یوتیوب با بیشتر از ۱۵ هشتگ همه
// را نادیده می‌گیرد، و ده جا می‌گذارد تا یوتیوبر هشتگ‌های ثابت کانالش را هم اضافه کند.
const HASHTAG_COUNT = { min: 3, max: 10 } as const;
// عنوان و کاور سخت‌گیرند، چون قاعده‌ی برندند: یوتیوب عنوان بلندتر از ۶۰ نویسه را در جست‌وجو کوتاه می‌کند،
// فونت نمایشی کاور فقط تا چهار کلمه مجاز است و سازنده‌ی کاور بیشتر از MAX_COVER_CHARS در
// src/video/cover/wrap.ts را نگه نمی‌دارد. توضیحات و هشتگ دست‌ودل‌بازند، چون هر تلاش دوباره یک درخواست از
// سهمیه‌ی رایگان است؛ از سقف ۵۰۰۰ یوتیوب هم برای فصل‌ها و لینک‌های خود یوتیوبر جا می‌ماند.
export const WRITER_LIMITS = {
  title: 60,
  coverChars: 60,
  coverWords: 4,
  description: 2000,
  hashtag: 40,
} as const;

// مثل ایده و سناریو: قاعده‌های شمردنی را کد می‌سنجد و قضاوت («عنوان ارزش کلیک دارد؟»، «کاور حرف تازه‌ای
// می‌زند؟») در پرامپت می‌ماند. چرا فصل نه؟ این دستیار پیش از ضبط اجرا می‌شود و زمان واقعی بخش‌ها را
// نمی‌داند؛ فصل‌ها بعداً از زمان‌های رونوشت ویدیو ساخته می‌شوند. chosenTitle را هم انسان در صفحه‌ی انتشار
// انتخاب می‌کند. اگر مدل هر کدام را بفرستد، z.object دورش می‌ریزد.
export const writerOutputSchema = z
  .object({
    titles: z
      .array(
        z.string().trim().min(1).max(WRITER_LIMITS.title, {
          message: `هر عنوان حداکثر ${WRITER_LIMITS.title} نویسه باشد؛ کوتاه‌ترش کن و کلمه‌ی مهم را اول بیاور.`,
        }),
      )
      .length(TITLE_COUNT)
      .refine(allDifferent, { message: "عنوان‌ها نباید تکراری باشند؛ عنوان تکراری را با عنوانی از نوع دیگر عوض کن." }),
    // چرا شمردن کلمه در کد؟ مدل در شمردن قابل‌اعتماد نیست و کاور پنج‌کلمه‌ای قاعده‌ی برند را می‌شکند.
    coverTexts: z
      .array(
        text(WRITER_LIMITS.coverChars).refine((cover) => coverWordCount(cover) <= WRITER_LIMITS.coverWords, {
          message: `هر متن کاور حداکثر ${WRITER_LIMITS.coverWords} کلمه باشد؛ کوتاه‌ترش کن.`,
        }),
      )
      .length(COVER_COUNT)
      .refine(allDifferent, { message: "متن‌های کاور نباید تکراری باشند؛ متن تکراری را با حرف تازه‌ای عوض کن." }),
    description: text(WRITER_LIMITS.description),
    // چرا هشتگ را کد مرتب می‌کند؟ مدل گاهی # یا فاصله می‌گذارد. درست کردنش هزینه‌ای ندارد، ولی رد کردنش
    // یک درخواست از سهمیه‌ی رایگان است؛ شکل ذخیره‌شده هم همانی می‌شود که صفحه‌ی انتشار نشان می‌دهد.
    // تکرار بعد از مرتب کردن («#یوتیوب» و «یوتیوب») تکرار واقعی است و رد می‌شود. کمینه را دوباره
    // می‌سنجیم، چون هشتگی که فقط # بود حذف می‌شود. pipe، نه preprocess: با io: "input" سمت ورودی pipe در
    // JSON Schema می‌آید و مدل تعداد و طول را می‌بیند؛ preprocess را JSON Schema نمی‌تواند نشان دهد.
    hashtags: z
      .array(z.string().max(WRITER_LIMITS.hashtag))
      .min(HASHTAG_COUNT.min)
      .max(HASHTAG_COUNT.max)
      .transform((tags) => tags.map(normalizeHashtag).filter(Boolean))
      .pipe(
        z
          .array(z.string())
          .min(HASHTAG_COUNT.min, { message: `دست‌کم ${HASHTAG_COUNT.min} هشتگ غیرخالی بنویس.` })
          .refine(allDifferent, { message: "هشتگ‌ها نباید تکراری باشند؛ هشتگ تکراری را با هشتگی مشخص‌تر عوض کن." }),
      ),
  })
  // چرا در کد؟ بیننده کاور و عنوان را کنار هم می‌بیند، پس کاوری که همان عنوان است هیچ چیزی اضافه نمی‌کند.
  // یکسان بودن را کد مطمئن می‌سنجد (بعد از trim و یکی کردن فاصله‌ها)؛ «حرف تازه» قضاوت است و در پرامپت می‌ماند.
  .refine(
    ({ titles, coverTexts }) => {
      const sameAsTitle = new Set(titles.map(collapseSpaces));
      return coverTexts.every((cover) => !sameAsTitle.has(collapseSpaces(cover)));
    },
    { path: ["coverTexts"], message: "متن کاور نباید همان عنوان باشد؛ چیزی بنویس که عنوان نمی‌گوید." },
  );

type WriterOutput = z.output<typeof writerOutputSchema>;

// chosenTitle and chapters are optional in PublishKit and stay unset, so the output is assignable to it, not the same.
export const publishKitMatchesContract: [WriterOutput] extends [PublishKit] ? true : false = true;

// ورودی ویراستار: سناریویی که انسان تأیید کرده؛ به مدل فقط بخش‌های گفتنی و دیدنی می‌رسد (agentInputs).
export const editorInputSchema = z.object({ script: approvedScriptSchema });

// چرا حداکثر ۲۰؟ یوتیوبر هر پیشنهاد را جدا می‌خواند و تصمیم می‌گیرد؛ ۲۰ پیشنهاد کمتر از دو دقیقه کار است
// و در maxTokens هم جا می‌شود. فهرست خالی درست است: متن ممکن است از قبل یکدست باشد.
// اگر این عدد عوض شد، prompts/editor.md را هم عوض کن.
const SUGGESTION_MAX = 20;
// آن‌قدر دست‌ودل‌باز که مدل رایگانِ کمی پرحرف رد نشود، و آن‌قدر سخت‌گیر که پیشنهاد نتواند یک پاراگراف
// بازنویسی‌شده باشد. from حدود ۱۳ تا ۱۵ کلمه جا دارد، تا با کلمه‌های کناری در بخشش یکتا شود؛ to کمی بلندتر
// است، چون در کانال رسمی فعل‌ها بلندتر می‌شوند («می‌ده» ← «می‌دهد»). part را الگوی PART_KEY محدود می‌کند.
export const EDITOR_LIMITS = {
  from: 80,
  to: 100,
  reason: 200,
} as const;

const NOT_EMPTY = "from و to نباید خالی باشند؛ اگر چیزی عوض نمی‌شود، آن پیشنهاد را حذف کن.";

// مثل بقیه: قاعده‌های شمردنی را کد می‌سنجد و قضاوت («لحن یکدست‌تر شد؟»، «واقعاً غلط تایپی است؟») در پرامپت
// می‌ماند. این‌که from واقعاً و فقط یک بار در همان بخش هست را این اسکیما نمی‌تواند بسنجد، چون ورودی را
// نمی‌بیند؛ usableSuggestions در src/agents/editorRules.ts آن را می‌سنجد.
const editSuggestionDraftSchema = z
  .object({
    part: z.string().trim().regex(PART_KEY, {
      message: "part باید یکی از کلیدهای پیام کاربر باشد، مثل hook، title-2، text-2 یا cta.",
    }),
    from: z.string().trim().min(1, { message: NOT_EMPTY }).max(EDITOR_LIMITS.from, {
      message: `from حداکثر ${EDITOR_LIMITS.from} نویسه باشد؛ فقط همان کلمه یا چند کلمه‌ای را بیاور که عوض می‌شود.`,
    }),
    to: z.string().trim().min(1, { message: NOT_EMPTY }).max(EDITOR_LIMITS.to, {
      message: `to حداکثر ${EDITOR_LIMITS.to} نویسه باشد؛ فقط جایگزین همان تکه را بنویس، نه کل جمله را.`,
    }),
    reason: z.string().trim().min(1, { message: "برای هر پیشنهاد یک دلیل کوتاه بنویس." }).max(EDITOR_LIMITS.reason, {
      message: `دلیل حداکثر ${EDITOR_LIMITS.reason} نویسه باشد؛ در یک جمله‌ی کوتاه بنویس.`,
    }),
  })
  .refine(({ from, to }) => from !== to, {
    path: ["to"],
    message: "to باید با from فرق داشته باشد؛ اگر چیزی عوض نمی‌شود، آن پیشنهاد را حذف کن.",
  });

export const editorOutputSchema = z.object({
  suggestions: z
    .array(editSuggestionDraftSchema)
    .max(SUGGESTION_MAX, { message: `حداکثر ${SUGGESTION_MAX} پیشنهاد بده؛ فقط مهم‌ترین‌ها را نگه دار.` })
    // شناسه را کد می‌سازد، نه مدل: مدل در ساختن شناسه‌ی یکتا قابل‌اعتماد نیست، و صفحه‌ی ویراستار برای
    // تیک هر پیشنهاد یک شناسه‌ی پایدار لازم دارد.
    .transform((suggestions) => suggestions.map((suggestion) => ({ id: crypto.randomUUID(), ...suggestion }))),
});

// Fails to compile if a suggestion in the response ever drifts from EditSuggestion in src/agents/editorRules.ts.
export const suggestionMatchesRules: Same<z.output<typeof editorOutputSchema>["suggestions"][number], EditSuggestion> =
  true;

// The agents the route accepts. A role is added here together with its prompt in prompts/ and its
// sample in fixtures/; runAgent fails to compile until all three exist.
export const agentSchemas = {
  test: testOutputSchema,
  idea: ideaOutputSchema,
  script: scriptOutputSchema,
  writer: writerOutputSchema,
  editor: editorOutputSchema,
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
  // چرا فقط قلاب انتخاب‌شده؟ فقط همین قلاب در ویدیو گفته می‌شود؛ با دو قلاب دیگر، عنوان ممکن است چیزی را
  // قول بدهد که ویدیو نمی‌گوید، و توکن هم هدر می‌رود. قلاب انتخاب‌شده، یا اگر انتخاب نشده اولی: همان قاعده‌ی
  // scriptToPrompterText در src/video/record/scriptText.ts؛ این کپی محلی باید با آن هم‌گام بماند. شناسه و
  // estSeconds بخش‌ها هم نمی‌رسند: این دستیار فصل نمی‌نویسد و تخمین زمان به کارش نمی‌آید.
  writer: inputStep(writerInputSchema, ({ idea, script }) => ({
    idea,
    script: { hook: script.hooks[script.chosenHook ?? 0], sections: script.sections, cta: script.cta },
  })),
  // فقط بخش‌های گفتنی و دیدنی، هر کدام با کلیدی که مدل در part برمی‌گرداند؛ صفحه‌ی ویراستار با همان
  // scriptParts در src/agents/editorRules.ts هر کلید را به همان جای سناریو برمی‌گرداند.
  editor: inputStep(editorInputSchema, ({ script }) => ({
    parts: Object.fromEntries(scriptParts(script).map(({ key, text }) => [key, text])),
  })),
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
