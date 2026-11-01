// The script page's logic without any UI: the request to the script agent, the check before
// saving, and the numbers the page shows. Kept apart from the components so each reads on its own.
import { z } from "zod";
import { scriptOutputSchema, type AgentErrorResponse, type AgentResponse } from "@/agents/schemas";
import { estimateSeconds } from "@/agents/scriptTiming";
import type { ChannelProfile, IdeaCard, Script } from "@/core/types";
import t from "./strings.fa.json";

const digits = new Intl.NumberFormat("fa-IR");

// Fills {name} placeholders, numbers in Persian digits. A local copy of format in
// src/i18n/format.ts, so this page does not depend on the Platform lane's file.
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) return placeholder;
    return typeof value === "number" ? digits.format(value) : value;
  });
}

/** A friendly length in whole seconds, such as «حدود ۱ دقیقه و ۲۰ ثانیه». */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return fill(t.time.seconds, { s });
  return fill(s === 0 ? t.time.minutes : t.time.both, { m, s });
}

// چرا زمان کل یک‌جا از همه‌ی متن حساب می‌شود؟ جمع زمان‌های گردشده‌ی هر بخش، خطای گرد کردن را روی هم
// می‌گذارد؛ شمردن یک‌باره‌ی همه‌ی کلمه‌ها همان عددی را می‌دهد که سرور برای کل متن می‌داد.
// The pieces in the teleprompter's order. A local copy keeps this page independent of the Video
// lane's file; it must stay in step with scriptToPrompterText in src/video/record/scriptText.ts.
// Unlike the teleprompter, which falls back to the first hook, no hook counts until one is chosen.
export function totalSeconds(script: Script): number {
  const hook = script.chosenHook === undefined ? "" : script.hooks[script.chosenHook];
  return estimateSeconds([hook, ...script.sections.map((section) => section.text), script.cta].join("\n\n"));
}

/** True when any text differs: a hook, a section's title or text, or the cta. The chosen hook is not text. */
export function textsDiffer(a: Script, b: Script): boolean {
  return (
    a.cta !== b.cta ||
    a.hooks.some((hook, i) => hook !== b.hooks[i]) ||
    a.sections.some((section, i) => section.title !== b.sections[i]?.title || section.text !== b.sections[i]?.text)
  );
}

// The server already checked the script (output guardrail). This check only keeps the page from
// breaking on a response it does not expect, such as an error page from the host.
const scriptResponseSchema = z.object({
  data: z.object({
    hooks: z.array(z.string()).min(1),
    sections: z
      .array(z.object({ id: z.string().min(1), title: z.string(), text: z.string(), estSeconds: z.number() }))
      .min(1),
    cta: z.string(),
  }),
  demo: z.boolean(),
}) satisfies z.ZodType<Pick<AgentResponse<"script">, "data" | "demo">>;

const errorResponseSchema = z.object({ error: z.string().trim().min(1) }) satisfies z.ZodType<AgentErrorResponse>;

type ScriptResult = { ok: true; script: Script; demo: boolean } | { ok: false; message: string };

/** Throws only when the network fails or the request is aborted; every server answer becomes a result. */
export async function requestScript(channel: ChannelProfile, idea: IdeaCard, signal: AbortSignal): Promise<ScriptResult> {
  const response = await fetch("/api/agents/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The server checks the idea again with scriptInputSchema and gives the model only its four texts.
    body: JSON.stringify({ channel, input: { idea } }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorResponseSchema.safeParse(body);
    return { ok: false, message: failure.success ? failure.data.error : t.errors.unreadable };
  }
  const parsed = scriptResponseSchema.safeParse(body);
  return parsed.success
    ? { ok: true, script: parsed.data.data, demo: parsed.data.demo }
    : { ok: false, message: t.errors.unreadable };
}

// "hooks" is the hook group (no hook chosen, or two the same); "form" is anything the page has no field for.
export type FieldKey = "hooks" | `hook-${number}` | `section-${number}-${"title" | "text"}` | "cta" | "form";
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** The fields in page order, so focus can move to the first one with a problem. */
export function fieldOrder(script: Script): FieldKey[] {
  return [
    "hooks",
    ...script.hooks.map((_, i): FieldKey => `hook-${i}`),
    ...script.sections.flatMap((_, i): FieldKey[] => [`section-${i}-title`, `section-${i}-text`]),
    "cta",
  ];
}

type Issue = z.ZodError["issues"][number];

function issueKey(path: Issue["path"]): FieldKey {
  const [field, index, part] = path;
  if (field === "hooks") return typeof index === "number" ? `hook-${index}` : "hooks";
  if (field === "sections" && typeof index === "number" && (part === "title" || part === "text")) {
    return `section-${index}-${part}`;
  }
  return field === "cta" ? "cta" : "form";
}

function issueMessage(key: FieldKey, issue: Issue): string {
  // On the group, a refine (code "custom") means two hooks are the same.
  if (key === "hooks") return issue.code === "custom" ? t.hooks.duplicate : t.form.invalid;
  if (key === "form") return t.form.invalid;
  return issue.code === "too_big" ? t.form.tooLong : t.form.required;
}

type Checked = { ok: true; script: Script } | { ok: false; errors: FieldErrors };

// چرا همان اسکیمای Zod دستیار؟ سناریوی ویرایش‌شده باید همان قاعده‌هایی را داشته باشد که خروجی مدل
// داشت (محافظ ورودی). اگر روزی حدی در src/agents/schemas.ts عوض شود، اینجا هم خودبه‌خود عوض می‌شود.
/** Checks the edited script; on success returns it with trimmed texts, the draft's section ids and fresh times. */
export function checkScript(draft: Script): Checked {
  const errors: FieldErrors = {};
  // Set first, so it wins over a duplicate hook message on the same group.
  if (draft.chosenHook === undefined) errors.hooks = t.hooks.pick;
  // z.object drops the keys the agent never writes (chosenHook, edited, a section's id and estSeconds).
  const parsed = scriptOutputSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issueKey(issue.path);
      errors[key] ??= issueMessage(key, issue);
    }
  }
  if (!parsed.success || draft.chosenHook === undefined) return { ok: false, errors };

  return {
    ok: true,
    script: {
      hooks: parsed.data.hooks,
      chosenHook: draft.chosenHook,
      // The schema's transform makes new ids. Sections never move, so the draft's ids are kept by index.
      sections: parsed.data.sections.map((section, i) => ({
        id: draft.sections[i].id,
        title: section.title,
        text: section.text,
        estSeconds: estimateSeconds(section.text),
      })),
      cta: parsed.data.cta,
    },
  };
}
