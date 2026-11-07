// Plain assertions, no test framework: run with `node src/agents/editorRules.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import demoScript from "../../fixtures/script.json" with { type: "json" };
import sample from "../../fixtures/editor.json" with { type: "json" };
import {
  applySuggestions,
  changesNumberWords,
  foreignLetters,
  partPlace,
  scriptParts,
  usableSuggestions,
} from "./editorRules.ts";

const script = {
  hooks: ["قلاب اول", "قلاب دوم که انتخاب شده", "قلاب سوم"],
  chosenHook: 1,
  sections: [
    { id: "s1", title: "شروع", text: "این ویدیو کوتاهه. این ویدیو رو تا آخر ببین.", estSeconds: 4 },
    { id: "s2", title: "نور", text: "این کانال هر ماه 10 تا ویدیو می‌دهد و 5 تا شورت.", estSeconds: 3 },
  ],
  cta: "کانال رو دنبال کن.",
  edited: false,
};

/** @param {string} part @param {string} from @param {string} to */
const suggestion = (part, from, to) => ({ id: `${part}:${from}`, part, from, to, reason: "دلیل" });

/** True when the suggestion is usable in a cta that is `text`, by default just its `from`. @param {string} from @param {string} to @param {string} [text] */
const usable = (from, to, text = from) => usableSuggestions({ ...script, cta: text }, [suggestion("cta", from, to)]).length === 1;

// The model sees the chosen hook (or the first one), each section's title and text, then the cta.
{
  const parts = scriptParts(script);
  assert.deepEqual(parts.map((part) => part.key), ["hook", "title-1", "text-1", "title-2", "text-2", "cta"]);
  assert.equal(parts[0].text, "قلاب دوم که انتخاب شده");
  assert.equal(scriptParts({ ...script, chosenHook: undefined })[0].text, "قلاب اول");
}

// A key maps back to the same place in the Script.
{
  assert.deepEqual(partPlace("hook"), { kind: "hook" });
  assert.deepEqual(partPlace("cta"), { kind: "cta" });
  assert.deepEqual(partPlace("text-1"), { kind: "text", section: 0 });
  assert.deepEqual(partPlace("title-12"), { kind: "title", section: 11 });
  for (const key of ["text-0", "section-1", "text1", " hook", "text-۱"]) assert.equal(partPlace(key), null, key);
}

// A usable suggestion is applied, to the chosen hook too, and nowhere else.
{
  const next = applySuggestions(script, [suggestion("hook", "دوم", "دومی"), suggestion("title-2", "نور", "نور پنجره")]);
  assert.deepEqual(next.hooks, ["قلاب اول", "قلاب دومی که انتخاب شده", "قلاب سوم"]);
  assert.equal(next.sections[1].title, "نور پنجره");
  assert.equal(next.sections[1].text, script.sections[1].text);
}

// A `from` that is missing, found twice (even overlapping), in another part, or under an unknown key is dropped.
{
  const dropped = [
    suggestion("text-1", "دوربین", "گوشی"),
    suggestion("text-1", "این ویدیو", "این فیلم"),
    suggestion("cta", "ویدیو کوتاهه", "ویدیو کوتاهیه"),
    suggestion("text-9", "کوتاهه", "کوتاهیه"),
  ];
  assert.deepEqual(usableSuggestions(script, dropped), []);
  assert.deepEqual(applySuggestions(script, dropped), script);
  assert.deepEqual(usableSuggestions({ ...script, cta: "ااا" }, [suggestion("cta", "اا", "آ")]), []);
}

// Digits are never changed, not even their script; a suggestion that keeps them is fine.
{
  const changed = [suggestion("text-2", "10 تا ویدیو", "۱۰ تا ویدیو"), suggestion("text-2", "5 تا", "6 تا")];
  assert.deepEqual(usableSuggestions(script, changed), []);
  const kept = suggestion("text-2", "10 تا ویدیو می‌دهد", "10 تا ویدیو می‌ده");
  assert.deepEqual(usableSuggestions(script, [kept]), [kept]);
  assert.equal(applySuggestions(script, [kept]).sections[1].text, "این کانال هر ماه 10 تا ویدیو می‌ده و 5 تا شورت.");
}

