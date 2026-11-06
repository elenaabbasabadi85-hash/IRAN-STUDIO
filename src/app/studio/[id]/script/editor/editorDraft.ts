// The editor page's logic without any UI: labels for each part, the spelling pass, the request to the
// editor agent and the script that approval saves. Kept apart from the components so each reads on its own.
import { z } from "zod";
import { applySuggestions, foreignLetters, partPlace, type EditSuggestion } from "@/agents/editorRules";
import type { AgentErrorResponse, AgentResponse } from "@/agents/schemas";
import type { ChannelProfile, Script } from "@/core/types";
import { normalize } from "@/persian/normalize";
import { checkScript, fill, textsDiffer } from "../scriptDraft";
import t from "./strings.fa.json";
import { wordFixes, type WordFix } from "./wordFixes";

/** Every text of a script with its label, in page order: all three hooks, each section's title and text, the cta. */
function labelledTexts(script: Script): { label: string; text: string }[] {
  return [
    ...script.hooks.map((text, i) => ({ label: fill(t.parts.hookN, { n: i + 1 }), text })),
    ...script.sections.flatMap((section, i) => [
      { label: fill(t.parts.title, { n: i + 1 }), text: section.title },
      { label: fill(t.parts.text, { n: i + 1 }), text: section.text },
    ]),
    { label: t.parts.cta, text: script.cta },
  ];
}

// چرا درست‌نویسی پیش از مدل؟ from هر پیشنهاد باید حرف‌به‌حرف در همان متنی پیدا شود که کد عوضش می‌کند،
// پس مدل باید متن درست‌شده را ببیند. این غلط‌ها هم فقط یک جواب درست دارند: کد رایگان و هر بار یکسان
// درستشان می‌کند و مدل توکنی برای «ی» و نیم‌فاصله خرج نمی‌کند.
/** The script with normalize() on every text; ids, times and the chosen hook stay as they are. */
export function normalizeScript(script: Script): Script {
  return {
    ...script,
    hooks: script.hooks.map((hook) => normalize(hook)),
    sections: script.sections.map((section) => ({
      ...section,
      title: normalize(section.title),
      text: normalize(section.text),
    })),
    cta: normalize(script.cta),
  };
}

export type SpellingFix = WordFix & { label: string };

/** Every fix normalize made, with its part's label, in page order. */
export function spellingFixes(original: Script, fixed: Script): SpellingFix[] {
  const after = labelledTexts(fixed);
  return labelledTexts(original).flatMap(({ label, text }, i) =>
    wordFixes(text, after[i].text).map((fix) => ({ label, ...fix })),
  );
}

/** The space-separated word around `index`. */
function wordAt(text: string, index: number): string {
  const start = text.slice(0, index).search(/\S*$/u);
  const end = index + text.slice(index).search(/\s|$/u);
  return text.slice(start, end);
}

export type ForeignWord = { label: string; word: string };

/** Each word with a foreign letter, once per part, with its part's label. Code never changes them. */
export function foreignWords(script: Script): ForeignWord[] {
  return labelledTexts(script).flatMap(({ label, text }) => {
    const words = new Set(foreignLetters(text).map(({ index }) => wordAt(text, index)));
    return Array.from(words, (word) => ({ label, word }));
  });
}

/** The label of a suggestion's part, such as «متن بخش ۲». */
export function partLabel(key: string): string {
  const place = partPlace(key);
  if (!place) return key;
  if (place.kind === "hook") return t.parts.hook;
  if (place.kind === "cta") return t.parts.cta;
  return fill(t.parts[place.kind], { n: place.section + 1 });
}

/** True when both have the same hooks, chosen hook, sections (id, title, text) and cta. Times and `edited` are left out. */
export function sameScript(a: Script, b: Script): boolean {
  return (
    a.chosenHook === b.chosenHook &&
    a.cta === b.cta &&
    a.hooks.length === b.hooks.length &&
    a.hooks.every((hook, i) => hook === b.hooks[i]) &&
    a.sections.length === b.sections.length &&
    a.sections.every(({ id, title, text }, i) => {
      const other = b.sections[i];
      return id === other.id && title === other.title && text === other.text;
    })
  );
}

// The server already checked the suggestions (output guardrail). This check only keeps the page from
// breaking on a response it does not expect, such as an error page from the host.
const suggestionsResponseSchema = z.object({
  data: z.object({
    suggestions: z.array(
      z.object({ id: z.string().min(1), part: z.string(), from: z.string(), to: z.string(), reason: z.string() }),
    ),
  }),
  demo: z.boolean(),
}) satisfies z.ZodType<Pick<AgentResponse<"editor">, "data" | "demo">>;

const errorResponseSchema = z.object({ error: z.string().trim().min(1) }) satisfies z.ZodType<AgentErrorResponse>;

type SuggestionsResult = { ok: true; suggestions: EditSuggestion[]; demo: boolean } | { ok: false; message: string };

/** Throws only when the network fails or the request is aborted; every server answer becomes a result. */
export async function requestSuggestions(
  channel: ChannelProfile,
  script: Script,
  signal: AbortSignal,
): Promise<SuggestionsResult> {
  const response = await fetch("/api/agents/editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The server checks the script again with editorInputSchema and gives the model only the spoken parts.
    body: JSON.stringify({ channel, input: { script } }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorResponseSchema.safeParse(body);
    return { ok: false, message: failure.success ? failure.data.error : t.errors.unreadable };
  }
  const parsed = suggestionsResponseSchema.safeParse(body);
  return parsed.success
    ? { ok: true, suggestions: parsed.data.data.suggestions, demo: parsed.data.demo }
    : { ok: false, message: t.errors.unreadable };
}

// چرا checkScript صفحه‌ی سناریو؟ «سناریوی درست» برای هر دو صفحه یک تعریف دارد. normalize بعد از «،» فاصله
// می‌گذارد و هر پیشنهاد کمی متن را بلندتر می‌کند، پس متنی ممکن است از حدش بگذرد. checkScript شناسه‌ها را به
// ترتیب نگه می‌دارد و زمان را با همان estimateSeconds حساب می‌کند، پس بخش دست‌نخورده همان عدد قبلی را می‌گیرد.
/** The script approval saves: spelling fixes plus the accepted suggestions; null when a text breaks a limit. */
export function finalScript(stored: Script, fixed: Script, accepted: EditSuggestion[]): Script | null {
  const checked = checkScript(applySuggestions(fixed, accepted));
  if (!checked.ok) return null;
  return { ...checked.script, edited: textsDiffer(checked.script, stored) || stored.edited };
}
