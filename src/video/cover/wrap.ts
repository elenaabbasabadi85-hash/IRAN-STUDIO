// Pure text helpers for the cover: no canvas here, the width of a line comes from a callback.

export const MAX_COVER_CHARS = 60;
/** The brand guide allows the display font (Lalezar) for at most this many words. */
export const MAX_DISPLAY_FONT_WORDS = 4;

export interface FitOptions {
  maxWidth: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  step: number;
}

export interface FittedText {
  size: number;
  lines: string[];
}

/** Keeps the first characters of a suggested text, cutting at a space when there is one. */
export function clampCoverText(text: string, max = MAX_COVER_CHARS): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join("");
  const cut = chars.slice(0, max).join("");
  if (/\s/.test(chars[max])) return cut.trimEnd();
  const space = cut.search(/\s\S*$/);
  return (space > 0 ? cut.slice(0, space) : cut).trimEnd();
}

/** A zero-width non-joiner is not a space, so «صفحه‌ی اصلی» is two words. */
export function usesDisplayFont(text: string): boolean {
  return text.split(/\s+/).filter(Boolean).length <= MAX_DISPLAY_FONT_WORDS;
}

/**
 * Greedy wrapping on spaces and on the user's own line breaks. A word is never split, since that
 * would break its Persian letter joins; a word wider than maxWidth gets a line of its own.
 * A zero-width non-joiner is not a space, so «صفحه‌ی» stays one word.
 */
export function wrapLines(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * The largest font size at which the text fits. If even minSize does not fit, it stays at minSize
 * with only the first maxLines lines.
 */
export function fitText(
  text: string,
  measure: (line: string, size: number) => number,
  { maxWidth, maxLines, maxSize, minSize, step }: FitOptions,
): FittedText {
  for (let size = maxSize; size > minSize; size -= step) {
    const width = (line: string) => measure(line, size);
    const lines = wrapLines(text, maxWidth, width);
    if (lines.length <= maxLines && lines.every((line) => width(line) <= maxWidth)) return { size, lines };
  }
  const lines = wrapLines(text, maxWidth, (line) => measure(line, minSize));
  return { size: minSize, lines: lines.slice(0, maxLines) };
}