// Each run of digits is compared on its own and in order: joining or splitting numbers is a change too.
{
  const numbers = { ...script, cta: "۲ ۳ بار و 1,500 نفر دنبال کن." };
  const joined = [suggestion("cta", "۲ ۳ بار", "۲۳ بار"), suggestion("cta", "1,500 نفر", "1500 نفر")];
  assert.deepEqual(usableSuggestions(numbers, joined), []);
  const keepsDigits = suggestion("cta", "1,500 نفر دنبال کن", "1,500 نفر دنبالش کن");
  assert.deepEqual(usableSuggestions(numbers, [keepsDigits]), [keepsDigits]);
}

// A number keeps its signs: a minus, its separators and a percent sign. «منفی» and «درصد» are the same signs,
// and a dash or full stop that is not part of a number is not compared.
{
  const dropped = [
    ["۵٪ تخفیف", "۵ تخفیف"],
    ["-۳ درجه", "۳ درجه"],
    ["(-۳)", "(۳)"],
    ["۲٫۵", "۲/۵"],
    ["2.5", "2,5"],
    ["1,500", "1500"],
    ["۱۴۰۵/۰۸/۱۶", "۱۴۰۵/۸/۱۶"],
    ["۵ ٪", "۵"],
    ["\u2212۳ درجه", "۳ درجه"],
  ];
  for (const [from, to] of dropped) assert.equal(usable(from, to), false, `${from} → ${to}`);
  const kept = [
    ["۳-۴ دقیقه", "۳ تا ۴ دقیقه"],
    ["کووید-۱۹", "کووید ۱۹"],
    ["۵٪ تخفیف", "۵ درصد تخفیف"],
    ["5%", "5٪"],
    ["-۳ درجه", "منفی ۳ درجه"],
    ["سال ۱۴۰۵.", "سال ۱۴۰۵"],
    ["۵ ٪", "۵٪"],
    ["\u2212۳ درجه", "-۳ درجه"],
  ];
  // Kept and with no warning, so the card starts ticked.
  for (const [from, to] of kept) {
    assert.equal(usable(from, to), true, `${from} → ${to}`);
    assert.equal(changesNumberWords(from, to), false, `${from} → ${to}`);
  }
}

// Numbers are compared in the whole part, before and after the change: a `from` may end right next to a digit.
{
  const discount = "این ماه ۵ درصد تخفیف داریم";
  assert.equal(usable("درصد تخفیف", "تخفیف", discount), false);
  assert.equal(usable("هوا منفی", "هوا", "هوا منفی ۳ درجه است"), false);
  assert.equal(usable("1,", "1", "قیمت 1,500 تومنه"), false);
  const withDiscount = { ...script, cta: discount };
  assert.deepEqual(applySuggestions(withDiscount, [suggestion("cta", "درصد تخفیف", "تخفیف")]), withDiscount);
  // Alone, «-۱۹» looks like a minus; in its part the dash comes after a letter, so it is a hyphen.
  assert.equal(usable("-۱۹ همه\u200Cگیر", "۱۹ همه\u200Cگیر", "کرونا یا کووید-۱۹ همه\u200Cگیر شد"), true);
}

// Number words and time units that change are flagged; tone changes and look-alike words are not.
{
  assert.equal(changesNumberWords("سه نکته", "چهار نکته"), true);
  assert.equal(changesNumberWords("۱۰ دقیقه", "۱۰ ثانیه"), true);
  assert.equal(changesNumberWords("سه‌تا", "چهار‌تا"), true);
  assert.equal(changesNumberWords("یک ساعت", "یه ساعت"), false);
  assert.equal(changesNumberWords("می‌دهد", "می‌ده"), false);
  assert.equal(changesNumberWords("صدا", "صدای"), false);
  assert.equal(changesNumberWords("خبر خوب این‌که", "خبر خوب اینه که"), false);
  for (const { from, to } of sample.suggestions) assert.equal(changesNumberWords(from, to), false, from);
}

