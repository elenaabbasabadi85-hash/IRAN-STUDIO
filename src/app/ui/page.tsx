import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PlayTriangle } from '@/components/ui/PlayTriangle';
import { RecDot } from '@/components/ui/RecDot';
import { RoleCard } from '@/components/ui/RoleCard';
import { Surface } from '@/components/ui/Surface';
import type { RoleId, StepStatus } from '@/core/types';
import fa from '@/i18n/fa.json';
import { PrimaryButtonDemo } from './PrimaryButtonDemo';
import { StepRailDemo } from './StepRailDemo';

const t = fa.showcase;

export const metadata: Metadata = {
  title: t.metaTitle,
  robots: { index: false },
};

const sizes = ['sm', 'md', 'lg'] as const;
const states = ['default', 'disabled', 'loading'] as const;
const statuses = ['empty', 'working', 'ready', 'approved'] as const satisfies readonly StepStatus[];

// Every status appears at least once.
const roleCards: { role: RoleId; status: StepStatus }[] = [
  { role: 'idea', status: 'approved' },
  { role: 'script', status: 'ready' },
  { role: 'editor', status: 'working' },
  { role: 'video', status: 'empty' },
  { role: 'writer', status: 'empty' },
];

// Showcase of every UI component and state, for reviewing the brand components.
export default function UiShowcasePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col items-start gap-4">
        <p dir="ltr" className="flex items-center gap-2 font-latin-display text-lg tracking-widest text-accent">
          <RecDot blinking />
          {fa.home.rec}
        </p>
        <h1>{t.title}</h1>
        <p className="max-w-2xl">{t.intro}</p>
      </header>

      <Section id="button" title={t.button.title} description={t.button.description}>
        <div className="flex flex-col gap-4">
          <h3>{t.button.primary}</h3>
          <p className="max-w-2xl text-caption font-normal text-muted">{t.button.primaryNote}</p>
          <PrimaryButtonDemo />
        </div>

        {(['secondary', 'ghost'] as const).map((variant) => (
          <div key={variant} className="flex flex-col gap-5">
            <h3>{t.button[variant]}</h3>
            {states.map((state) => (
              <Specimen key={state} label={t.button.states[state]}>
                {sizes.map((size) => (
                  <Button
                    key={size}
                    variant={variant}
                    size={size}
                    disabled={state === 'disabled'}
                    loading={state === 'loading'}
                  >
                    {t.button.sizes[size]}
                  </Button>
                ))}
              </Specimen>
            ))}
            <Specimen label={t.button.linkRow}>
              <Button variant={variant} href="/">
                {t.button.sampleLink}
              </Button>
            </Specimen>
            <Specimen label={t.button.disabledLinkRow}>
              <Button variant={variant} href="/" disabled>
                {t.button.sampleLink}
              </Button>
            </Specimen>
          </div>
        ))}
      </Section>

      <Section id="rec-dot" title={t.recDot.title} description={t.recDot.description}>
        <div className="flex flex-wrap gap-x-12 gap-y-6">
          <Specimen label={t.recDot.still}>
            <RecDot />
          </Specimen>
          <Specimen label={t.recDot.blinking}>
            <RecDot blinking label={fa.status.working} />
          </Specimen>
          <Specimen label={t.recDot.sizes}>
            <RecDot size="sm" />
            <RecDot size="md" />
            <RecDot size="lg" />
          </Specimen>
        </div>
        <p className="max-w-2xl text-caption font-normal text-muted">{t.recDot.motionNote}</p>
      </Section>

      <Section id="play" title={t.play.title} description={t.play.description}>
        <div className="flex flex-wrap gap-x-12 gap-y-6">
          <Specimen label={t.play.sizes}>
            <PlayTriangle size={16} />
            <PlayTriangle size={24} />
            <PlayTriangle size={40} label={fa.ui.play} />
          </Specimen>
          <Specimen label={t.play.inButton}>
            <Button>
              <PlayTriangle size={16} />
              {t.play.button}
            </Button>
          </Specimen>
          <Specimen label={t.play.onCover}>
            <div className="flex aspect-video w-48 items-center justify-center bg-denim">
              <span className="flex size-14 items-center justify-center rounded-full bg-navy text-cream ring-2 ring-cream ring-inset">
                <PlayTriangle size={24} className="translate-x-0.5" />
              </span>
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="surface" title={t.surface.title} description={t.surface.description}>
        <div className="grid gap-6 sm:grid-cols-2">
          <Surface className="flex flex-col gap-3">
            <h3>{t.surface.cardTitle}</h3>
            <p className="text-muted">{t.surface.cardText}</p>
            <Badges />
          </Surface>
          <Surface cut className="flex flex-col gap-3 pb-8">
            <h3>{t.surface.cutTitle}</h3>
            <p className="text-muted">{t.surface.cutText}</p>
          </Surface>
        </div>
        <Specimen label={t.surface.onNavy}>
          <Badges />
        </Specimen>
      </Section>

      <Section id="role-card" title={t.roleCard.title} description={t.roleCard.description}>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {roleCards.map(({ role, status }) => (
            <li key={role} className="flex">
              <RoleCard role={role} status={status} className="w-full" />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="step-rail" title={t.stepRail.title} description={t.stepRail.description}>
        <StepRailDemo />
      </Section>
    </main>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-8 border-t border-concrete/40 pt-8">
      <div className="flex flex-col gap-2">
        <h2 id={id}>{title}</h2>
        <p className="max-w-2xl text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  );
}

function Badges() {
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  );
}
