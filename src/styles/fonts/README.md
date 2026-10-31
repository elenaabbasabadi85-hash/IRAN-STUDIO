<div dir="rtl">

# فونت‌های برند

این فونت‌ها از خود سایت بارگذاری می‌شوند (`next/font/local` در `src/app/layout.tsx`). برای همین `next build` دیگر به Google Fonts وابسته نیست.

| فونت | فایل | نسخه | کاربرد |
| --- | --- | --- | --- |
| Vazirmatn | `vazirmatn/Vazirmatn-Variable.woff2` | 33.003، وزن متغیر ۱۰۰ تا ۹۰۰ | متن |
| Estedad | `estedad/Estedad-Variable.woff2` | 8.5، وزن متغیر ۱۰۰ تا ۹۰۰ | تیتر |
| Lalezar | `lalezar/Lalezar-Regular.woff2` | 1.004 | نمایشی |
| Inter | `inter/Inter-Variable.woff2` | 4.001، وزن متغیر ۱۰۰ تا ۹۰۰ | متن لاتین |
| Anton | `anton/Anton-Regular.woff2` | 2.116 | نمایشی لاتین |

- **منبع:** فایل‌های مخزن [google/fonts](https://github.com/google/fonts) در کامیت `6c1dbe27dc` (۸ آبان ۱۴۰۵)، همان نسخه‌هایی که Google Fonts می‌فرستد. این فایل‌ها با fontTools از TTF به WOFF2 تبدیل شده‌اند.
- **Inter:** در مخزن محور اندازه‌ی نوری (`opsz`) هم دارد. Google Fonts آن را روی ۱۴ ثابت می‌کند و همین‌جا هم روی ۱۴ ثابت شده تا شکل حرف‌ها همان بماند.
- **بدون راهنمای رسم:** Google Fonts این فایل‌ها را بدون راهنمای رسم TrueType (جدول‌های `cvt`، `fpgm` و `prep` و برنامه‌ی حرف‌ها) و بدون جدول `meta` می‌فرستد. این‌جا هم همین‌ها برداشته شده‌اند. اگر بمانند، ویندوز لبه‌ی حرف‌ها را کمی متفاوت نرم می‌کند.
- **مجوز:** هر پنج فونت مجوز SIL Open Font License 1.1 دارند. متن مجوز هر فونت در `OFL.txt` کنار خودش است.

</div>
