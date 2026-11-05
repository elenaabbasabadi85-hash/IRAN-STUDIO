// Plain assertions, no test framework: run with `node src/persian/normalize.test.mjs` (Node 22.18+).
import assert from "node:assert/strict";
import idea from "../../fixtures/idea.json" with { type: "json" };
import script from "../../fixtures/script.json" with { type: "json" };
import writer from "../../fixtures/writer.json" with { type: "json" };
import { normalize } from "./normalize.ts";

// نیم‌فاصله توی متن دیده نمی‌شه؛ با Z جاش توی تست معلومه.
const Z = "\u200C";

/** normalize(input) is expected, and a second run changes nothing. */
function fixes(input, expected) {
  assert.equal(normalize(input), expected, JSON.stringify(input));
  assert.equal(normalize(expected), expected, `second run: ${JSON.stringify(expected)}`);
}

/** Text that is already correct, or that code can't be sure about, comes back unchanged. */
const keeps = (text) => fixes(text, text);

// ۱. «ي»، «ى» و «ك» عربی فارسی می‌شن، جز توی لینک: «ك» توی لینک یعنی یه لینک دیگه.
{
  fixes("عل\u064A و \u0643تاب", "علی و کتاب");
  fixes("مصطف\u0649", "مصطفی");
  keeps("https://fa.wikipedia.org/wiki/\u0643تاب");
}

// ۲. رقم‌ها هیچ‌وقت عوض نمی‌شن، نه انگلیسی، نه عربی، نه فارسی (تصمیم تیم): فارسی نشون دادن عدد
// کار نمایشه. زمان زیرنویس، فصل یوتیوب و هشتگ اگه رقمشون عوض بشه، دیگه کار نمی‌کنن.
{
  keeps("10 دقیقه");
  keeps("\u0664\u0665 ثانیه");
  keeps("1,000 تومن");
  keeps("۲،۵۰۰ تومن");
  keeps("با 4K و 1080p");
  keeps("گوشی S24");
  // خط زمان زیرنویس SRT و WebVTT.
  keeps("1\n00:00:01,500 --> 00:00:03,000\nسلام دنیا");
  keeps("00:01.500 --> 00:03.000");
  // فصل‌های یوتیوب توی توضیحات، هشتگ و جمله‌ی انگلیسی.
  keeps("0:00 مقدمه\n1:25 نور");
  keeps("#آموزش_2025");
  keeps("See you at 10:30.");
  // کنار رقم‌های دست‌نخورده، بقیه‌ی قاعده‌ها کار خودشون رو می‌کنن.
  fixes("1\n00:00:01,500 --> 00:00:03,000\nسلام ,خوبی ?", "1\n00:00:01,500 --> 00:00:03,000\nسلام، خوبی؟");
}

// ۳. شکل‌های قدیمی اضافه بعد از «ه» (U+0654 و U+06C0) و «ه ی» جدا همه «ه‌ی» می‌شن.
{
  fixes("خانه\u0654 من", `خانه${Z}ی من`);
  fixes("خان\u06C0 من", `خانه${Z}ی من`);
  fixes("خانه ی من", `خانه${Z}ی من`);
  keeps(`یه ایده${Z}ی روشن`);
}

// ۴. «می» و «نمی» جدا می‌چسبن؛ «میخواهم» دست نمی‌خوره، چون «میز» و «میوه» هم همین شکلی‌ان.
{
  fixes("می خواهم", `می${Z}خواهم`);
  fixes("نمی دونم", `نمی${Z}دونم`);
  keeps("میخواهم");
  keeps("میز و میوه");
  keeps("یه کمی دیگه");
}

// ۵. «های» و «هایی» جدا می‌چسبن؛ «ها»ی تنها توی حرف زدن معمولی حرف تأکیده.
{
  fixes("کتاب های من", `کتاب${Z}های من`);
  fixes("ویدیو هایی که", `ویدیو${Z}هایی که`);
  keeps("یادت نره ها");
}

// ۶. نیم‌فاصله‌ی تکراری، اول و آخر کلمه، کنار فاصله، خط یا علامت پاک می‌شه.
{
  fixes(`کتاب${Z}${Z}ها`, `کتاب${Z}ها`);
  fixes(`${Z}سلام${Z} دنیا`, "سلام دنیا");
  fixes(`سلام${Z}، دنیا`, "سلام، دنیا");
  fixes(`سلام${Z}\nدنیا`, "سلام\nدنیا");
  // ترتیب مهمه: اول نیم‌فاصله‌ی کنار فاصله پاک می‌شه، بعد «می» می‌چسبه.
  fixes(`می${Z} خواهم`, `می${Z}خواهم`);
  // نیم‌فاصله‌ی تنها بین دو فاصله یا کنار فاصله‌ی اول و آخر خط: اول پاک می‌شه، بعد فاصله‌ها یکی می‌شن.
  fixes(`سلام ${Z} دنیا`, "سلام دنیا");
  fixes(`${Z} سلام ${Z}`, "سلام");
  fixes(`می ${Z} خواهم`, `می${Z}خواهم`);
}

// ۷. فاصله‌های اضافه یکی می‌شن؛ خط‌ها و خط‌های خالی دقیقاً می‌مونن.
{
  fixes("  سلام    دنیا  ", "سلام دنیا");
  fixes("سلام\t\tدنیا", "سلام دنیا");
  fixes("بند اول  \n\n  بند دوم\n", "بند اول\n\nبند دوم\n");
  keeps("بند اول\n\nبند دوم");
  keeps("خط اول\r\nخط دوم");
}

// ۸. ? , ; بعد از کلمه‌ی فارسی ؟ ، ؛ می‌شن؛ قبلشون فاصله نمیاد و بعدشون یه فاصله.
{
  fixes("چی ?", "چی؟");
  fixes("چرا?", "چرا؟");
  fixes("سلام,خوبی", "سلام، خوبی");
  fixes("اول نور ; بعد دوربین", "اول نور؛ بعد دوربین");
  fixes("چرا ؟", "چرا؟");
  fixes("سلام،(خوبی)", "سلام، (خوبی)");
  fixes("واقعاً?", "واقعاً؟");
  fixes("واقعا??", "واقعا؟؟");
  // ترتیب مهمه: فاصله‌ی بعد از «،» یه «می» جدا می‌سازه که بعدش می‌چسبه.
  fixes("سلام،می خواهم", `سلام، می${Z}خواهم`);
  keeps("چرا؟!");
  keeps("لینک: https://example.com/watch?v=1,2");
  keeps("ایمیل: info@example.com");
  keeps("OK ?");
  keeps("YouTube, Instagram");
}

// همه‌ی قاعده‌ها با هم، و چیزهایی که عمداً خارج از دامنه‌ان: «لباسش تر شد» و «ای خدا» نمی‌چسبن.
{
  fixes(
    "خونه ی ما , می خواهم 2 تا کتاب های جدید بخرم ?",
    `خونه${Z}ی ما، می${Z}خواهم 2 تا کتاب${Z}های جدید بخرم؟`,
  );
  keeps("لباسش تر شد");
  keeps("ای خدا");
}

// fixtureها از قبل درستن، پس همه‌ی رشته‌هاشون باید بدون تغییر برگردن.
{
  const strings = (value) => (typeof value === "string" ? [value] : Object.values(value).flatMap(strings));
  for (const [name, sample] of Object.entries({ idea, script, writer })) {
    for (const text of strings(sample)) assert.equal(normalize(text), text, `${name}: ${text}`);
  }
}

console.log("normalize tests passed");
