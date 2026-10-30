// Which OpenRouter models each agent uses, and how creative each one may be.
// Slugs checked against https://openrouter.ai/api/v1/models on 2026-10-30. Free models (":free")
// come and go, so check that list again if a model starts failing for every request.

export type ModelRole = "idea" | "script" | "editor" | "writer" | "test";

export interface ModelConfig {
  primary: string;
  /** From a different provider than `primary`, so one outage doesn't take down both. */
  fallback: string;
  temperature: number;
  /** On some models reasoning tokens count toward this too, so it leaves room beyond the JSON. */
  maxTokens: number;
}

// دما (temperature) یعنی چقدر مدل از محتمل‌ترین کلمه فاصله بگیرد: بالاتر یعنی متنوع‌تر، پایین‌تر یعنی قابل‌پیش‌بینی‌تر.
export const MODELS: Record<ModelRole, ModelConfig> = {
  // ایده: 0.8، بالاترین دما؛ این‌جا تنوع و غافلگیری از دقت مهم‌تر است.
  idea: {
    primary: "google/gemma-4-31b-it:free",
    fallback: "thinkingmachines/inkling:free",
    temperature: 0.8,
    maxTokens: 3000,
  },
  // متن ویدیو: 0.7؛ روایت باید زنده بماند، اما ترتیب بخش‌ها و زمان‌بندی نباید از دست برود.
  script: {
    primary: "google/gemma-4-31b-it:free",
    fallback: "thinkingmachines/inkling:free",
    temperature: 0.7,
    maxTokens: 6000,
  },
  // ویراستار: 0.3؛ کارش درست کردن متن موجود است، نه ساختن حرف تازه.
  editor: {
    primary: "nvidia/nemotron-3-ultra-550b-a55b:free",
    fallback: "google/gemma-4-31b-it:free",
    temperature: 0.3,
    maxTokens: 6000,
  },
  // نویسنده‌ی بسته‌ی انتشار: 0.6؛ عنوان‌ها کمی خلاقیت می‌خواهند، توضیحات و هشتگ‌ها دقت.
  writer: {
    primary: "google/gemma-4-31b-it:free",
    fallback: "nvidia/nemotron-3-ultra-550b-a55b:free",
    temperature: 0.6,
    maxTokens: 3000,
  },
  // آزمایش: 0.2؛ تقریباً قطعی، تا نتیجه‌ی آزمایش از یک اجرا به اجرای بعد زیاد عوض نشود.
  test: {
    primary: "google/gemma-4-26b-a4b-it:free",
    fallback: "nvidia/nemotron-3.5-lightning:free",
    temperature: 0.2,
    maxTokens: 1000,
  },
};
