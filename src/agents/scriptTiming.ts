// How long a script runs: the speaking rate, the target length for the script agent, and the time
// of one section. No server-only code and no Zod, so the script page can recompute a section's time
// after the user edits it.

// چرا ۱۲۰؟ نمونه‌ی fixtures/transcript.json ۷۶ کلمه در حدود ۳۸ ثانیه است، با مکث‌های طبیعی میان
// جمله‌ها؛ یعنی حدود ۱۲۰ کلمه در دقیقه. عدد تقریبی است و فقط برای تخمین به کار می‌رود.
export const WORDS_PER_MINUTE = 120;

// چرا سقف؟ سناریو در یک تماس نوشته می‌شود و باید در maxTokens و بودجه‌ی زمان script در
// models.config.ts جا شود. کانالی که ویدیوی بلندتری دارد، یک نسخه‌ی کامل و فشرده در همین طول می‌گیرد.
export const SCRIPT_MAX_MINUTES = 10;

// A half-space (U+200C) is not a space, so «می‌شود» is one word, as in fixtures/transcript.json.
// A piece with no letter or digit (a lone «—» or «؟») is not a word.
const HAS_LETTER = /[\p{L}\p{N}]/u;

function countWords(text: string): number {
  return text.split(/\s+/u).filter((part) => HAS_LETTER.test(part)).length;
}

/** About how long `text` takes to say, in whole seconds. */
export function estimateSeconds(text: string): number {
  return Math.round((countWords(text) * 60) / WORDS_PER_MINUTE);
}

// چرا هدف را کد حساب می‌کند، نه مدل؟ مدل در گرفتن کمینه و ضرب کردن قابل‌اعتماد نیست. این‌طوری
// پرامپت هم هیچ عددی ندارد که بشود فراموش کرد همراه این‌جا عوضش کرد.
/** The length the script agent aims for: the channel's usual length, capped at SCRIPT_MAX_MINUTES. */
export function scriptTarget(avgLengthMin: number): { minutes: number; words: number } {
  const minutes = Math.min(avgLengthMin, SCRIPT_MAX_MINUTES);
  return { minutes, words: minutes * WORDS_PER_MINUTE };
}
