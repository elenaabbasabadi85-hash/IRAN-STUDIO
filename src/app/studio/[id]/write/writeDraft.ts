// The write page's logic without any UI: the request to the writer agent, the check before saving,
// and which field each problem belongs to. Kept apart from the components so each reads on its own.
import { z } from "zod";
import { WRITER_LIMITS, writerOutputSchema, type AgentErrorResponse, type AgentResponse } from "@/agents/schemas";
import { collapseSpaces, normalizeHashtag } from "@/agents/writerRules";
import type { ChannelProfile, IdeaCard, PublishKit, Script } from "@/core/types";
import t from "./strings.fa.json";

const digits = new Intl.NumberFormat("fa-IR");

// Fills {name} placeholders, numbers in Persian digits. A local copy of format in
// src/i18n/format.ts, like the script page's, so this page does not depend on the Platform lane's file.
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) return placeholder;
    return typeof value === "number" ? digits.format(value) : value;
  });
}

/** The four texts the writer agent writes and this page edits. chosenTitle and chapters belong to other steps. */
export type Texts = Omit<PublishKit, "chosenTitle" | "chapters">;

export function textsOf(kit: PublishKit): Texts {
  return { titles: kit.titles, coverTexts: kit.coverTexts, description: kit.description, hashtags: kit.hashtags };
}

const listsDiffer = (a: string[], b: string[]) => a.length !== b.length || a.some((text, i) => text !== b[i]);

/** True when any text differs: a title, a cover text, the description or a hashtag. */
export function textsDiffer(a: Texts, b: Texts): boolean {
  return (
    a.description !== b.description ||
    listsDiffer(a.titles, b.titles) ||
    listsDiffer(a.coverTexts, b.coverTexts) ||
    listsDiffer(a.hashtags, b.hashtags)
  );
}

// The server already checked the texts (output guardrail). This check only keeps the page from
// breaking on a response it does not expect, such as an error page from the host.
const textsResponseSchema = z.object({
  data: z.object({
    titles: z.array(z.string()).min(1),
    coverTexts: z.array(z.string()).min(1),
    description: z.string(),
    hashtags: z.array(z.string()),
  }),
  demo: z.boolean(),
}) satisfies z.ZodType<Pick<AgentResponse<"writer">, "data" | "demo">>;

const errorResponseSchema = z.object({ error: z.string().trim().min(1) }) satisfies z.ZodType<AgentErrorResponse>;

type TextsResult = { ok: true; texts: Texts; demo: boolean } | { ok: false; message: string };

