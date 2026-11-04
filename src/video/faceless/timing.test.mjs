// Plain assertions, no test framework: run with `node src/video/faceless/timing.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import { CTA_SECTION_ID, HOOK_SECTION_ID, MIN_SLIDE_SECONDS, TITLE_SECTION_ID, planSlides, slideParts } from "./timing.ts";

/** @param {string} text */
const estimate = (text) => text.length;
const part = (/** @type {string} */ id, /** @type {number} */ weight) => ({ sectionId: id, text: id, weight });
const script = {
  hooks: ["قلاب یک", "قلاب دو"],
  chosenHook: 1,
  sections: [
    { id: "a", title: "عنوان", text: "متن بخش", estSeconds: 30 },
    { id: "b", title: "  ", text: "متن بدون عنوان", estSeconds: 10 },
    { id: "c", title: "", text: " ", estSeconds: 10 },
  ],
  cta: "دعوت",
};

/** @param {{ start: number, end: number }[]} slides @param {number} duration */
function assertContinuous(slides, duration) {
  assert.equal(slides[0].start, 0);
  assert.equal(slides.at(-1).end, duration);
  slides.forEach((slide, i) => {
    assert.ok(slide.start < slide.end, `start < end at ${i}`);
    if (i > 0) assert.equal(slide.start, slides[i - 1].end, `no gap at ${i}`);
  });
}

// Parts follow the teleprompter: chosen hook, sections, call to action.
{
  const parts = slideParts(script, "پروژه", estimate);
  assert.deepEqual(parts.map((p) => p.sectionId), [HOOK_SECTION_ID, "a", "b", CTA_SECTION_ID]);
  assert.equal(parts[0].text, "قلاب دو");
  assert.equal(parts[1].text, "عنوان", "a section shows its title");
  assert.equal(parts[2].text, "متن بدون عنوان", "or its text when it has no title");
  assert.equal(parts[1].weight, 30, "a section's weight is its estimated time");
  assert.equal(parts[0].weight, estimate("قلاب دو"));
}

// The first hook is used when none was chosen.
{
  const parts = slideParts({ ...script, chosenHook: undefined }, "پروژه", estimate);
  assert.equal(parts[0].text, "قلاب یک");
}

// No script, or an empty one: one slide with the project's title.
{
  for (const empty of [undefined, { hooks: [], sections: [], cta: " " }]) {
    assert.deepEqual(slideParts(empty, " پروژه ", estimate), [{ sectionId: TITLE_SECTION_ID, text: "پروژه", weight: 1 }]);
  }
}

// Estimated times stretch to the real length and keep their proportions.
{
  const slides = planSlides([part("a", 10), part("b", 30)], 80);
  assert.deepEqual(slides.map((s) => [s.start, s.end]), [[0, 20], [20, 80]]);
}

// A slide too short to read gets the minimum, and the others share what is left.
{
  const slides = planSlides([part("a", 1), part("b", 99), part("c", 100)], 20);
  assertContinuous(slides, 20);
  assert.equal(slides[0].end - slides[0].start, MIN_SLIDE_SECONDS);
  assert.ok(Math.abs(slides[1].end - slides[1].start - (18 * 99) / 199) < 0.01);
}

// Parts pushed to the minimum can push others to it too; the sum still fits.
{
  const slides = planSlides([part("a", 1), part("b", 3), part("c", 8), part("d", 100)], 10);
  assertContinuous(slides, 10);
  slides.forEach((s) => assert.ok(s.end - s.start >= MIN_SLIDE_SECONDS - 0.01));
}

// A take too short for the minimum is shared equally.
{
  const slides = planSlides([part("a", 1), part("b", 50), part("c", 1)], 3);
  assert.deepEqual(slides.map((s) => s.end - s.start), [1, 1, 1]);
}

// A zero estimate (a rounded-down short text) still gets a slide; an inexact length ends exactly.
{
  const slides = planSlides([part("a", 0), part("b", 10), part("c", 10)], 61.237);
  assertContinuous(slides, 61.237);
}

console.log("timing tests passed");
