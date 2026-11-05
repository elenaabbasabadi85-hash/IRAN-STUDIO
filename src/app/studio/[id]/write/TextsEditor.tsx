import { useId, type ChangeEvent, type ReactNode } from "react";
import { WRITER_LIMITS } from "@/agents/schemas";
import { coverWordCount } from "@/agents/writerRules";
import { Surface } from "@/components/ui/Surface";
import { focusRing } from "@/components/ui/focus";
import { fill, type FieldErrors, type FieldKey, type Texts } from "./writeDraft";
import t from "./strings.fa.json";

// Mirrors inputClasses in src/app/studio/new/NewProjectForm.tsx (Platform lane), like the script page.
const inputClasses = `w-full bg-navy px-3 py-2.5 text-cream ring-1 ring-concrete ring-inset aria-invalid:ring-2 aria-invalid:ring-live-red ${focusRing}`;

type List = "titles" | "coverTexts" | "hashtags";

interface TextsEditorProps {
  /** Each field's element id is `${idPrefix}-${key}`, so the page can move focus to a field with a problem. */
  idPrefix: string;
  texts: Texts;
  errors: FieldErrors;
  onEdit: (key: FieldKey, update: (texts: Texts) => Texts) => void;
}

// چرا شمارنده‌ها با writerRules و WRITER_LIMITS؟ همان قاعده‌ها و همان حدهایی‌اند که سرور با آن‌ها
// خروجی مدل را سنجید، پس عددی که این‌جا می‌بینی همان عددی است که موقع تأیید سنجیده می‌شود.
// Only the texts change: the number and order of items stay as the agent wrote them.
export function TextsEditor({ idPrefix, texts, errors, onEdit }: TextsEditorProps) {
  const id = (key: FieldKey) => `${idPrefix}-${key}`;
  const setItem = (list: List, key: FieldKey, i: number) => (value: string) =>
    onEdit(key, (current) => ({ ...current, [list]: current[list].map((item, j) => (j === i ? value : item)) }));

  return (
    <div className="flex flex-col gap-6">
      {/* چرا انتخاب عنوان این‌جا نیست؟ صفحه‌ی آماده‌ی انتشار همین حالا انتخاب را می‌گیرد و chosenTitle را
          ذخیره می‌کند؛ دو جای انتخاب برای یک چیز فقط گیج می‌کند. */}
      <Group legend={t.titles.legend} hint={t.titles.hint}>
        {texts.titles.map((title, i) => {
          const key: FieldKey = `title-${i}`;
          return (
            <TextField
              // Five titles in a fixed order, so the index is a stable key.
              key={i}
              id={id(key)}
              label={fill(t.titles.label, { n: i + 1 })}
              max={WRITER_LIMITS.title}
              // The schema counts a title after trim, so the counter does too.
              count={fill(t.chars, { count: title.trim().length, max: WRITER_LIMITS.title })}
              value={title}
              error={errors[key]}
              onChange={setItem("titles", key, i)}
            />
          );
        })}
      </Group>

      <Group legend={t.covers.legend} hint={t.covers.hint}>
        {texts.coverTexts.map((cover, i) => {
          const key: FieldKey = `cover-${i}`;
          const words = coverWordCount(cover);
          return (
            <TextField
              key={i}
              id={id(key)}
              label={fill(t.covers.label, { n: i + 1 })}
              max={WRITER_LIMITS.coverChars}
              count={fill(t.words, { count: words, max: WRITER_LIMITS.coverWords })}
              warning={
                words > WRITER_LIMITS.coverWords ? fill(t.covers.tooManyWords, { max: WRITER_LIMITS.coverWords }) : undefined
              }
              value={cover}
              error={errors[key]}
              onChange={setItem("coverTexts", key, i)}
            />
          );
        })}
      </Group>

      <Surface>
        <TextField
          id={id("description")}
          label={t.description.label}
          max={WRITER_LIMITS.description}
          rows={10}
          count={fill(t.chars, { count: texts.description.trim().length, max: WRITER_LIMITS.description })}
          value={texts.description}
          error={errors.description}
          onChange={(value) => onEdit("description", (current) => ({ ...current, description: value }))}
        />
      </Surface>

      <Group legend={t.hashtags.legend} hint={t.hashtags.hint} columns>
        {texts.hashtags.map((tag, i) => {
          const key: FieldKey = `hashtag-${i}`;
          return (
            <TextField
              key={i}
              id={id(key)}
              label={fill(t.hashtags.label, { n: i + 1 })}
              max={WRITER_LIMITS.hashtag}
              count={fill(t.chars, { count: tag.length, max: WRITER_LIMITS.hashtag })}
              // The stored tag has no #; the publish page adds it.
              prefix="#"
              optional
              value={tag}
              error={errors[key]}
              onChange={setItem("hashtags", key, i)}
            />
          );
        })}
      </Group>
    </div>
  );
}

function Group({ legend, hint, columns = false, children }: { legend: string; hint: string; columns?: boolean; children: ReactNode }) {
  // Unique per instance: Next keeps pages it navigated away from hidden in the document.
  const hintId = useId();

  return (
    <Surface>
      <fieldset aria-describedby={hintId} className="min-w-0">
        <legend className="font-heading text-h3">{legend}</legend>
        <p id={hintId} className="mt-1 text-muted">
          {hint}
        </p>
        <div className={`mt-4 grid gap-4 ${columns ? "sm:grid-cols-2" : ""}`}>{children}</div>
      </fieldset>
    </Surface>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  max: number;
  /** The live count under the field, such as «۴۲ از ۶۰ نویسه». */
  count: string;
  /** Said in words next to the count while the text breaks a rule, so the problem is never shown by colour alone. */
  warning?: string;
  /** Rows of a textarea; without it the field is a single line. */
  rows?: number;
  /** A fixed mark before the input, such as # for a hashtag. The label names the field, so it is hidden from screen readers. */
  prefix?: string;
  /** An empty hashtag is dropped on approval, so it is not required. */
  optional?: boolean;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

// maxLength comes from the agent's own limits, so the form never accepts what the schema rejects.
// The count is linked to the field but not live, so it is not read out on every key press.
function TextField({ id, label, max, count, warning, rows, prefix, optional = false, value, error, onChange }: TextFieldProps) {
  const shared = {
    id,
    value,
    maxLength: max,
    "aria-required": optional ? undefined : true,
    // Also while a cover text is too long: the red ring sits on the navy input, where live red passes contrast.
    "aria-invalid": error || warning ? true : undefined,
    "aria-describedby": error ? `${id}-count ${id}-error` : `${id}-count`,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  const input = rows ? (
    <textarea rows={rows} className={`${inputClasses} resize-y`} {...shared} />
  ) : (
    <input type="text" autoComplete="off" className={inputClasses} {...shared} />
  );

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-caption">
        {label}
      </label>
      {prefix ? (
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="font-bold">
            {prefix}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
      <p id={`${id}-count`} className="text-caption font-normal text-muted">
        {count}
        {/* Once approval has found a problem, the error below says it; the same words twice would only repeat. */}
        {warning && !error && <span className="font-bold text-foreground"> — {warning}</span>}
      </p>
      {/* Cream, not red: live red fails contrast on the denim Surface. */}
      {error && (
        <p id={`${id}-error`} className="text-caption">
          {error}
        </p>
      )}
    </div>
  );
}
