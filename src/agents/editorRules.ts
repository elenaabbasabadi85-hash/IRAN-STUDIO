// The editor's rules in code: which parts of a script the model sees, which of its suggestions can be
// placed, applying the ones the user accepts, and letters and number words to warn about. No server-only
// code, no Zod and no "@/" imports, so the editor page can use the same functions and plain node can run
// the test.
//
// چرا مدل فقط پیشنهاد می‌دهد و کد اعمال می‌کند؟ متنی که مدل از نو بنویسد ممکن است بی‌صدا جمله‌ای را
// بیندازد یا عوض کند. با from → to هر تغییر کوچک و دیدنی است و یوتیوبر تک‌تک تصمیم می‌گیرد.
import type { Script, ScriptSection } from "../core/types";

/** Only what is spoken or shown; the route's checked input (no ids, no times) fits it too. */
export type SpokenScript = Pick<Script, "hooks" | "chosenHook" | "cta"> & {
  sections: Pick<ScriptSection, "title" | "text">[];
};

/** One labelled part of the script, as the model sees it. */
export interface ScriptPart {
  key: string;
  text: string;
}

/** One suggestion of the editor agent. */
export interface EditSuggestion {
  id: string;
  /** The key of the part it changes, e.g. "text-2". */
  part: string;
  /** Copied exactly from that part. */
  from: string;
  to: string;
  reason: string;
}

/** "hook", "cta", or "title-N" / "text-N" with N counted from 1. No g flag: Zod tests with it too. */
export const PART_KEY = /^(?:hook|cta|(title|text)-([1-9]\d?))$/;

export type PartPlace = { kind: "hook" } | { kind: "cta" } | { kind: "title" | "text"; section: number };

// چرا فقط این بخش‌ها؟ فقط همین‌ها گفته یا دیده می‌شوند: تله‌پرامپتر قلاب، متن بخش‌ها و cta را می‌خواند
// و اسلایدهای حالت بدون چهره قلاب، عنوان بخش‌ها و cta را نشان می‌دهند؛ دو قلاب دیگر فقط توکن هدر می‌دهند.
// قلاب انتخاب‌شده، یا اگر انتخاب نشده اولی: همان قاعده‌ی scriptToPrompterText در
// src/video/record/scriptText.ts؛ این کپی محلی باید با آن هم‌گام بماند.
/** The chosen hook, each section's title and text, then the cta, in the order they are said. */
export function scriptParts(script: SpokenScript): ScriptPart[] {
  return [
    { key: "hook", text: script.hooks[script.chosenHook ?? 0] ?? "" },
    ...script.sections.flatMap((section, i) => [
      { key: `title-${i + 1}`, text: section.title },
      { key: `text-${i + 1}`, text: section.text },
    ]),
    { key: "cta", text: script.cta },
  ];
}

/** Where a key points in a Script (a section counted from 0); null when it is not a key. */
export function partPlace(key: string): PartPlace | null {
  const match = PART_KEY.exec(key);
  if (!match) return null;
  const [, kind, number] = match;
  if (kind === "title" || kind === "text") return { kind, section: Number(number) - 1 };
  return { kind: key as "hook" | "cta" };
}

/** The runs of digits of a text, in order, in any script: «1,500 و ۲» gives ["1", "500", "۲"]. */
function digitRuns(text: string): string[] {
  return text.match(/\p{Nd}+/gu) ?? [];
}

/** True when both texts have the same runs of digits, in the same order, character by character. */
function sameDigits(from: string, to: string): boolean {
  const a = digitRuns(from);
  const b = digitRuns(to);
  return a.length === b.length && a.every((run, i) => run === b[i]);
}

type Placeable = Pick<EditSuggestion, "part" | "from" | "to">;

/** The usable suggestions, in order, with where each `from` sits in its part. */
function place<T extends Placeable>(script: SpokenScript, suggestions: T[]) {
  const texts = new Map(scriptParts(script).map((part) => [part.key, part.text]));
  const placed: { suggestion: T; start: number; end: number }[] = [];
  for (const suggestion of suggestions) {
    const { part, from, to } = suggestion;
    // رقم‌ها هرگز عوض نمی‌شوند (تصمیم تیم)، حتی فقط شکلشان («10» به «۱۰»): عدد غلط در ویدیو اعتبار
    // یوتیوبر را می‌برد و مدل همیشه به پرامپت گوش نمی‌دهد، پس کد هم می‌سنجد. هر دنباله‌ی رقم جدا و به
    // ترتیب سنجیده می‌شود، پس چسباندن یا جدا کردن عددها («۲ ۳» به «۲۳»، «1,500» به «1500») هم رد می‌شود.
    if (!sameDigits(from, to)) continue;
    const text = texts.get(part);
    if (text === undefined) continue;
    // چرا دقیقاً یک بار؟ اگر پیدا نشود، مدل نقل‌قول را عوض کرده؛ اگر دو بار پیدا شود، نمی‌دانیم منظور
    // کدام است. در هر دو حالت پیشنهاد کنار می‌رود و هیچ حدسی زده نمی‌شود. start + 1 تکرار هم‌پوشان را هم می‌گیرد.
    const start = text.indexOf(from);
    if (start === -1 || text.indexOf(from, start + 1) !== -1) continue;
    const end = start + from.length;
    // دو تغییر روی یک تکه با هم جور نمی‌شوند؛ اولی می‌ماند.
    if (placed.some((other) => other.suggestion.part === part && other.start < end && start < other.end)) continue;
    placed.push({ suggestion, start, end });
  }
  return placed;
}

