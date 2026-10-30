// Plain assertions, no test framework: run with `node src/video/subtitles/srt.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import { keptSegments } from "../cuts.ts";
import { buildCues, buildSubtitles, retimeWords, srtText, srtTime, subtitleDuration } from "./srt.ts";

/** @param {[string, number, number][]} list */
const words = (list) => list.map(([w, start, end]) => ({ w, start, end }));
/** @param {[string, number, number][]} list */
const transcript = (list) => ({ language: "fa", words: words(list) });

// Time format: hours, minutes, seconds, then milliseconds after a comma.
{
  assert.equal(srtTime(0), "00:00:00,000");
  assert.equal(srtTime(1.2), "00:00:01,200");
  assert.equal(srtTime(3661.5), "01:01:01,500");
  assert.equal(srtTime(1.9996), "00:00:02,000", "rounds to the nearest millisecond");
  assert.equal(srtTime(-3), "00:00:00,000");
}

// A pause of 0.6 s or more starts a new cue; a shorter one does not.
{
  const cues = buildCues(
    words([
      ["سلام", 0, 0.5],
      ["به", 0.9, 1.2], // 0.4 s pause: same cue
      ["همه", 1.8, 2.2], // 0.6 s pause: new cue
    ]),
  );
  assert.deepEqual(cues, [
    { start: 0, end: 1.2, text: "سلام به" },
    { start: 1.8, end: 2.6, text: "همه" }, // lengthened to 0.8 s
  ]);
}

// A cue never passes 42 characters.
{
  const list = Array.from({ length: 12 }, (_, i) => ["کلمه", i * 0.3, i * 0.3 + 0.25]);
  const cues = buildCues(words(list));
  assert.ok(cues.length > 1);
  for (const cue of cues) assert.ok(cue.text.length <= 42, `"${cue.text}" is too long`);
  assert.equal(cues.map((c) => c.text).join(" "), list.map(([w]) => w).join(" "), "no word is lost");
}

// A cue never lasts more than 6 seconds.
{
  const list = Array.from({ length: 10 }, (_, i) => ["آ", i * 0.9, i * 0.9 + 0.5]);
  const cues = buildCues(words(list));
  assert.equal(cues.length, 2);
  for (const cue of cues) assert.ok(cue.end - cue.start <= 6);
}

// The 0.8 s minimum never overlaps the next cue.
{
  const cues = buildCues(
    words([
      ["یک", 0, 0.2],
      ["دو", 0.2, 0.3],
      ["سه", 0.95, 1.1], // 0.65 s pause: new cue, but only 0.95 s after the first
    ]),
  );
  assert.deepEqual(cues, [
    { start: 0, end: 0.8, text: "یک دو" },
    { start: 0.95, end: 1.75, text: "سه" },
  ]);
  const tight = buildCues(
    words([
      ["یک", 0, 0.1],
      ["دو", 0.7, 0.8],
    ]),
  );
  assert.deepEqual(tight[0], { start: 0, end: 0.7, text: "یک" }, "stops at the next cue");
}

// With cuts, words inside a cut are dropped and later words move earlier.
{
  const list = words([
    ["سلام", 0, 1],
    ["اضافه", 2, 2.5], // inside the cut
    ["دوستان", 4, 5],
  ]);
  const cuts = [{ start: 1.5, end: 3.5, reason: "silence" }];
  const kept = keptSegments(cuts, subtitleDuration(list, cuts));
  assert.deepEqual(kept, [
    { start: 0, end: 1.5 },
    { start: 3.5, end: 5 },
  ]);
  assert.deepEqual(retimeWords(list, kept), [
    { w: "سلام", start: 0, end: 1 },
    { w: "دوستان", start: 2, end: 3 },
  ]);

  const srt = srtText(buildSubtitles(transcript([["سلام", 0, 1], ["اضافه", 2, 2.5], ["دوستان", 4, 5]]), kept));
  assert.equal(srt, "1\n00:00:00,000 --> 00:00:01,000\nسلام\n\n2\n00:00:02,000 --> 00:00:03,000\nدوستان\n\n");
}

// A word half inside a cut keeps only its kept part.
{
  const kept = keptSegments([{ start: 0, end: 1, reason: "manual" }], 3);
  assert.deepEqual(retimeWords(words([["الف", 0.8, 2]]), kept), [{ w: "الف", start: 0, end: 1 }]);
}

// Empty input gives no cues and an empty file.
{
  assert.deepEqual(buildCues([]), []);
  assert.equal(srtText([]), "");
  assert.deepEqual(buildSubtitles(transcript([])), []);
  assert.deepEqual(buildCues(words([[" ", 0, 1], ["x", NaN, 1]])), [], "blank and broken words are skipped");
  const all = keptSegments([{ start: 0, end: 5, reason: "manual" }], 5);
  assert.deepEqual(buildSubtitles(transcript([["سلام", 1, 2]]), all), [], "every word is cut");
  assert.equal(subtitleDuration([]), 0);
}

// A full file.
{
  const srt = srtText(
    buildSubtitles(
      transcript([
        ["سلام", 0, 0.4],
        ["دوستان", 0.5, 1.2],
        ["امروز", 2, 2.5],
      ]),
    ),
  );
  assert.equal(srt, "1\n00:00:00,000 --> 00:00:01,200\nسلام دوستان\n\n2\n00:00:02,000 --> 00:00:02,800\nامروز\n\n");
}

console.log("srt tests passed");
