<div dir="rtl">

# ۷. حالت نمایشی بدون هیچ کلید

- **وضعیت:** اجرا شده.
- **از کجا آمده:** بخش‌های Demo mode و Secrets در [AGENTS.md](../../AGENTS.md)، و درخواست‌های [#20](https://github.com/elenaabbasabadi85-hash/IRAN-STUDIO/pull/20)، [#29](https://github.com/elenaabbasabadi85-hash/IRAN-STUDIO/pull/29) و [#35](https://github.com/elenaabbasabadi85-hash/IRAN-STUDIO/pull/35).
- **مسیر:** همه‌ی مسیرها.

## تصمیم

برنامه بدون هیچ کلید API کار می‌کند و به‌جای سرویس‌های بیرونی، فایل‌های نمونه‌ی پوشه‌ی `fixtures` را به کار می‌برد. هر جا جواب از نمونه می‌آید، صفحه یا جواب این را نشان می‌دهد:

- **ترنسکریپت:** بدون `GROQ_API_KEY`، ترنسکریپت نمونه‌ی `fixtures/transcript.json` با `demo: true` و نشان «دمو» می‌آید (#20).
- **دستیارهای محتوا:**
  - بدون `OPENROUTER_API_KEY`، جواب نمونه‌ی `fixtures` با `demo: true` و `model: null` می‌آید (#35).
  - نمونه هم با همان اسکیمای Zod سنجیده می‌شود، تا اگر قرارداد خروجی عوض شد، نمونه‌ی کهنه بی‌صدا به صفحه‌ها نرسد ([`runAgent.ts`](../../src/agents/runAgent.ts)).
- **بسته‌ی انتشار:** تا وقتی نویسنده متن‌های انتشار را ننوشته، صفحه‌ی آماده‌ی انتشار یک نمونه با نشان «نمایشی» نشان می‌دهد که در پروژه ذخیره نمی‌شود ([سناریوی دمو](../demo-scenario.md)).
- **خرید اشتراک:** نمایشی است. پرداختی انجام نمی‌شود، صفحه هیچ خانه‌ی ورودی ندارد و چیزی ذخیره نمی‌شود (#29).

## چرا

- **قانون تیم:** «Everything must work without any API key, using the sample files in `fixtures`.» (AGENTS.md)
- **کلیدها فقط روی سرور:** کلیدها در کد نوشته نمی‌شوند و فقط روی سرور از متغیرهای محیطی خوانده می‌شوند (AGENTS.md، بخش Secrets).

دلیل دیگری در ایشوها و درخواست‌ها نوشته نشده است.

## ریسک‌ها

- **ترنسکریپت نمونه به صدای ویدیوی کاربر ربطی ندارد.** صفحه همین را به کاربر می‌گوید ([#23](https://github.com/elenaabbasabadi85-hash/IRAN-STUDIO/pull/23) و سناریوی دمو).
- **کلید OpenRouter روی Vercel:** پیش از گذاشتن این کلید، مسیر دستیارها باید محدود شود: ایشوی [#53](https://github.com/elenaabbasabadi85-hash/IRAN-STUDIO/issues/53).

</div>
