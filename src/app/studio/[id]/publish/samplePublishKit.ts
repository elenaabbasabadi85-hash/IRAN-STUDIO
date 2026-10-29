import type { PublishKit } from '@/core/types';
import fa from '@/i18n/fa.json';

const sample = fa.publish.sample;

// Where each chapter starts (seconds), taken from the sentences of fixtures/transcript.json.
const CHAPTER_STARTS = [0, 11, 22, 27, 33];

// Sample publish kit for demo mode, shown while a project has none and never saved to it.
// Temporary: fixtures has no sample publish kit yet; once the Content lane adds an official
// one there, this should read it instead.
export const samplePublishKit: PublishKit = {
  titles: sample.titles,
  coverTexts: sample.coverTexts,
  description: sample.description,
  hashtags: sample.hashtags,
  chapters: sample.chapters.map((title, index) => ({ start: CHAPTER_STARTS[index] ?? 0, title })),
};
