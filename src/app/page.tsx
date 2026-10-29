import fa from '@/i18n/fa.json';

const t = fa.home;

// Temporary brand preview; the real landing page is issue #8.
// Class names stay literal so Tailwind finds them in the source.
const swatches = [
  { key: 'navy', className: 'bg-navy' },
  { key: 'signalRed', className: 'bg-signal-red' },
  { key: 'liveRed', className: 'bg-live-red' },
  { key: 'denim', className: 'bg-denim' },
  { key: 'cream', className: 'bg-cream' },
  { key: 'concrete', className: 'bg-concrete' },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-8 sm:px-8 sm:py-12">
      <p dir="ltr" className="flex items-center gap-2 self-start font-latin-display text-lg tracking-widest text-accent">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-live-red motion-safe:animate-rec" />
        {t.rec}
      </p>

      <section className="flex flex-col items-start gap-6">
        <h1>{t.name}</h1>
        <p className="cut-edge px-6 pt-2 pb-3 pe-12 font-display text-display text-cream">
          <span aria-hidden="true" className="cut-fill bg-signal-red" />
          {t.slogan}
        </p>
        <p className="max-w-xl">{t.intro}</p>
      </section>

      <section aria-labelledby="palette-title" className="flex flex-col gap-6">
        <h2 id="palette-title">{t.palette.title}</h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
          {swatches.map(({ key, className }) => (
            <li key={key} className="flex flex-col gap-3">
              <div className={`${className} aspect-[4/3] ring-1 ring-cream/15 ring-inset`} />
              <div>
                <h3>{t.palette.colors[key].name}</h3>
                <p className="text-caption text-muted">{t.palette.colors[key].role}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
