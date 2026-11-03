// Plain assertions, no test framework: run with `node src/agents/writerRules.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import sample from "../../fixtures/writer.json" with { type: "json" };
import { allDifferent, collapseSpaces, coverWordCount, normalizeHashtag } from "./writerRules.ts";

// A half-space keeps «ایده‌ی» one word; extra spaces and line breaks are just spaces.
{
  assert.equal(coverWordCount("ایده‌ی روشن"), 2);
  assert.equal(coverWordCount("اول نور، بعد دوربین"), 4);
  assert.equal(coverWordCount("  اول نور،\n بعد   دوربین "), 4);
  assert.equal(coverWordCount("پنج قدم تا ویدیوی تمیز"), 5, "the old sample cover text is one word too long");
}

// A cover text that only differs from a title in its spaces is the same text.
{
  assert.equal(collapseSpaces("  دوربین  گرون\nلازم نیست "), "دوربین گرون لازم نیست");
  assert.equal(allDifferent(["دوربین گرون لازم نیست", "دوربین  گرون لازم نیست "]), false);
  assert.equal(allDifferent(["اول نور، بعد دوربین", "رو به پنجره بشین"]), true);
}

// Hashtags lose their leading #, and spaces inside a tag become _, as on the publish page.
{
  assert.equal(normalizeHashtag(" #تولید محتوا "), "تولید_محتوا");
  assert.equal(normalizeHashtag("##یوتیوب"), "یوتیوب");
  assert.equal(normalizeHashtag("# ساخت  ویدیو"), "ساخت_ویدیو");
  assert.equal(normalizeHashtag("#"), "");
  assert.equal(allDifferent(["#یوتیوب", "یوتیوب"].map(normalizeHashtag)), false);
}

// The demo sample keeps every rule: short cover texts that are not titles, and tags already clean.
{
  const titles = new Set(sample.titles.map(collapseSpaces));
  for (const cover of sample.coverTexts) {
    assert.ok(coverWordCount(cover) <= 4, cover);
    assert.ok(!titles.has(collapseSpaces(cover)), cover);
  }
  for (const tag of sample.hashtags) assert.equal(normalizeHashtag(tag), tag);
  assert.ok(allDifferent(sample.titles) && allDifferent(sample.coverTexts) && allDifferent(sample.hashtags));
}

console.log("writerRules tests passed");
