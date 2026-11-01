// Plain assertions, no test framework: run with `node src/video/cover/cover.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import { MAX_COVER_CHARS, clampCoverText, fitText, usesDisplayFont, wrapLines } from "./wrap.ts";

// Every character is 10 units wide at any size, so widths are easy to work out.
/** @param {string} line */
const fixed = (line) => line.length * 10;
// Every character is as wide as the font size.
/** @param {string} line @param {number} size */
const scaled = (line, size) => line.length * size;

const options = { maxWidth: 100, maxLines: 3, maxSize: 20, minSize: 5, step: 5 };

// Words stay together until the next one would pass the width.
{
  assert.deepEqual(wrapLines("سلام به همه", 100, fixed), ["سلام به", "همه"]);
  assert.deepEqual(wrapLines("سلام", 100, fixed), ["سلام"]);
  assert.deepEqual(wrapLines("یک دو سه", 80, fixed), ["یک دو سه"], "exactly the width still fits");
}

// Extra spaces go, and empty text gives no lines.
{
  assert.deepEqual(wrapLines("  سلام   به\tهمه  ", 1000, fixed), ["سلام به همه"]);
  assert.deepEqual(wrapLines("", 100, fixed), []);
  assert.deepEqual(wrapLines("  \n ", 100, fixed), []);
}

// The user's own line breaks are kept; blank lines are not.
{
  assert.deepEqual(wrapLines("یک\nدو\r\n\nسه", 1000, fixed), ["یک", "دو", "سه"]);
}

// A word is never split, even when it is wider than the line.
{
  assert.deepEqual(wrapLines("الف خیلی‌خیلی‌خیلی‌طولانی ب", 50, fixed), ["الف", "خیلی‌خیلی‌خیلی‌طولانی", "ب"]);
}

// A zero-width non-joiner does not break a word.
{
  assert.deepEqual(wrapLines("صفحه‌ی اصلی", 60, fixed), ["صفحه‌ی", "اصلی"]);
}

// The largest size that fits is chosen.
{
  assert.deepEqual(fitText("سلام", scaled, options), { size: 20, lines: ["سلام"] }, "4 × 20 = 80 fits at once");
  assert.deepEqual(fitText("دوستان خوبم", scaled, options), { size: 15, lines: ["دوستان", "خوبم"] }, "6 × 20 does not fit, 6 × 15 does");
}

// The font shrinks when the text needs more than the allowed lines.
{
  const text = "یک دو سه چهار پنج";
  assert.equal(wrapLines(text, 100, (line) => scaled(line, 20)).length, 4);
  const fitted = fitText(text, scaled, options);
  assert.equal(fitted.size, 10);
  assert.deepEqual(fitted.lines, ["یک دو سه", "چهار پنج"]);
}

// When nothing fits it stops at the smallest size and the maximum number of lines.
{
  const fitted = fitText("یک دو سه چهار", scaled, { ...options, maxWidth: 12, minSize: 5 });
  assert.equal(fitted.size, 5);
  assert.equal(fitted.lines.length, 3);
  const wide = fitText("خیلی‌خیلی‌طولانی", scaled, { ...options, maxWidth: 10 });
  assert.deepEqual(wide, { size: 5, lines: ["خیلی‌خیلی‌طولانی"] }, "a lone wide word stays whole");
}

// Empty text fits at the largest size, with nothing to draw.
{
  assert.deepEqual(fitText("", scaled, options), { size: 20, lines: [] });
}

// Suggested texts are cut at a space, not in the middle of a word.
{
  assert.equal(clampCoverText("  سلام  "), "سلام");
  assert.equal(clampCoverText("یک دو سه", 8), "یک دو سه");
  assert.equal(clampCoverText("یک دو سه چهار", 8), "یک دو سه", "the next character is a space");
  assert.equal(clampCoverText("یک دو سه‌چهار", 8), "یک دو");
  assert.equal(clampCoverText("خیلی‌خیلی‌طولانی", 4), "خیلی", "no space to cut at");
  const long = Array.from({ length: 40 }, () => "کلمه").join(" ");
  assert.ok(clampCoverText(long).length <= MAX_COVER_CHARS);
}

// The display font is only for text of at most 4 words.
{
  assert.equal(usesDisplayFont(""), true);
  assert.equal(usesDisplayFont("یک دو سه چهار"), true, "exactly 4 words");
  assert.equal(usesDisplayFont("یک دو سه چهار پنج"), false, "5 words");
  assert.equal(usesDisplayFont("  یک   دو\nسه\tچهار  "), true, "any run of spaces or a line break is one gap");
  assert.equal(usesDisplayFont("صفحه‌ی دو سه چهار"), true, "a zero-width non-joiner does not start a word");
}

console.log("cover tests passed");
