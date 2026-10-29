import { Button } from '@/components/ui/Button';
import { RecDot } from '@/components/ui/RecDot';
import fa from '@/i18n/fa.json';
import { format, formatNumber } from '@/i18n/format';

const t = fa.landing;

// Two-digit step numbers in Persian digits, like the 01–08 of the brand guide.
const stepNumber = (n: number) => formatNumber(n).padStart(2, '۰');

// Home page, laid out after brand guide 1.1: the slogan, the one-line pitch, the one primary
// button (start a project) and a side path to the subscription page, then the workflow.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-4 py-8 sm:px-8 sm:py-14">
      <section aria-labelledby="home-title" className="flex flex-col items-start gap-6">
        <p dir="ltr" className="flex items-center gap-2 self-start font-latin-display text-lg tracking-widest text-accent">
          <RecDot blinking />
          {t.rec}
        </p>
        <h1 id="home-title">{t.name}</h1>
        <p className="cut-edge px-6 pt-2 pb-3 pe-12 font-display text-display text-cream">
          <span aria-hidden="true" className="cut-fill bg-signal-red" />
          {t.slogan}
        </p>
        <p className="font-heading text-h3">{t.descriptor}</p>
        <p className="max-w-3xl">{t.oneLiner}</p>
        <p className="max-w-3xl text-muted">{t.raw}</p>
        <div className="flex flex-wrap gap-4">
          <Button variant="primary" size="lg" href="/studio/new">
            {t.start}
          </Button>
          <Button size="lg" href="/pricing">
            {t.seePlans}
          </Button>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="flow-title" className="flex scroll-mt-8 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 id="flow-title">{t.flow.title}</h2>
          <p className="max-w-3xl text-muted">{t.flow.intro}</p>
        </div>

        <Part number={1} title={t.flow.content.title} steps={t.flow.content.steps} first={1} tone="red" />

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-dashed border-live-red px-5 py-4">
          <span dir="ltr" className="font-latin-display tracking-widest text-accent">
            {t.rec}
          </span>
          <span className="font-heading text-h3">{t.flow.rec.label}</span>
          <span className="text-muted">{t.flow.rec.text}</span>
        </p>

        <Part number={2} title={t.flow.video.title} steps={t.flow.video.steps} first={5} tone="denim" />

        <ul className="grid gap-4 md:grid-cols-2">
          {t.flow.entries.map((entry, index) => (
            <li key={entry.title} className="relative flex flex-col gap-2 p-6 ps-8 ring-1 ring-denim ring-inset">
              {/* Signal red is a background colour only (see globals.css), so the bar is its own element. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 start-0 w-1 ${index === 0 ? 'bg-signal-red' : 'bg-denim'}`}
              />
              <span className="text-caption font-normal text-muted">{entry.label}</span>
              <h3>{entry.title}</h3>
              <p className="text-muted">{entry.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

interface PartProps {
  number: number;
  title: string;
  steps: { title: string; text: string }[];
  /** Number of the first step, so part 2 goes on from 5. */
  first: number;
  tone: 'red' | 'denim';
}

// One part of the studio: a slanted label, a title and its steps as blocks.
function Part({ number, title, steps, first, tone }: PartProps) {
  const fill = tone === 'red' ? 'bg-signal-red' : 'bg-denim';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="cut-edge inline-block px-3 py-0.5 pe-5 text-caption text-cream">
          <span aria-hidden="true" className={`cut-fill ${fill}`} />
          {format(t.flow.part, { number })}
        </span>
        <h3>{title}</h3>
      </div>
      <ol start={first} className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.title} className={`flex flex-col gap-2 p-5 text-cream ${fill}`}>
            <span aria-hidden="true" className="text-caption font-normal">
              {stepNumber(first + index)}
            </span>
            <span className="font-heading text-h3">{step.title}</span>
            <span className="text-caption font-normal">{step.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
