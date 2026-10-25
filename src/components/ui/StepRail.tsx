import Link from 'next/link';
import type { RoleId, StepStatus } from '@/core/types';
import fa from '@/i18n/fa.json';
import { format, formatNumber } from '@/i18n/format';
import { focusRing } from './focus';
import { RecDot } from './RecDot';

export type StepId = RoleId | 'record' | 'publish';

// The project from idea to publish, in the brand guide's order. The first step sits on the right (RTL).
export const STEP_ORDER: readonly StepId[] = ['idea', 'script', 'writer', 'editor', 'record', 'video', 'publish'];

export function stepName(step: StepId): string {
  return step === 'record' || step === 'publish' ? fa.steps[step] : fa.roles[step].title;
}

interface StepRailProps {
  /** Steps that are left out count as empty. */
  statuses: Partial<Record<StepId, StepStatus>>;
  current?: StepId;
  /** Link mode: each step with an href becomes a link (works from Server Components). */
  hrefs?: Partial<Record<StepId, string>>;
  /** Button mode, for Client Components: each step becomes a button. */
  onSelect?: (step: StepId) => void;
  className?: string;
}

// For navy backgrounds. On small screens only the markers show and the current step is named below.
export function StepRail({ statuses, current, hrefs, onSelect, className = '' }: StepRailProps) {
  const statusOf = (step: StepId): StepStatus => statuses[step] ?? 'empty';
  const details = (step: StepId, template: string) =>
    format(template, {
      number: STEP_ORDER.indexOf(step) + 1,
      total: STEP_ORDER.length,
      name: stepName(step),
      status: fa.status[statusOf(step)],
    });

  return (
    <nav aria-label={fa.steps.rail} className={className}>
      <ol className="flex">
        {STEP_ORDER.map((step, index) => {
          const status = statusOf(step);
          const isCurrent = step === current;
          const href = hrefs?.[step];
          const itemProps = {
            'aria-current': isCurrent ? ('step' as const) : undefined,
            className: `flex w-full flex-col items-center gap-2 px-1 py-1.5 text-center ${focusRing} ${
              href || onSelect ? 'cursor-pointer hover:bg-cream/10' : ''
            }`,
          };
          const content = (
            <>
              <StepMarker status={status} number={index + 1} current={isCurrent} />
              <span aria-hidden="true" className="flex flex-col text-caption max-sm:hidden">
                <span className="text-cream">{stepName(step)}</span>
                <span className="font-normal text-muted">{fa.status[status]}</span>
              </span>
              <span className="sr-only">{details(step, fa.steps.stepLabel)}</span>
            </>
          );

          return (
            <li
              key={step}
              className={`relative min-w-0 flex-1 ${
                index === 0
                  ? ''
                  : // The line from the previous marker to this one; solid once the previous step is approved.
                    `before:pointer-events-none before:absolute before:start-[-50%] before:end-1/2 before:top-[1.4375rem] before:h-0.5 ${
                      statusOf(STEP_ORDER[index - 1]) === 'approved' ? 'before:bg-cream' : 'before:bg-concrete/40'
                    }`
              }`}
            >
              {href ? (
                <Link href={href} {...itemProps}>
                  {content}
                </Link>
              ) : onSelect ? (
                <button type="button" onClick={() => onSelect(step)} {...itemProps}>
                  {content}
                </button>
              ) : (
                <div {...itemProps}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      {current && (
        <p aria-hidden="true" className="mt-2 text-center text-caption sm:hidden">
          {details(current, fa.steps.current)}
        </p>
      )}
    </nav>
  );
}

function StepMarker({ status, number, current }: { status: StepStatus; number: number; current: boolean }) {
  const base = `relative z-10 flex size-9 items-center justify-center rounded-full text-caption ${
    current ? 'outline-1 outline-offset-4 outline-cream' : ''
  }`;

  switch (status) {
    case 'approved':
      return (
        <span aria-hidden="true" className={`${base} bg-cream text-navy`}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={3} focusable="false">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      );
    case 'working':
      return (
        <span aria-hidden="true" className={`${base} bg-navy ring-2 ring-live-red ring-inset`}>
          <RecDot blinking />
        </span>
      );
    case 'ready':
      return (
        <span aria-hidden="true" className={`${base} bg-navy text-cream ring-2 ring-cream ring-inset`}>
          {formatNumber(number)}
        </span>
      );
    default:
      return (
        <span aria-hidden="true" className={`${base} bg-navy text-concrete ring-2 ring-concrete ring-inset`}>
          {formatNumber(number)}
        </span>
      );
  }
}