/** The suggestions code can place: same runs of digits, `from` found exactly once in its part, no overlap with an earlier one. */
export function usableSuggestions<T extends Placeable>(script: SpokenScript, suggestions: T[]): T[] {
  return place(script, suggestions).map(({ suggestion }) => suggestion);
}

/** A new Script with the accepted suggestions applied; ids, times and the original Script stay as they are. */
export function applySuggestions(script: Script, accepted: Placeable[]): Script {
  const result: Script = {
    ...script,
    hooks: [...script.hooks],
    sections: script.sections.map((section) => ({ ...section })),
  };
  // From right to left, so a change never moves the start of another one in the same part.
  const placed = place(script, accepted).sort((a, b) => b.start - a.start);
  for (const { suggestion, start, end } of placed) {
    const edit = (text: string) => text.slice(0, start) + suggestion.to + text.slice(end);
    const where = partPlace(suggestion.part);
    if (where?.kind === "hook") {
      const i = result.chosenHook ?? 0;
      result.hooks[i] = edit(result.hooks[i]);
    } else if (where?.kind === "cta") {
      result.cta = edit(result.cta);
    } else if (where) {
      const section = result.sections[where.section];
      section[where.kind] = edit(section[where.kind]);
    }
  }
  return result;
}

// چرا فقط هشدار و نه درست کردن؟ حرف روسی در «пыریده» یعنی کلمه خراب شده، ولی کلمه‌ی درست را فقط خود
// یوتیوبر می‌داند؛ هر حدسی ممکن است معنی را عوض کند. Script_Extensions، تا کشیده‌ی «ـ» هم فارسی حساب شود.
// رقم، نشانه، نیم‌فاصله و ایموجی حرف (\p{L}) نیستند و هیچ‌وقت گزارش نمی‌شوند.
const FOREIGN_LETTER = /(?![\p{scx=Arabic}\p{scx=Latin}])\p{L}/gu;

/** Letters that are neither Persian/Arabic nor Latin, such as «пы» in «пыریده», with where each one is. */
export function foreignLetters(text: string): { index: number; letter: string }[] {
  return Array.from(text.matchAll(FOREIGN_LETTER), (match) => ({ index: match.index, letter: match[0] }));
}

// چرا رقم قاعده است ولی عدد نوشته‌شده فقط هشدار؟ رقم را کد مطمئن می‌شناسد، پس پیشنهادی که رقمی را عوض
// کند بی‌چون‌وچرا کنار می‌رود. ولی کلمه‌ها دوپهلو هستند: «نه» هم «نُه» است هم «نه»، و «یه» همان «یک» است.
// کد نمی‌تواند مطمئن باشد، پس فقط هشدار می‌دهد و یوتیوبر تصمیم می‌گیرد؛ هشدار بی‌جا اشکالی ندارد.
const NUMBER_WORDS = [
  "صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده",
  "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده",
  "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود",
  "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد",
  "هزار", "میلیون", "میلیارد", "نیم", "ربع",
];
const ORDINALS = ["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم", "نهم", "دهم"];
const TIME_UNITS = ["ثانیه", "دقیقه", "ساعت", "روز", "هفته", "ماه", "سال"];

const COUNTED = new Set([...NUMBER_WORDS, ...ORDINALS, ...ORDINALS.map((word) => `${word}ین`), ...TIME_UNITS]);

// شکل گفتاری همان کلمه حساب می‌شود، تا پیشنهاد لحن («یک» به «یه») هشدار نگیرد.
const SPOKEN: Record<string, string> = {
  یه: "یک",
  شیش: "شش",
  پونزده: "پانزده",
  شونزده: "شانزده",
  هیفده: "هفده",
  هیجده: "هجده",
  پونصد: "پانصد",
};

// یک کلمه: حرف، اعراب و نیم‌فاصله، پس «می‌ده» یک کلمه است و هیچ‌وقت «ده» خوانده نمی‌شود.
const WORD = /[\p{L}\p{M}\u200C]+/gu;

// What this does not catch: a number written without its half-space («دوتا»), other units («دهه»،
// «درصد»), or a number word changed into digits (digits are their own rule). «سه‌شنبه» counts as «سه»,
// and «نه» (no) as «نه» (nine): a false warning is fine, the user decides.
/** The number words and time units of a text, in their written form, sorted: «یه ساعت و سه‌تا» gives ["ساعت", "سه", "یک"]. */
function numberWords(text: string): string[] {
  const found: string[] = [];
  for (const [word] of text.matchAll(WORD)) {
    // A listed word, or a listed word followed by a half-space and more letters («سه‌تا»، «دقیقه‌ای»).
    const head = word.split("\u200C")[0];
    const written = SPOKEN[head] ?? head;
    if (COUNTED.has(written)) found.push(written);
  }
  return found.sort();
}

/** True when the number words or time units of `from` and `to` differ, compared as multisets. */
export function changesNumberWords(from: string, to: string): boolean {
  const a = numberWords(from);
  const b = numberWords(to);
  return a.length !== b.length || a.some((word, i) => word !== b[i]);
}
