'use client';

import { useRouter } from 'next/navigation';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RecDot } from '@/components/ui/RecDot';
import fa from '@/i18n/fa.json';
import { format, formatAmount } from '@/i18n/format';
import { PLANS, type Plan, type PlanId } from './plans';

const t = fa.pricing;

// Long enough to read the message before the new-project page opens.
const REDIRECT_DELAY_MS = 2000;

export function PricingPlans() {
  const router = useRouter();
  const [activated, setActivated] = useState<PlanId | null>(null);
  const timer = useRef<number | null>(null);

  // Next keeps this page mounted but hidden after the user leaves it (Activity). Start fresh
  // next time, and never redirect from a page the user has already left.
  useLayoutEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setActivated(null);
    };
  }, []);

  // Demo purchase for the jury: no payment, no card details, nothing saved.
  function subscribe(plan: PlanId) {
    if (activated) return;
    setActivated(plan);
    timer.current = window.setTimeout(() => router.push('/studio/new'), REDIRECT_DELAY_MS);
  }

  return (
    <>
      <ul className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} activated={activated} onSubscribe={subscribe} />
        ))}
      </ul>

      {/* Always in the document, so screen readers announce the message when it appears. */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center">
        {activated && (
          <p className="pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-3 bg-navy p-4 font-bold ring-2 ring-cream ring-inset">
            {t.demo.activated}
            <Badge tone="outline">{t.demo.badge}</Badge>
          </p>
        )}
      </div>
    </>
  );
}

interface PlanCardProps {
  plan: Plan;
  activated: PlanId | null;
  onSubscribe: (plan: PlanId) => void;
}

// One plan, after the subscription card of the brand guide: navy card, REC dot, price, features,
// and for the recommended plan the corner ribbon and the red button.
// Its five parts sit on the list's rows (subgrid), so prices and buttons line up across the cards
// even when one description takes two lines.
function PlanCard({ plan, activated, onSubscribe }: PlanCardProps) {
  const nameId = useId();
  const { name, text } = t.plans[plan.id];

  return (
    <li className="relative row-span-5 grid grid-rows-subgrid gap-6 overflow-hidden bg-navy p-6 ring-1 ring-denim ring-inset sm:p-8">
      {plan.recommended && (
        <span className="absolute top-5 -left-11 w-40 -rotate-45 bg-signal-red py-1 text-center text-caption text-cream">
          {t.recommended}
        </span>
      )}
      <div className="flex items-center gap-3">
        <RecDot />
        <h2 id={nameId} className="text-h3">
          {name}
        </h2>
      </div>
      <p className="text-muted">{text}</p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-heading text-h2">{format(t.price, { amount: formatAmount(plan.price) })}</span>
        <span className="text-muted">{t.perMonth}</span>
      </p>
      <ul className="flex flex-col gap-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-baseline gap-3">
            <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-0.2em] rounded-full bg-concrete" />
            {t.features[feature]}
          </li>
        ))}
      </ul>
      <Button
        variant={plan.recommended ? 'primary' : 'secondary'}
        size="lg"
        className="mt-auto w-full"
        aria-describedby={nameId}
        loading={activated === plan.id}
        disabled={activated !== null && activated !== plan.id}
        onClick={() => onSubscribe(plan.id)}
      >
        {t.subscribe}
      </Button>
    </li>
  );
}
