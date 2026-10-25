'use client';

import { useState } from 'react';
import { Button, type ButtonSize } from '@/components/ui/Button';
import fa from '@/i18n/fa.json';

const t = fa.showcase.button;

type DemoState = keyof typeof t.states;
type DemoElement = keyof typeof t.elements;

// The page may hold only one primary button, so its states are switched here instead of listed.
export function PrimaryButtonDemo() {
  const [size, setSize] = useState<ButtonSize>('md');
  const [state, setState] = useState<DemoState>('default');
  const [element, setElement] = useState<DemoElement>('button');

  const shared = {
    variant: 'primary',
    size,
    disabled: state === 'disabled',
    loading: state === 'loading',
  } as const;

  function simulateWork() {
    setState('loading');
    window.setTimeout(() => setState((current) => (current === 'loading' ? 'default' : current)), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-h-20 items-center">
        {element === 'link' ? (
          <Button {...shared} href="/">
            {t.sampleLink}
          </Button>
        ) : (
          <Button {...shared} onClick={simulateWork}>
            {t.sample}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Choice legend={t.sizeLegend} name="primary-size" options={t.sizes} value={size} onChange={setSize} />
        <Choice legend={t.stateLegend} name="primary-state" options={t.states} value={state} onChange={setState} />
        <Choice legend={t.elementLegend} name="primary-element" options={t.elements} value={element} onChange={setElement} />
      </div>
    </div>
  );
}

interface ChoiceProps<T extends string> {
  legend: string;
  name: string;
  options: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

function Choice<T extends string>({ legend, name, options, value, onChange }: ChoiceProps<T>) {
  return (
    <fieldset>
      <legend className="mb-2 text-caption text-muted">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((key) => (
          <label
            key={key}
            className="cursor-pointer px-3 py-1.5 text-caption ring-1 ring-concrete ring-inset has-checked:bg-cream has-checked:text-navy has-checked:ring-cream has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cream"
          >
            <input
              type="radio"
              name={name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
              className="sr-only"
            />
            {options[key]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
