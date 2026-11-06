import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { focusRing } from "@/components/ui/focus";
import { fill } from "../scriptDraft";
import type { ForeignWord, SpellingFix } from "./editorDraft";
import t from "./strings.fa.json";

interface SpellingReportProps {
  fixes: SpellingFix[];
  foreign: ForeignWord[];
  scriptHref: string;
}

// Step 1, by code and without a model: what normalize fixed, and the words code will not touch.
// Read-only: a word is changed by hand only on the script page.
export function SpellingReport({ fixes, foreign, scriptHref }: SpellingReportProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-h3">
        {t.spelling.heading}
      </h2>
      <p>{fixes.length > 0 ? fill(t.spelling.count, { n: fixes.length }) : t.spelling.none}</p>
      {fixes.length > 0 && (
        <>
          <p className="max-w-2xl text-muted">{t.spelling.note}</p>
          <details className="max-w-2xl">
            <summary className={`cursor-pointer font-bold ${focusRing}`}>{t.spelling.show}</summary>
            <ul className="mt-3 flex flex-col gap-3">
              {fixes.map((fix, i) => (
                // A fixed list for this review, so the index is a stable key.
                <li key={i} className="flex flex-col">
                  <span className="text-caption text-muted">{fix.label}</span>
                  <span>
                    <bdi>{fix.before}</bdi> <span aria-hidden="true">←</span>
                    <span className="sr-only">{t.spelling.becomes}</span> <bdi>{fix.after}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {foreign.length > 0 && (
        <div className="flex max-w-2xl flex-col items-start gap-2 p-5 ring-1 ring-cream ring-inset">
          <h3 className="font-heading text-h3">{t.foreign.heading}</h3>
          <p>{t.foreign.text}</p>
          <ul className="flex flex-col gap-1">
            {foreign.map(({ label, word }, i) => (
              <li key={i}>
                <span className="text-muted">{label}: </span>«<bdi>{word}</bdi>»
              </li>
            ))}
          </ul>
          {/* چرا فقط هشدار؟ کلمه‌ی درست را فقط خود یوتیوبر می‌داند؛ تأیید ویراستاری با این هشدار هم ممکن است. */}
          <p className="text-muted">{t.foreign.hint}</p>
          <Button variant="ghost" size="sm" href={scriptHref} className="-ms-4">
            {t.scriptPage}
          </Button>
        </div>
      )}
    </section>
  );
}
