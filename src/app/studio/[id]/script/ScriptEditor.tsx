import { SCRIPT_LIMITS } from "@/agents/schemas";
import { estimateSeconds } from "@/agents/scriptTiming";
import { Surface } from "@/components/ui/Surface";
import { focusRing } from "@/components/ui/focus";
import type { Script } from "@/core/types";
import { fill, formatDuration, type FieldErrors, type FieldKey } from "./scriptDraft";
import t from "./strings.fa.json";

// Mirrors inputClasses in src/app/studio/new/NewProjectForm.tsx (Platform lane), like the idea page.
const inputClasses = `w-full bg-navy px-3 py-2.5 text-cream ring-1 ring-concrete ring-inset aria-invalid:ring-2 aria-invalid:ring-live-red ${focusRing}`;

type Edit = (key: FieldKey, update: (script: Script) => Script) => void;

interface ScriptEditorProps {
  /** Each field's element id is `${idPrefix}-${key}`, so the page can move focus to a field with a problem. */
  idPrefix: string;
  script: Script;
  errors: FieldErrors;
  onEdit: Edit;
}

// Only the texts change: the number and order of sections stay as the agent wrote them.
export function ScriptEditor({ idPrefix, script, errors, onEdit }: ScriptEditorProps) {
  const id = (key: FieldKey) => `${idPrefix}-${key}`;

  return (
    <div className="flex flex-col gap-8">
      <HookChoice idPrefix={idPrefix} script={script} errors={errors} onEdit={onEdit} />

      <section aria-labelledby={`${idPrefix}-sections`} className="flex flex-col gap-4">
        <h3 id={`${idPrefix}-sections`} className="text-h3">
          {t.sections.heading}
        </h3>
        {script.sections.map((section, i) => {
          const set = (part: "title" | "text", value: string) =>
            onEdit(`section-${i}-${part}`, (current) => ({
              ...current,
              sections: current.sections.map((item, j) => (j === i ? { ...item, [part]: value } : item)),
            }));
          return (
            <Surface key={section.id}>
              <fieldset className="min-w-0">
                {/* The time is part of the group's name, so it is also heard when a field is entered. */}
                <legend className="mb-4 flex w-full flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-heading text-h3">{fill(t.sections.legend, { n: i + 1 })}</span>
                  <span className="text-caption text-muted">{formatDuration(estimateSeconds(section.text))}</span>
                </legend>
                <div className="flex flex-col gap-4">
                  <TextField
                    id={id(`section-${i}-title`)}
                    label={t.sections.title}
                    max={SCRIPT_LIMITS.sectionTitle}
                    value={section.title}
                    error={errors[`section-${i}-title`]}
                    onChange={(value) => set("title", value)}
                  />
                  <TextField
                    id={id(`section-${i}-text`)}
                    label={t.sections.text}
                    max={SCRIPT_LIMITS.sectionText}
                    rows={10}
                    value={section.text}
                    error={errors[`section-${i}-text`]}
                    onChange={(value) => set("text", value)}
                  />
                </div>
              </fieldset>
            </Surface>
          );
        })}
      </section>

      <Surface>
        <TextField
          id={id("cta")}
          label={t.cta}
          max={SCRIPT_LIMITS.cta}
          rows={3}
          value={script.cta}
          error={errors.cta}
          onChange={(value) => onEdit("cta", (current) => ({ ...current, cta: value }))}
        />
      </Surface>
    </div>
  );
}

// Native radios (keyboard: Tab into the group, arrows to move), drawn as cards like the idea cards.
// Each hook keeps its own text, so moving through the radios with the arrows never loses an edit.
function HookChoice({ idPrefix, script, errors, onEdit }: ScriptEditorProps) {
  const hintId = `${idPrefix}-hooks-hint`;
  const errorId = `${idPrefix}-hooks-error`;

  return (
    <fieldset className="min-w-0">
      <legend className="font-heading text-h3">{t.hooks.legend}</legend>
      <p id={hintId} className="mt-1 text-muted">
        {t.hooks.hint}
      </p>
      {errors.hooks && (
        <p id={errorId} className="mt-2 text-caption">
          {errors.hooks}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {script.hooks.map((hook, i) => (
          // Three hooks in a fixed order, so the index is a stable key.
          <div
            key={i}
            className="group flex flex-col gap-4 p-5 ring-1 ring-concrete ring-inset has-checked:bg-surface has-checked:ring-2 has-checked:ring-cream has-checked:[--ui-text-muted:var(--ui-surface-text-muted)]"
          >
            <label className="flex cursor-pointer items-center gap-3 self-start has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cream">
              <input
                type="radio"
                // A problem with the group moves focus to the first radio.
                id={i === 0 ? `${idPrefix}-hooks` : undefined}
                name={`${idPrefix}-hook`}
                checked={script.chosenHook === i}
                onChange={() => onEdit("hooks", (current) => ({ ...current, chosenHook: i }))}
                // Described by its own hook text first, like the idea cards by their details, then the hint.
                // The radio role does not support aria-invalid, so the group's error is linked here too.
                aria-describedby={`${idPrefix}-hook-${i} ${errors.hooks ? `${hintId} ${errorId}` : hintId}`}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full ring-2 ring-concrete ring-inset group-has-checked:ring-cream"
              >
                <span className="size-2.5 rounded-full bg-cream opacity-0 group-has-checked:opacity-100" />
              </span>
              <span className="font-heading text-h3">{fill(t.hooks.option, { n: i + 1 })}</span>
            </label>
            <TextField
              id={`${idPrefix}-hook-${i}`}
              label={fill(t.hooks.text, { n: i + 1 })}
              max={SCRIPT_LIMITS.hook}
              rows={3}
              value={hook}
              error={errors[`hook-${i}`]}
              onChange={(value) =>
                onEdit(`hook-${i}`, (current) => ({
                  ...current,
                  hooks: current.hooks.map((item, j) => (j === i ? value : item)),
                }))
              }
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  max: number;
  /** Rows of a textarea; without it the field is a single line. */
  rows?: number;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

// maxLength comes from the agent's own limits, so the form never accepts what the schema rejects.
function TextField({ id, label, max, rows, value, error, onChange }: TextFieldProps) {
  const shared = {
    id,
    value,
    maxLength: max,
    "aria-required": true,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-limit ${id}-error` : `${id}-limit`,
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-caption">
        {label}
      </label>
      {rows ? (
        <textarea
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClasses} resize-y`}
          {...shared}
        />
      ) : (
        <input
          type="text"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          className={inputClasses}
          {...shared}
        />
      )}
      <p id={`${id}-limit`} className="text-caption font-normal text-muted">
        {fill(t.form.limit, { max })}
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
