import type fa from '@/i18n/fa.json';

export type PlanId = keyof typeof fa.pricing.plans;
export type FeatureId = keyof typeof fa.pricing.features;

export interface Plan {
  id: PlanId;
  /** Monthly price in toman. */
  price: number;
  features: FeatureId[];
  /** The one plan with the red primary button and the corner ribbon. */
  recommended?: boolean;
}

// Sample plans for the demo (the page says prices and features are samples). The features are
// the list on the subscription card of brand guide 1.1, split by the studio's two parts.
export const PLANS: Plan[] = [
  { id: 'full', price: 449_000, features: ['idea', 'writing', 'edit', 'shorts', 'subtitles'], recommended: true },
  { id: 'content', price: 249_000, features: ['idea', 'writing'] },
  { id: 'video', price: 299_000, features: ['edit', 'shorts', 'subtitles'] },
];
