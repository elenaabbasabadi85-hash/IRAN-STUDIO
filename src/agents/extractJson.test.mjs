// Plain assertions, no test framework: run with `node src/agents/extractJson.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import { extractJson } from "./extractJson.ts";

/** @param {string} reply @param {unknown} expected @param {string} [message] */
function assertFound(reply, expected, message) {
  assert.deepEqual(extractJson(reply), { ok: true, value: expected }, message);
}

// A reply that is only JSON, as asked; whitespace around it is fine.
{
  assertFound('{"message":"سلام"}', { message: "سلام" });
  assertFound('\n  {"message": "سلام"}\n\n', { message: "سلام" });
}

// Inside a ```json fence, with words before and after.
{
  assertFound('بفرمایید:\n```json\n{"message": "سلام دوستان"}\n```\nامیدوارم مفید باشد.', {
    message: "سلام دوستان",
  });
  assertFound('```JSON\r\n{"message": "سلام"}\r\n```', { message: "سلام" }, "upper case tag and Windows line ends");
}

// A fence without a language tag, and a fence on one line.
{
  assertFound('```\n{"message": "سلام"}\n```', { message: "سلام" });
  assertFound('```json {"message": "سلام"} ```', { message: "سلام" });
}

// The first fence that parses wins; a broken one before it is skipped.
{
  assertFound('```\nاین JSON نیست\n```\n```json\n{"message": "دوم"}\n```', { message: "دوم" });
}

// No fence, but a sentence around the JSON.
{
  assertFound('Here is the result: {"message": "سلام"} Hope it helps!', { message: "سلام" });
}

// A <think> block is dropped first, even when it contains braces of its own.
{
  assertFound('<think>The schema is {message: string}. Keep it short.</think>\n{"message": "سلام"}', {
    message: "سلام",
  });
}

// Braces inside Persian strings don't confuse the search.
{
  assertFound('نتیجه: {"message": "سلام {دوستان} عزیز!"}', { message: "سلام {دوستان} عزیز!" });
}

// Arrays are found too: { to } fails across two objects, so [ to ] is tried next.
{
  assertFound('ideas: [{"id": "1"}, {"id": "2"}]', [{ id: "1" }, { id: "2" }]);
}

// No JSON at all, or JSON cut off half way, is reported as not found.
{
  assert.deepEqual(extractJson(""), { ok: false });
  assert.deepEqual(extractJson("سلام! متأسفانه نمی‌توانم کمک کنم."), { ok: false });
  assert.deepEqual(extractJson('{"message": "سلام'), { ok: false }, "truncated reply");
  assert.deepEqual(extractJson('```json\n{"message": \n```'), { ok: false }, "broken fence");
}

console.log("extractJson tests passed");
