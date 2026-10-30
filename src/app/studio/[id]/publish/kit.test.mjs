// Plain assertions, no test framework: run with `node "src/app/studio/[id]/publish/kit.test.mjs"` (Node 22.18+).
import assert from "node:assert/strict";
import {
  chapterTime,
  chaptersText,
  chosenTitleIndex,
  extensionFor,
  fileSize,
  hashtagList,
  listText,
  outputFileName,
  pickOutputs,
  publishText,
  toPersianDigits,
  zipFileName,
} from "./kit.ts";

const output = (kind, key, createdAt) => ({ kind, key, createdAt });

// pickOutputs: the newest video, subtitle and cover; every short, oldest first; no description.
{
  const picked = pickOutputs([
    output("video", "v1", "2026-10-01T10:00:00.000Z"),
    output("short", "s2", "2026-10-03T10:00:00.000Z"),
    output("video", "v2", "2026-10-02T10:00:00.000Z"),
    output("short", "s1", "2026-10-02T09:00:00.000Z"),
    output("cover", "c1", "2026-10-01T10:00:00.000Z"),
    output("description", "d1", "2026-10-05T10:00:00.000Z"),
  ]);
  assert.equal(picked.video?.key, "v2");
  assert.deepEqual(picked.shorts.map((s) => s.key), ["s1", "s2"]);
  assert.equal(picked.cover?.key, "c1");
  assert.equal(picked.srt, undefined);
  assert.equal("description" in picked, false);
}
{
  // Equal times: the later entry in the list wins.
  const picked = pickOutputs([output("srt", "a", "2026-10-01T10:00:00.000Z"), output("srt", "b", "2026-10-01T10:00:00.000Z")]);
  assert.equal(picked.srt?.key, "b");
  assert.deepEqual(pickOutputs([]), { shorts: [] });
}

// extensionFor and outputFileName: from the stored file's own type, with a default per kind.
assert.equal(extensionFor("video", "video/webm;codecs=vp9,opus"), "webm");
assert.equal(extensionFor("video", "video/mp4"), "mp4");
assert.equal(extensionFor("video", ""), "mp4");
assert.equal(extensionFor("cover", "image/jpeg"), "jpg");
assert.equal(extensionFor("cover", ""), "png");
assert.equal(extensionFor("srt", "text/plain"), "srt");
const names = { video: "video", short: (n) => `short-${n}`, srt: "subtitles", cover: "cover" };
assert.equal(outputFileName("short", "video/mp4", names, 2), "short-2.mp4");
assert.equal(outputFileName("cover", "image/webp", names), "cover.webp");

// zipFileName: characters Windows refuses become spaces; trailing dots go; empty falls back.
assert.equal(zipFileName('a/b:c*d?"e<f>g|h', "kit"), "a b c d e f g h.zip");
assert.equal(zipFileName(`back${String.fromCharCode(92)}slash`, "kit"), "back slash.zip");
assert.equal(zipFileName("  title...  ", "kit"), "title.zip");
assert.equal(zipFileName("///", "kit"), "kit.zip");
assert.equal(zipFileName("x".repeat(150), "kit"), `${"x".repeat(100)}.zip`);
// Chrome turns invisible format characters into "_": a ZWNJ becomes a space, the others go.
const ZWNJ = String.fromCharCode(0x200c);
const RLM = String.fromCharCode(0x200f);
assert.equal(zipFileName(`پروژه${ZWNJ}ی تازه${RLM}`, "kit"), "پروژه ی تازه.zip");

// listText: Persian list with «و» before the last item and no comma before it.
assert.equal(listText(["a", "b", "c"], "، ", " و "), "a، b و c");
assert.equal(listText(["a", "b"], "، ", " و "), "a و b");
assert.equal(listText(["a"], "، ", " و "), "a");
assert.equal(listText([], "، ", " و "), "");

// chapterTime: Latin digits for YouTube; hours only when needed.
assert.equal(chapterTime(0), "0:00");
assert.equal(chapterTime(11.9), "0:11");
assert.equal(chapterTime(605), "10:05");
assert.equal(chapterTime(3725), "1:02:05");
assert.equal(chapterTime(-3), "0:00");
assert.equal(toPersianDigits("1:02:05"), "۱:۰۲:۰۵");

// chaptersText: sorted by start, one per line.
assert.equal(
  chaptersText([
    { start: 22, title: "B" },
    { start: 0, title: "A" },
  ]),
  "0:00 A\n0:22 B",
);
assert.equal(chaptersText(undefined), "");

// hashtagList: adds #, keeps one #, joins spaces with _, drops empty tags.
assert.deepEqual(hashtagList(["یوتیوب", "#ساخت_ویدیو", "##two words ", " ", "#"]), [
  "#یوتیوب",
  "#ساخت_ویدیو",
  "#two_words",
]);

// chosenTitleIndex: a missing or out-of-range choice falls back to the first title.
assert.equal(chosenTitleIndex({ titles: ["a", "b"], chosenTitle: 1 }), 1);
assert.equal(chosenTitleIndex({ titles: ["a", "b"] }), 0);
assert.equal(chosenTitleIndex({ titles: ["a", "b"], chosenTitle: 5 }), 0);
assert.equal(chosenTitleIndex({ titles: ["a"], chosenTitle: -1 }), 0);

// publishText: BOM first, demo line only in demo mode, empty parts left out.
const labels = { demo: "DEMO", title: "T", description: "D", chapters: "C", hashtags: "H", coverTexts: "K" };
const kit = {
  titles: ["first", "second"],
  coverTexts: ["cover one", " "],
  description: " text\n\nmore ",
  hashtags: ["a", "b"],
  chapters: [{ start: 0, title: "intro" }],
};
const BOM = String.fromCharCode(0xfeff);
assert.equal(
  publishText(kit, 1, labels, false),
  `${BOM}T:\nsecond\n\nD:\ntext\n\nmore\n\nC:\n0:00 intro\n\nH:\n#a #b\n\nK:\n- cover one\n`,
);
assert.equal(
  publishText({ titles: [], coverTexts: [], description: "", hashtags: [] }, 0, labels, true),
  `${BOM}DEMO\n`,
);

// fileSize: one decimal, at least 0.1 KB.
assert.deepEqual(fileSize(10), { size: 0.1, unit: "kb" });
assert.deepEqual(fileSize(1536), { size: 1.5, unit: "kb" });
assert.deepEqual(fileSize(5 * 1024 * 1024), { size: 5, unit: "mb" });
assert.deepEqual(fileSize(1.25 * 1024 ** 3), { size: 1.3, unit: "gb" });

console.log("kit.test.mjs: all assertions passed");
