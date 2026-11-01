// Pure helpers for short clips: suggests clips from a transcript, without any API key, and
// checks the times a user types.
import type { ShortSuggestion, Transcript, TranscriptWord } from "@/core/types";

/** A suggested clip is never shorter than this, unless the whole speech is. */
export const MIN_SHORT_SECONDS = 20;
/** The longest clip, suggested or typed. */
export const MAX_SHORT_SECONDS = 60;
/** A clip a user types can be shorter than a suggested one, but not shorter than this. */
export const MIN_EDITED_SECONDS = 1;
export const MAX_SUGGESTIONS = 5;
/** A pause between words at least this long (seconds) ends a sentence. */
const SENTENCE_PAUSE_SECONDS = 0.7;
/** Seconds kept before the first word and after the last one, so words aren't clipped. */
const PADDING_SECONDS = 0.15;
const MAX_HOOK_CHARS = 80;
const SENTENCE_END_RE = /[.!?؟…]$/;

export type ShortRangeError = "order" | "tooShort" | "tooLong" | "outside";

interface Sentence {
  start: number;
  end: number;
  words: string[];
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** Words that start inside the video, sorted by start. A demo transcript can outlast the video. */
function usableWords(words: TranscriptWord[], duration: number): TranscriptWord[] {
  return words
    .filter((w) => w.w.trim() !== "" && Number.isFinite(w.start) && Number.isFinite(w.end) && w.start < duration)
    .map((w) => ({ w: w.w.trim(), start: w.start, end: Math.max(w.start, w.end) }))
    .sort((a, b) => a.start - b.start);
}

/** Speech with no punctuation or pauses still breaks at MAX_SHORT_SECONDS. */
function splitSentences(words: TranscriptWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  let current: Sentence | undefined;
  for (const word of words) {
    if (current && word.end - current.start > MAX_SHORT_SECONDS) current = undefined;
    if (current && word.start - current.end >= SENTENCE_PAUSE_SECONDS) current = undefined;
    if (!current) {
      current = { start: word.start, end: word.end, words: [] };
      sentences.push(current);
    }
    current.words.push(word.w);
    current.end = Math.max(current.end, word.end);
    if (SENTENCE_END_RE.test(word.w)) current = undefined;
  }
  return sentences;
}

/** Joins sentences in order into clips of MIN_SHORT_SECONDS or more. A shorter tail is dropped. */
function groupSentences(sentences: Sentence[]): Sentence[][] {
  const groups: Sentence[][] = [];
  let group: Sentence[] = [];
  for (const sentence of sentences) {
    // Too short to stand alone and too long with the next sentence, so it is left out.
    if (group.length > 0 && sentence.end - group[0].start > MAX_SHORT_SECONDS) group = [];
    group.push(sentence);
    if (sentence.end - group[0].start >= MIN_SHORT_SECONDS) {
      groups.push(group);
      group = [];
    }
  }
  return groups;
}

function hookText(sentence: Sentence): string {
  const hook = sentence.words.join(" ");
  const chars = [...hook];
  return chars.length <= MAX_HOOK_CHARS ? hook : `${chars.slice(0, MAX_HOOK_CHARS).join("").trimEnd()}…`;
}

function toSuggestion(group: Sentence[], duration: number): ShortSuggestion {
  const start = round(Math.max(0, group[0].start - PADDING_SECONDS));
  const end = round(Math.min(duration, group.at(-1)!.end + PADDING_SECONDS, start + MAX_SHORT_SECONDS));
  return { start, end, hook: hookText(group[0]) };
}

function wordsPerSecond(group: Sentence[]): number {
  const count = group.reduce((sum, sentence) => sum + sentence.words.length, 0);
  return count / Math.max(MIN_EDITED_SECONDS, group.at(-1)!.end - group[0].start);
}

/**
 * Suggests up to MAX_SUGGESTIONS clips of MIN_SHORT_SECONDS to MAX_SHORT_SECONDS, without
 * overlapping speech and in time order. With more than that, the densest speech is kept. Speech
 * too short for one clip becomes one clip. No speech gives no suggestions.
 */
export function suggestShorts(transcript: Transcript, duration: number): ShortSuggestion[] {
  if (!(duration > 0)) return [];
  const sentences = splitSentences(usableWords(transcript.words, duration));
  if (sentences.length === 0) return [];

  const groups = groupSentences(sentences);
  if (groups.length === 0) return [toSuggestion(sentences, duration)];
  return groups
    .map((group, order) => ({ group, order, density: wordsPerSecond(group) }))
    .sort((a, b) => b.density - a.density || a.order - b.order)
    .slice(0, MAX_SUGGESTIONS)
    .sort((a, b) => a.order - b.order)
    .map(({ group }) => toSuggestion(group, duration));
}

/** Why a typed time range can't be cut, or null when it can. */
export function shortRangeError(start: number, end: number, duration: number): ShortRangeError | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration) return "outside";
  if (end <= start) return "order";
  if (end - start < MIN_EDITED_SECONDS) return "tooShort";
  if (end - start > MAX_SHORT_SECONDS) return "tooLong";
  return null;
}
