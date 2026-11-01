// Plain assertions, no test framework: run with `node src/video/shorts/suggest.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canMoveCrop, shortVideoFilter, SHORT_SIZE } from "./frame.ts";
import {
  MAX_SHORT_SECONDS,
  MAX_SUGGESTIONS,
  MIN_SHORT_SECONDS,
  shortRangeError,
  suggestShorts,
} from "./suggest.ts";

/** One-second words without pauses; every `sentenceEvery`-th word ends a sentence. */
function speech(seconds, sentenceEvery = 5, from = 0) {
  const words = [];
  for (let i = 0; i < seconds; i++) {
    const end = (i + 1) % sentenceEvery === 0 ? "." : "";
    words.push({ w: `کلمه${i}${end}`, start: from + i, end: from + i + 1 });
  }
  return { language: "fa", words };
}

// The demo transcript gives one clip; its last 15 seconds are too short for another.
{
  const demo = JSON.parse(readFileSync(new URL("../../../fixtures/transcript.json", import.meta.url), "utf8"));
  const shorts = suggestShorts(demo, 60);
  assert.equal(shorts.length, 1);
  assert.ok(shorts[0].start >= 0 && shorts[0].start < 1);
  assert.ok(shorts[0].end - shorts[0].start >= MIN_SHORT_SECONDS);
  assert.ok(shorts[0].hook.startsWith("سلام"));
}

// Every suggestion stays within the limits, in order and without overlapping speech.
{
  const shorts = suggestShorts(speech(600), 600);
  assert.equal(shorts.length, MAX_SUGGESTIONS);
  for (const [i, short] of shorts.entries()) {
    const length = short.end - short.start;
    assert.ok(length >= MIN_SHORT_SECONDS && length <= MAX_SHORT_SECONDS, `length ${length}`);
    if (i > 0) assert.ok(short.start >= shorts[i - 1].end - 0.31);
  }
}

// Speech with no punctuation or pauses still breaks into clips no longer than the limit.
{
  const shorts = suggestShorts(speech(200, 1000), 200);
  assert.ok(shorts.length > 0);
  for (const short of shorts) assert.ok(short.end - short.start <= MAX_SHORT_SECONDS);
}

// With more clips than the limit, the densest speech wins and time order is kept.
{
  const slow = speech(25, 5).words.map((w, i) => ({ ...w, start: i * 2, end: i * 2 + 0.5 }));
  const dense = speech(150, 5, 100).words;
  const shorts = suggestShorts({ language: "fa", words: [...slow, ...dense] }, 300);
  assert.equal(shorts.length, MAX_SUGGESTIONS);
  assert.ok(shorts.every((short) => short.start >= 99));
}

// A video shorter than the demo transcript: words past its end are ignored, and times are clamped.
{
  const shorts = suggestShorts(speech(60), 10);
  assert.equal(shorts.length, 1);
  assert.equal(shorts[0].start, 0);
  assert.equal(shorts[0].end, 10);
}

// Speech too short for a full clip still gives one clip.
{
  const shorts = suggestShorts(speech(8, 4), 30);
  assert.equal(shorts.length, 1);
  assert.equal(shorts[0].start, 0);
  assert.equal(shorts[0].end, 8.15);
}

// No speech, or no usable length, gives nothing rather than a crash.
assert.deepEqual(suggestShorts({ language: "fa", words: [] }, 100), []);
assert.deepEqual(suggestShorts(speech(30), 0), []);
assert.deepEqual(suggestShorts(speech(30), 0 / 0), []);

// A long hook is shortened; words with no text are skipped.
{
  const words = Array.from({ length: 30 }, (_, i) => ({ w: i === 0 ? " " : "کلمه‌ی‌طولانی", start: i, end: i + 1 }));
  const [short] = suggestShorts({ language: "fa", words }, 60);
  assert.ok([...short.hook].length <= 81);
  assert.ok(short.hook.endsWith("…"));
  assert.equal(short.start, 0.85);
}

// Typed time ranges.
assert.equal(shortRangeError(10, 40, 100), null);
assert.equal(shortRangeError(0, 60, 100), null);
assert.equal(shortRangeError(40, 10, 100), "order");
assert.equal(shortRangeError(10, 10, 100), "order");
assert.equal(shortRangeError(10, 10.5, 100), "tooShort");
assert.equal(shortRangeError(0, 61, 100), "tooLong");
assert.equal(shortRangeError(-1, 10, 100), "outside");
assert.equal(shortRangeError(90, 101, 100), "outside");
assert.equal(shortRangeError(Number.NaN, 10, 100), "outside");

// The filter: a fixed rate comes first (a WebM from MediaRecorder declares none) and the size is the one constant.
{
  const { width, height } = SHORT_SIZE;
  assert.equal(width * 16, height * 9);
  const filter = shortVideoFilter();
  assert.ok(filter.startsWith("fps=30,"));
  assert.ok(filter.includes(`scale=${width}:${height}:force_original_aspect_ratio=increase`));
  assert.ok(filter.includes(`crop=${width}:${height}:(iw-ow)*0.5:(ih-oh)/2`));
  assert.ok(filter.endsWith("setsar=1"));
  assert.ok(shortVideoFilter(0.2).includes("(iw-ow)*0.2:"));
  assert.ok(shortVideoFilter(-3).includes("(iw-ow)*0:"));
  assert.ok(shortVideoFilter(3).includes("(iw-ow)*1:"));
}

// Only a video wider than 9:16 has sides to move across.
assert.equal(canMoveCrop(1920, 1080), true);
assert.equal(canMoveCrop(640, 640), true);
assert.equal(canMoveCrop(1080, 1920), false);
assert.equal(canMoveCrop(720, 1600), false);

console.log("shorts tests passed");
