// Plain assertions, no test framework: run with `node src/video/transcribe/merge.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import { mergeChunkWords, planChunks } from "./merge.ts";

/** @param {import("@/core/types").TranscriptWord[]} words */
function assertOrdered(words) {
  words.forEach((word, i) => {
    assert.ok(word.start <= word.end, `start <= end at ${i}`);
    if (i > 0) assert.ok(word.start >= words[i - 1].start, `starts increase at ${i}`);
  });
}

// planChunks: a 5-minute file becomes several overlapping chunks covering everything.
{
  const chunks = planChunks(300, 120, 2, 15);
  assert.deepEqual(chunks, [
    { start: 0, end: 120 },
    { start: 118, end: 238 },
    { start: 236, end: 300 },
  ]);
  assert.deepEqual(planChunks(130, 120, 2, 15), [{ start: 0, end: 130 }], "short tail is folded in");
  assert.deepEqual(planChunks(45, 120, 2, 15), [{ start: 0, end: 45 }]);
}

// mergeChunkWords: offsets are applied and the overlap is not duplicated.
{
  const words = mergeChunkWords([
    {
      start: 0,
      end: 120,
      words: [
        { w: "سلام", start: 1, end: 1.5 },
        { w: "اول", start: 118.2, end: 118.6 },
        { w: "دوم", start: 118.9, end: 119.3 },
        { w: "بری", start: 119.6, end: 120 }, // cut at the chunk edge; the next chunk has it whole
      ],
    },
    {
      start: 118,
      end: 238,
      words: [
        { w: "اول", start: 0.2, end: 0.6 },
        { w: "دوم،", start: 1.05, end: 1.3 }, // same word as above, slightly later and with a comma
        { w: "بریم", start: 1.6, end: 2 },
        { w: "نه", start: 10, end: 10.2 },
        { w: "نه", start: 10.3, end: 10.5 }, // a real repeat inside one chunk stays
      ],
    },
  ]);
  assert.deepEqual(
    words.map((w) => w.w),
    ["سلام", "اول", "دوم", "بریم", "نه", "نه"],
  );
  assert.equal(words[3].start, 119.6);
  assert.equal(words[4].start, 128);
  assertOrdered(words);
}

// Out-of-order or reversed times from the model are made monotonic.
{
  const words = mergeChunkWords([
    {
      start: 0,
      end: 60,
      words: [
        { w: "الف", start: 5, end: 5.4 },
        { w: "ب", start: 4.9, end: 4.8 },
      ],
    },
  ]);
  assertOrdered(words);
}

console.log("merge tests passed");
