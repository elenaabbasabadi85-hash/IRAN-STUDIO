import type { PublishKit } from '@/core/types';
import fa from '@/i18n/fa.json';
// The Content lane's sample: what the writer agent answers without a key. Read here, never changed.
import writerSample from '../../../../../fixtures/writer.json';

// Where each chapter starts (seconds), taken from the sentences of fixtures/transcript.json.
const CHAPTER_STARTS = [0, 11, 22, 27, 33];

// Sample publish kit for demo mode, shown while a project has none and never saved to it.
// Titles, cover texts, description and hashtags are the writer agent's own sample, so the demo tells
// one story. The writer writes no chapters (it works before recording), so the sample chapters stay here.
export const samplePublishKit: PublishKit = {
  titles: writerSample.titles,
  coverTexts: writerSample.coverTexts,
  description: writerSample.description,
  hashtags: writerSample.hashtags,
  chapters: fa.publish.sample.chapters.map((title, index) => ({ start: CHAPTER_STARTS[index] ?? 0, title })),
};