// A number word written together with «تا» counts too, also when its final «ت» and the «ت» of «تا» are one.
{
  assert.equal(changesNumberWords("دوتا", "چهارتا"), true);
  assert.equal(usable("دوتا", "چهارتا"), true, "only a warning");
  assert.equal(changesNumberWords("هفتا", "هشتا"), true);
  // «هشتاد» is still «هشتاد», never «هشت».
  assert.equal(changesNumberWords("هشتاد", "هفتاد"), true);
  assert.equal(changesNumberWords("هشتاد", "هشتا"), true);
  const same = [
    ["دوتا", "دو تا"],
    ["شیشتا", "شش\u200Cتا"],
    ["هفتا", "هفت\u200Cتا"],
    ["بیستا", "بیست تا"],
    ["شصتا", "شصت\u200Cتا"],
  ];
  for (const [from, to] of same) assert.equal(changesNumberWords(from, to), false, `${from} → ${to}`);
  // «دوتایی» does not end in «تا», so neither side is counted.
  assert.equal(changesNumberWords("دوتایی", "چهارتایی"), false);
}

// Of two overlapping suggestions the first is kept; two separate ones in one part are both applied.
{
  const first = suggestion("text-1", "کوتاهه. این", "کوتاهه! این");
  const second = suggestion("text-1", "این ویدیو رو", "این رو");
  assert.deepEqual(usableSuggestions(script, [first, second]), [first]);
  const later = suggestion("text-1", "تا آخر", "تا تهش");
  const earlier = suggestion("text-1", "کوتاهه", "کوتاهیه");
  assert.equal(applySuggestions(script, [later, earlier]).sections[0].text, "این ویدیو کوتاهیه. این ویدیو رو تا تهش ببین.");
}

// A rejected suggestion changes nothing: only the accepted ones are applied.
{
  const accepted = suggestion("text-1", "کوتاهه", "کوتاهیه");
  const rejected = suggestion("cta", "دنبال کن", "دنبال کنید");
  assert.deepEqual(usableSuggestions(script, [accepted, rejected]), [accepted, rejected]);
  assert.equal(applySuggestions(script, [accepted]).cta, script.cta);
  assert.deepEqual(applySuggestions(script, []), script);
}

// The input Script is never changed; ids, times and the other fields stay as they are.
{
  const before = structuredClone(script);
  const next = applySuggestions(script, [suggestion("text-1", "کوتاهه", "کوتاهیه"), suggestion("hook", "دوم", "دومی")]);
  assert.deepEqual(script, before);
  assert.notEqual(next.sections[0], script.sections[0]);
  assert.deepEqual(next.sections.map(({ id, estSeconds }) => [id, estSeconds]), [["s1", 4], ["s2", 3]]);
  assert.equal(next.chosenHook, 1);
  assert.equal(next.edited, false);
}

// Letters that are neither Persian/Arabic nor Latin are reported with where they are; nothing else is.
{
  assert.deepEqual(foreignLetters("пыریده"), [{ index: 0, letter: "п" }, { index: 1, letter: "ы" }]);
  assert.deepEqual(foreignLetters("یه пыریده"), [{ index: 3, letter: "п" }, { index: 4, letter: "ы" }]);
  assert.deepEqual(foreignLetters("با YouTube و Next.js، ۱۰ و 10 و ١٠ ویدیو؟ «می‌شه» — ـــ 🎬"), []);
  assert.deepEqual(foreignLetters(JSON.stringify(demoScript)), []);
}

// Every suggestion in the demo sample can be placed in the demo script.
{
  assert.equal(usableSuggestions(demoScript, sample.suggestions).length, sample.suggestions.length);
}

console.log("editorRules tests passed");
