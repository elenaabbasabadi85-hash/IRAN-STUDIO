'use client';

import { useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import type { Project } from '@/core/types';
import fa from '@/i18n/fa.json';
import { formatNumber } from '@/i18n/format';
import { createProject } from '@/storage/db';
import { sampleChannel } from './sampleChannel';
import { MAX_LENGTH, parseNewProject, type NewProjectErrors, type NewProjectValues } from './schema';

const t = fa.studio.new;

const emptyValues: NewProjectValues = {
  entry: '',
  title: '',
  name: '',
  niche: '',
  audience: '',
  tone: '',
  avgLengthMin: '',
  sampleText: '',
  useColors: false,
  colors: { primary: '#000000', accent: '#ffffff' },
};

const emptySteps: Project['steps'] = { idea: 'empty', script: 'empty', writer: 'empty', editor: 'empty', video: 'empty' };

// Page order, so a failed submit can move focus to the first field with an error.
const fieldOrder: (keyof NewProjectErrors)[] = [
  'entry',
  'name',
  'niche',
  'audience',
  'tone',
  'avgLengthMin',
  'sampleText',
  'colors.primary',
  'colors.accent',
  'title',
];

const fieldId = (key: string) => `new-project-${key.replace('.', '-')}`;

const inputClasses = `w-full bg-navy px-3 py-2.5 text-cream ring-1 ring-concrete ring-inset aria-invalid:ring-2 aria-invalid:ring-live-red ${focusRing}`;

export function NewProjectForm() {
  const router = useRouter();
  const [values, setValues] = useState<NewProjectValues>(emptyValues);
  const [errors, setErrors] = useState<NewProjectErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const resetWhenHidden = useRef(false);

  // Next keeps this page mounted but hidden after navigating away (Activity). Once a project
  // is created, start fresh next time; a draft the user left without submitting is kept.
  useLayoutEffect(() => {
    return () => {
      if (!resetWhenHidden.current) return;
      resetWhenHidden.current = false;
      setValues(emptyValues);
      setErrors({});
      setSubmitted(false);
      setCreating(false);
    };
  }, []);

  // After the first submit, errors follow the values as the user fixes them.
  function change(next: NewProjectValues) {
    setValues(next);
    if (submitted) {
      const result = parseNewProject(next);
      setErrors(result.success ? {} : result.errors);
    }
  }

  function update<K extends keyof NewProjectValues>(key: K, value: NewProjectValues[K]) {
    change({ ...values, [key]: value });
  }

  function fillSample() {
    change({
      ...values,
      name: sampleChannel.name,
      niche: sampleChannel.niche,
      audience: sampleChannel.audience,
      tone: sampleChannel.tone,
      avgLengthMin: formatNumber(sampleChannel.avgLengthMin),
      sampleText: sampleChannel.sampleText ?? '',
      useColors: sampleChannel.colors !== undefined,
      colors: sampleChannel.colors ?? values.colors,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setSubmitted(true);
    setCreateError(false);

    const result = parseNewProject(values);
    if (!result.success) {
      setErrors(result.errors);
      const first = fieldOrder.find((key) => result.errors[key]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }

    setErrors({});
    setCreating(true);
    try {
      const project = await createProject({ ...result.project, steps: emptySteps });
      resetWhenHidden.current = true;
      // The idea page is not built yet, so an idea project opens its own page.
      router.push(project.entry === 'raw-video' ? `/studio/${project.id}/record/upload` : `/studio/${project.id}`);
    } catch {
      setCreateError(true);
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col items-start gap-4">
        <Button variant="ghost" size="sm" href="/studio" className="-ms-4">
          {t.back}
        </Button>
        <h1>{t.title}</h1>
        <p className="max-w-2xl text-muted">{t.intro}</p>
        <Button onClick={fillSample}>{t.fillSample}</Button>
      </header>

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-12">
        <RadioGroup
          id={fieldId('entry')}
          legend={t.entry.legend}
          layout="cards"
          value={values.entry}
          error={errors.entry}
          onChange={(entry) => update('entry', entry)}
          options={[
            { value: 'idea', label: t.entry.idea.title, description: t.entry.idea.description },
            { value: 'raw-video', label: t.entry['raw-video'].title, description: t.entry['raw-video'].description },
          ]}
        />

        <fieldset className="flex flex-col gap-6">
          <Legend>{t.channel.legend}</Legend>

          <TextField
            id={fieldId('name')}
            label={t.channel.name}
            value={values.name}
            error={errors.name}
            maxLength={MAX_LENGTH.name}
            onChange={(name) => update('name', name)}
          />
          <TextField
            id={fieldId('niche')}
            label={t.channel.niche}
            hint={t.channel.nicheHint}
            value={values.niche}
            error={errors.niche}
            maxLength={MAX_LENGTH.niche}
            onChange={(niche) => update('niche', niche)}
          />
          <TextField
            id={fieldId('audience')}
            label={t.channel.audience}
            hint={t.channel.audienceHint}
            value={values.audience}
            error={errors.audience}
            maxLength={MAX_LENGTH.audience}
            onChange={(audience) => update('audience', audience)}
          />
          <RadioGroup
            id={fieldId('tone')}
            legend={t.channel.tone}
            layout="pills"
            value={values.tone}
            error={errors.tone}
            onChange={(tone) => update('tone', tone)}
            options={(['formal', 'casual', 'mixed'] as const).map((tone) => ({ value: tone, label: t.channel.tones[tone] }))}
          />
          <TextField
            id={fieldId('avgLengthMin')}
            label={t.channel.avgLengthMin}
            value={values.avgLengthMin}
            error={errors.avgLengthMin}
            inputMode="numeric"
            maxLength={5}
            className="max-w-32"
            onChange={(length) => update('avgLengthMin', length)}
          />
          <TextField
            id={fieldId('sampleText')}
            label={t.channel.sampleText}
            hint={t.channel.sampleTextHint}
            optional
            multiline
            value={values.sampleText}
            error={errors.sampleText}
            maxLength={MAX_LENGTH.sampleText}
            onChange={(text) => update('sampleText', text)}
          />

          <div className="flex flex-col gap-3">
            <label className="flex w-fit cursor-pointer items-center gap-3 text-caption">
              <input
                type="checkbox"
                checked={values.useColors}
                onChange={(event) => update('useColors', event.target.checked)}
                className={`size-5 cursor-pointer accent-cream ${focusRing}`}
              />
              {t.channel.colorsToggle}
              <span className="font-normal text-muted">{t.optional}</span>
            </label>
            {values.useColors && (
              <div className="flex flex-wrap gap-6 ps-8">
                {(['primary', 'accent'] as const).map((key) => (
                  <ColorField
                    key={key}
                    id={fieldId(`colors.${key}`)}
                    label={key === 'primary' ? t.channel.primaryColor : t.channel.accentColor}
                    value={values.colors[key]}
                    error={errors[`colors.${key}`]}
                    onChange={(color) => update('colors', { ...values.colors, [key]: color })}
                  />
                ))}
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-6">
          <Legend>{t.project.legend}</Legend>
          <TextField
            id={fieldId('title')}
            label={t.project.title}
            hint={t.project.titleHint}
            optional
            value={values.title}
            error={errors.title}
            maxLength={MAX_LENGTH.title}
            onChange={(title) => update('title', title)}
          />
        </fieldset>

        <div className="flex flex-col items-start gap-4">
          {createError && (
            <p role="alert" className="text-accent">
              {t.createError}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={creating}>
            {t.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Legend({ children }: { children: ReactNode }) {
  return <legend className="mb-6 font-heading text-h3">{children}</legend>;
}

function describedBy(id: string, hint?: string, error?: string) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
}

function FieldMessages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="text-caption font-normal text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption text-accent">
          {error}
        </p>
      )}
    </>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  optional?: boolean;
  multiline?: boolean;
  maxLength?: number;
  inputMode?: 'numeric';
  className?: string;
}

function TextField({ id, label, value, onChange, hint, error, optional, multiline, maxLength, inputMode, className = '' }: TextFieldProps) {
  const shared = {
    id,
    value,
    maxLength,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, hint, error),
    'aria-required': optional ? undefined : true,
    className: `${inputClasses} ${className}`,
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-caption">
        {label}
        {optional && <span className="font-normal text-muted"> {t.optional}</span>}
      </label>
      {multiline ? (
        <textarea rows={4} onChange={(event) => onChange(event.target.value)} {...shared} />
      ) : (
        <input
          type="text"
          autoComplete="off"
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          {...shared}
        />
      )}
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

interface RadioGroupProps<T extends string> {
  id: string;
  legend: string;
  layout: 'cards' | 'pills';
  options: { value: T; label: string; description?: string }[];
  value: T | '';
  error?: string;
  onChange: (value: T) => void;
}

// Native radios (keyboard: Tab into the group, arrows to move) drawn as cards or pills.
function RadioGroup<T extends string>({ id, legend, layout, options, value, error, onChange }: RadioGroupProps<T>) {
  const cards = layout === 'cards';

  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined} className="flex flex-col gap-3">
      {cards ? <Legend>{legend}</Legend> : <legend className="mb-2 text-caption">{legend}</legend>}
      <div className={cards ? 'grid gap-4 sm:grid-cols-2' : 'flex flex-wrap gap-2'}>
        {options.map((option, index) => (
          <label
            key={option.value}
            className={`group cursor-pointer ring-1 ring-inset has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cream ${
              error ? 'ring-live-red' : 'ring-concrete'
            } ${
              cards
                ? 'flex gap-4 p-5 has-checked:bg-surface has-checked:ring-2 has-checked:ring-cream has-checked:[--ui-text-muted:var(--ui-surface-text-muted)]'
                : 'px-4 py-2 text-caption has-checked:bg-cream has-checked:text-navy has-checked:ring-cream'
            }`}
          >
            <input
              type="radio"
              id={index === 0 ? id : undefined}
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {cards && (
              <span
                aria-hidden="true"
                className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full ring-2 ring-concrete ring-inset group-has-checked:ring-cream"
              >
                <span className="size-2.5 rounded-full bg-cream opacity-0 group-has-checked:opacity-100" />
              </span>
            )}
            <span className="flex flex-col gap-1">
              <span className={cards ? 'font-heading text-h3' : ''}>{option.label}</span>
              {option.description && <span className="text-muted">{option.description}</span>}
            </span>
          </label>
        ))}
      </div>
      <FieldMessages id={id} error={error} />
    </fieldset>
  );
}

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function ColorField({ id, label, value, error, onChange }: ColorFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-caption">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          id={id}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, undefined, error)}
          onChange={(event) => onChange(event.target.value)}
          className={`h-11 w-16 cursor-pointer bg-navy p-1 ring-1 ring-concrete ring-inset ${focusRing}`}
        />
        <span dir="ltr" className="font-latin text-caption font-normal text-muted">
          {value.toUpperCase()}
        </span>
      </div>
      <FieldMessages id={id} error={error} />
    </div>
  );
}