/** Throws only when the network fails or the request is aborted; every server answer becomes a result. */
export async function requestTexts(
  channel: ChannelProfile,
  idea: IdeaCard,
  script: Script,
  signal: AbortSignal,
): Promise<TextsResult> {
  const response = await fetch("/api/agents/writer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The server checks both again with writerInputSchema and gives the model only the chosen hook.
    body: JSON.stringify({ channel, input: { idea, script } }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorResponseSchema.safeParse(body);
    return { ok: false, message: failure.success ? failure.data.error : t.errors.unreadable };
  }
  const parsed = textsResponseSchema.safeParse(body);
  return parsed.success
    ? { ok: true, texts: parsed.data.data, demo: parsed.data.demo }
    : { ok: false, message: t.errors.unreadable };
}

// "form" is anything the page has no field for, such as a list of the wrong length in saved data.
export type FieldKey = `title-${number}` | `cover-${number}` | "description" | `hashtag-${number}` | "form";
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** The fields in page order, so focus can move to the first one with a problem. */
export function fieldOrder(texts: Texts): FieldKey[] {
  return [
    ...texts.titles.map((_, i): FieldKey => `title-${i}`),
    ...texts.coverTexts.map((_, i): FieldKey => `cover-${i}`),
    "description",
    ...texts.hashtags.map((_, i): FieldKey => `hashtag-${i}`),
  ];
}

type Issue = z.ZodError["issues"][number];

// A rule on one item. The only refine on an item is the cover text's word count.
function itemMessage(issue: Issue): string {
  if (issue.code === "too_big") return t.form.tooLong;
  if (issue.code === "custom") return fill(t.covers.tooManyWords, { max: WRITER_LIMITS.coverWords });
  return t.form.required;
}

// The list rules (no duplicates, a cover text that is not a title) name only the list, not the item.
// This finds the items, comparing with the same collapseSpaces as the schema, so each message can sit
// next to its own field. `seen` starts with the texts a list must also differ from (titles, for covers).
// Empty items are skipped: they have their own message, and an empty hashtag is simply dropped.
function repeats(texts: string[], seen = new Set<string>()): number[] {
  const found: number[] = [];
  texts.forEach((text, i) => {
    const key = collapseSpaces(text);
    if (!key) return;
    if (seen.has(key)) found.push(i);
    else seen.add(key);
  });
  return found;
}

function placeIssue(issue: Issue, draft: Texts, errors: FieldErrors): void {
  // The first message for a field wins, so the most basic problem shows first.
  const set = (key: FieldKey, message: string) => {
    errors[key] ??= message;
  };
  const [field, index] = issue.path;

  if (field === "description") return set("description", itemMessage(issue));
  if (typeof index === "number") {
    if (field === "titles") return set(`title-${index}`, itemMessage(issue));
    if (field === "coverTexts") return set(`cover-${index}`, itemMessage(issue));
    if (field === "hashtags") return set(`hashtag-${index}`, itemMessage(issue));
  }

  // From here on the issue is about a whole list.
  if (issue.code === "custom") {
    if (field === "titles") {
      const found = repeats(draft.titles);
      found.forEach((i) => set(`title-${i}`, t.titles.duplicate));
      if (found.length > 0) return;
    }
    if (field === "coverTexts") {
      const titles = new Set(draft.titles.map(collapseSpaces));
      const found = repeats(draft.coverTexts, new Set(titles));
      found.forEach((i) =>
        set(`cover-${i}`, titles.has(collapseSpaces(draft.coverTexts[i])) ? t.covers.sameAsTitle : t.covers.duplicate),
      );
      if (found.length > 0) return;
    }
    if (field === "hashtags") {
      // Compared the way the schema does: after the leading # goes and spaces become _.
      const found = repeats(draft.hashtags.map(normalizeHashtag));
      found.forEach((i) => set(`hashtag-${i}`, t.hashtags.duplicate));
      if (found.length > 0) return;
    }
  }
  // Too few hashtags once the empty ones are dropped: ask for one of the empty fields to be filled.
  if (field === "hashtags" && issue.code === "too_small") {
    const empty = draft.hashtags.findIndex((tag) => !normalizeHashtag(tag));
    if (empty >= 0) return set(`hashtag-${empty}`, fill(t.hashtags.tooFew, { min: Number(issue.minimum) }));
  }
  set("form", t.form.invalid);
}

type Checked = { ok: true; texts: Texts } | { ok: false; errors: FieldErrors };

// چرا همان اسکیمای Zod دستیار؟ متن ویرایش‌شده باید دقیقاً همان قاعده‌هایی را داشته باشد که خروجی مدل
// داشت (محافظ ورودی): طول، تعداد کلمه، تکراری نبودن، کاوری که عنوان نیست و هشتگ مرتب‌شده. هیچ قاعده‌ای
// این‌جا کپی نشده؛ اگر روزی حدی در src/agents/schemas.ts عوض شود، این صفحه هم خودبه‌خود عوض می‌شود.
/** Checks the edited texts; on success returns them as the schema leaves them: trimmed, hashtags normalized. */
export function checkTexts(draft: Texts): Checked {
  const parsed = writerOutputSchema.safeParse(draft);
  if (parsed.success) return { ok: true, texts: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) placeIssue(issue, draft, errors);
  return { ok: false, errors };
}
