// Plain assertions, no test framework: run with `node "src/app/studio/[id]/script/editor/wordFixes.test.mjs"` (Node 22.18+).
import assert from "node:assert/strict";
import { normalize } from "../../../../../persian/normalize.ts";
import { wordFixes } from "./wordFixes.ts";

// نیم‌فاصله توی متن دیده نمی‌شه؛ با Z جاش توی تست معلومه.
const Z = "\u200C";

/** The fixes normalize makes in `text`. */
const fixesIn = (text) => wordFixes(text, normalize(text));

// Each fix is a group of neighbouring words; words in between that did not change split the groups.
assert.deepEqual(fixesIn("آب می رود به خانه ی ما"), [
  { before: "می رود", after: `می${Z}رود` },
  { before: "خانه ی", after: `خانه${Z}ی` },
]);
assert.deepEqual(fixesIn("چی ?"), [{ before: "چی ?", after: "چی؟" }]);

// Changes only in spaces or invisible half-spaces are applied but not listed.
assert.deepEqual(fixesIn("سلام  دنیا "), []);
assert.deepEqual(wordFixes(`کتاب${Z} خوب`, "کتاب خوب"), []);

// The same text has nothing to list, and a fix at the start or the end is still found.
assert.deepEqual(wordFixes("یک دو سه", "یک دو سه"), []);
assert.deepEqual(wordFixes("الف ب", "ج ب"), [{ before: "الف", after: "ج" }]);
assert.deepEqual(wordFixes("الف ب", "الف"), [{ before: "ب", after: "" }]);

console.log("wordFixes tests passed");
