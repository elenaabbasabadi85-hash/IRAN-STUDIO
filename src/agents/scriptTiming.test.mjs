// Plain assertions, no test framework: run with `node src/agents/scriptTiming.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import transcript from "../../fixtures/transcript.json" with { type: "json" };
import { estimateSeconds, scriptTarget } from "./scriptTiming.ts";

// No words, no time.
{
  assert.equal(estimateSeconds(""), 0);
  assert.equal(estimateSeconds("  \n "), 0);
}

// A half-space keeps «می‌شود» one word; with a full space it would be two.
{
  assert.equal(estimateSeconds("می‌شود می‌شود می‌شود می‌شود"), 2);
  assert.equal(estimateSeconds("می شود می شود می شود می شود"), 4);
}

// Punctuation on its own is not a word; line breaks and repeated spaces are just spaces.
{
  assert.equal(estimateSeconds("سلام — خوبی ؟"), 1);
  assert.equal(estimateSeconds("سلام\n\nخوبی  امروز چطوری"), 2);
}

// The demo transcript (76 words in about 38 seconds) is where WORDS_PER_MINUTE comes from.
{
  const text = transcript.words.map((word) => word.w).join(" ");
  assert.equal(estimateSeconds(text), 38);
}

// The target is the channel's usual length, capped at SCRIPT_MAX_MINUTES.
{
  assert.deepEqual(scriptTarget(8), { minutes: 8, words: 960 });
  assert.deepEqual(scriptTarget(10), { minutes: 10, words: 1200 });
  assert.deepEqual(scriptTarget(25), { minutes: 10, words: 1200 });
  assert.deepEqual(scriptTarget(1), { minutes: 1, words: 120 });
}

console.log("scriptTiming tests passed");
