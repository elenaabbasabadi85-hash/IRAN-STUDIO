import { SCRIPT_MAX_MINUTES, scriptTarget } from "@/agents/scriptTiming";
import type { Script } from "@/core/types";
import { fill, formatDuration, totalSeconds } from "./scriptDraft";
import t from "./strings.fa.json";

// چرا زمان را کد حساب می‌کند، نه مدل؟ مدل در شمردن کلمه قابل‌اعتماد نیست. سرور هم زمان هر بخش را با
// همین estimateSeconds ساخته است، پس عددِ بعد از ویرایش با عدد سرور یکی است.
// Only numbers, no pass or fail colours: the estimate is rough and the human decides.
export function LengthSummary({ script, avgLengthMin }: { script: Script; avgLengthMin: number }) {
  const target = scriptTarget(avgLengthMin);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-h3">{t.length.heading}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">{t.length.total}</dt>
        <dd>{formatDuration(totalSeconds(script))}</dd>
        <dt className="text-muted">{t.length.target}</dt>
        <dd>{fill(t.length.targetValue, { m: target.minutes })}</dd>
      </dl>
      {script.chosenHook === undefined && <p className="text-caption font-normal text-muted">{t.length.noHook}</p>}
      {avgLengthMin > SCRIPT_MAX_MINUTES && (
        <p className="text-caption font-normal text-muted">
          {fill(t.length.capped, { avg: avgLengthMin, max: SCRIPT_MAX_MINUTES })}
        </p>
      )}
      <p className="text-caption font-normal text-muted">{t.length.note}</p>
    </div>
  );
}
