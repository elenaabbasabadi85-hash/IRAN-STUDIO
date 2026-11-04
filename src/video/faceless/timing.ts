// When each slide of a faceless video is on screen. Pure, so it can be tested without a browser.
import type { Script } from '@/core/types';

/** Shorter than this and a slide can't be read; only a very short take goes below it. */
export const MIN_SLIDE_SECONDS = 2;

export const HOOK_SECTION_ID = 'hook';
export const CTA_SECTION_ID = 'cta';
export const TITLE_SECTION_ID = 'title';

export interface SlidePart {
  sectionId: string;
  text: string;
  /** How long this part takes to say, compared with the others. */
  weight: number;
}

export interface PlannedSlide {
  sectionId: string;
  text: string;
  start: number;
  end: number;
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * The same order as the teleprompter: the chosen hook, every section, the call to action. A section
 * shows its title, since its whole text would not fit on a slide. Hook and call to action have no
 * time of their own, so `estimate` gives one. Without a script, one slide shows the project's title.
 */
export function slideParts(script: Script | undefined, title: string, estimate: (text: string) => number): SlidePart[] {
  const parts: SlidePart[] = [];
  const hook = script?.hooks[script.chosenHook ?? 0]?.trim();
  if (hook) parts.push({ sectionId: HOOK_SECTION_ID, text: hook, weight: estimate(hook) });
  for (const section of script?.sections ?? []) {
    const text = section.title.trim() || section.text.trim();
    if (text) parts.push({ sectionId: section.id, text, weight: section.estSeconds });
  }
  const cta = script?.cta.trim();
  if (cta) parts.push({ sectionId: CTA_SECTION_ID, text: cta, weight: estimate(cta) });
  return parts.length > 0 ? parts : [{ sectionId: TITLE_SECTION_ID, text: title.trim(), weight: 1 }];
}

/** Stretches the estimated times to the real length of the audio, keeping their proportions. */
function slideLengths(weights: number[], duration: number): number[] {
  const count = weights.length;
  if (duration <= count * MIN_SLIDE_SECONDS) return weights.map(() => duration / count);

  // A slide that would be too short gets the minimum, and the others share what is left.
  const atMinimum = new Set<number>();
  for (;;) {
    const rest = duration - atMinimum.size * MIN_SLIDE_SECONDS;
    const totalWeight = weights.reduce((sum, weight, i) => (atMinimum.has(i) ? sum : sum + weight), 0);
    const scale = rest / totalWeight;
    const tooShort = weights.flatMap((weight, i) => (!atMinimum.has(i) && weight * scale < MIN_SLIDE_SECONDS ? [i] : []));
    if (tooShort.length === 0) {
      return weights.map((weight, i) => (atMinimum.has(i) ? MIN_SLIDE_SECONDS : weight * scale));
    }
    tooShort.forEach((i) => atMinimum.add(i));
  }
}

/** The slides follow each other with no gap and end exactly at `duration`. */
export function planSlides(parts: SlidePart[], duration: number): PlannedSlide[] {
  const weights = parts.map((part) => (part.weight > 0 ? part.weight : 1));
  const lengths = slideLengths(weights, duration);
  let elapsed = 0;
  return parts.map(({ sectionId, text }, i) => {
    const start = round(elapsed);
    elapsed += lengths[i];
    return { sectionId, text, start, end: i === parts.length - 1 ? duration : round(elapsed) };
  });
}
