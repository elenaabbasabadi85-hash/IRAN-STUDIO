// Plain assertions, no test framework: run with `node src/video/cuts.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import { findSilenceCuts, keptSegments, normalizeCuts, totalSeconds } from "./cuts.ts";

/** @param {[string, number, number][]} list */
const transcript = (list) => ({ language: "fa", words: list.map(([w, start, end]) => ({ w, start, end })) });

/** @param {{ start: number, end: number }[]} ranges */
function assertSortedNoOverlap(ranges) {
  ranges.forEach((r, i) => {
    assert.ok(r.start < r.end, `start < end at ${i}`);
    if (i > 0) assert.ok(r.start >= ranges[i - 1].end, `no overlap at ${i}`);
  });
}

// A long pause in the middle becomes one padded cut; short pauses stay.
{
  const cuts = findSilenceCuts(
    transcript([
      ["سلام", 0, 0.5],
      ["به", 0.8, 1], // 0.3 s pause: kept
      ["همه", 3, 3.5], // 2 s pause: cut
    ]),
    3.5,
  );
  assert.deepEqual(cuts, [{ start: 1.15, end: 2.85, reason: "silence" }]);
}

// Silence before the first word and after the last word is cut too.
{
  const cuts = findSilenceCuts(
    transcript([
      ["سلام", 2, 2.5],
      ["دوستان", 2.6, 3],
    ]),
    6,
  );
  assert.deepEqual(cuts, [
    { start: 0, end: 1.85, reason: "silence" },
    { start: 3.15, end: 6, reason: "silence" },
  ]);
}

// A gap is measured from the latest end so far, so overlapping words don't make a fake pause.
{
  const cuts = findSilenceCuts(
    transcript([
      ["الف", 0, 3],
      ["ب", 1, 1.2], // ends early but "الف" is still being said
      ["پ", 3.2, 3.5],
    ]),
    3.5,
  );
  assert.deepEqual(cuts, []);
}

// Custom threshold and padding.
{
  const words = transcript([
    ["یک", 0, 0.5],
    ["دو", 1, 1.5],
  ]);
  assert.deepEqual(findSilenceCuts(words, 1.5), [], "0.5 s is below the default 0.7 s");
  assert.deepEqual(findSilenceCuts(words, 1.5, { minGap: 0.4, padding: 0.1 }), [
    { start: 0.6, end: 0.9, reason: "silence" },
  ]);
  assert.deepEqual(findSilenceCuts(words, 1.5, { minGap: 0.4, padding: 0.3 }), [], "padding eats the whole pause");
}

// No speech, or no duration, means no cuts at all.
{
  assert.deepEqual(findSilenceCuts(transcript([]), 60), []);
  assert.deepEqual(findSilenceCuts(transcript([["سلام", 0, 1]]), 0), []);
}

// Words past the video's end (e.g. the demo transcript on a short video) are clamped.
{
  const cuts = findSilenceCuts(
    transcript([
      ["الف", 0, 1],
      ["ب", 5, 6],
      ["پ", 20, 21],
    ]),
    8,
  );
  assert.deepEqual(cuts, [
    { start: 1.15, end: 4.85, reason: "silence" },
    { start: 6.15, end: 8, reason: "silence" },
  ]);
  assertSortedNoOverlap(cuts);
}

// normalizeCuts sorts, clamps, merges and drops tiny cuts.
{
  const cuts = normalizeCuts(
    [
      { start: 5, end: 7, reason: "manual" },
      { start: -1, end: 1, reason: "silence" },
      { start: 6, end: 8, reason: "silence" },
      { start: 9, end: 9.01, reason: "silence" },
      { start: 9.5, end: 20, reason: "retake" },
    ],
    10,
  );
  assert.deepEqual(cuts, [
    { start: 0, end: 1, reason: "silence" },
    { start: 5, end: 8, reason: "manual" },
    { start: 9.5, end: 10, reason: "retake" },
  ]);
  assertSortedNoOverlap(cuts);
}

// keptSegments is the complement of the cuts.
{
  const cuts = [
    { start: 0, end: 1, reason: "silence" },
    { start: 4, end: 5, reason: "silence" },
  ];
  const kept = keptSegments(cuts, 10);
  assert.deepEqual(kept, [
    { start: 1, end: 4 },
    { start: 5, end: 10 },
  ]);
  assert.equal(totalSeconds(kept), 8);
  assert.deepEqual(keptSegments([], 3), [{ start: 0, end: 3 }]);
  assert.deepEqual(keptSegments([{ start: 0, end: 3, reason: "manual" }], 3), []);
}

console.log("cuts tests passed");
