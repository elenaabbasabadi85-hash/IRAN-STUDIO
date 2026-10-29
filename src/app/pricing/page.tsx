import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import fa from '@/i18n/fa.json';
import { PricingPlans } from './PricingPlans';

const t = fa.pricing;

export const metadata: Metadata = {
  title: t.metaTitle,
};

// Sample subscription plans with a demo purchase; there is no real payment.
export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-8 sm:py-14">
      <header className="flex flex-col items-start gap-4">
        <Button variant="ghost" size="sm" href="/" className="-ms-4">
          {t.back}
        </Button>
        <h1>{t.title}</h1>
        <p className="max-w-2xl text-muted">{t.intro}</p>
        <Link
          href="/#how-it-works"
          className={`font-bold text-cream underline decoration-1 underline-offset-8 hover:decoration-2 ${focusRing}`}
        >
          {t.howItWorks}
        </Link>
      </header>

      <PricingPlans />

      <p className="self-start border border-dashed border-concrete px-4 py-2 text-caption font-normal text-muted">
        {t.sampleNote}
      </p>
    </main>
  );
}
