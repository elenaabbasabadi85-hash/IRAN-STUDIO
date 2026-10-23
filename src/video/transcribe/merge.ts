// Pure helpers for splitting audio into overlapping chunks and stitching the words back together.
import type { TranscriptWord } from "@/core/types";

export interface ChunkPlan {
  /** Seconds from the start of the whole audio. */
  start: number;
  end: number;
}

export interface ChunkWords extends ChunkPlan {
  /** Word times relative to the chunk's own start. */
  words: TranscriptWord[];
}

/**
 * Splits [0, duration] into chunks of about `chunkSeconds` that overlap by
 * `overlapSeconds`. A short remainder is folded into the last chunk so no
 * chunk is only a few seconds long.
 */
export function planChunks(
  duration: number,
  chunkSeconds: number,
  overlapSeconds: number,
  minTailSeconds: number,
): ChunkPlan[] {
  const chunks: ChunkPlan[] = [];
  let start = 0;
  while (start < duration) {
    let end = Math.min(start + chunkSeconds, duration);
    if (duration - end < minTailSeconds) end = duration;
    chunks.push({ start, end });
    if (end >= duration) break;
    start = end - overlapSeconds;
  }
  return chunks;
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** Spelling-insensitive form of a word: no punctuation or ZWNJ, Arabic ي/ك as Persian ی/ک. */
function normalize(word: string): string {
  return word
    .replace(/[\s‌.,،؛;:!?؟«»"'()\-]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");
}

/** How far back to look for a word repeated by two chunks at their shared border. */
const DUPLICATE_LOOKBACK_WORDS = 3;
const DUPLICATE_WINDOW_SECONDS = 1;

/**
 * Shifts each chunk's words to absolute time and merges them into one list.
 * In an overlap, each side keeps the words that start before/after the middle
 * of the overlap, so a word cut at a chunk edge is taken from the chunk where
 * it is whole. Words that both chunks still report near the border are dropped
 * once. The result is sorted, with start ≤ end and starts never decreasing.
 */
export function mergeChunkWords(chunks: ChunkWords[]): TranscriptWord[] {
  const merged: TranscriptWord[] = [];
  chunks.forEach((chunk, i) => {
    const prev = chunks[i - 1];
    const next = chunks[i + 1];
    const from = prev ? (chunk.start + prev.end) / 2 : -Infinity;
    const to = next ? (next.start + chunk.end) / 2 : Infinity;
    // Only words from earlier chunks count as duplicates; a word said twice in a row stays.
    const earlier = merged.slice(-DUPLICATE_LOOKBACK_WORDS);

    for (const word of chunk.words) {
      const start = chunk.start + word.start;
      if (start < from || start >= to) continue;

      const key = normalize(word.w);
      const duplicate = earlier.some(
        (w) => normalize(w.w) === key && Math.abs(w.start - start) < DUPLICATE_WINDOW_SECONDS,
      );
      if (duplicate) continue;

      const last = merged.at(-1);
      const safeStart = round(Math.max(start, last?.start ?? 0));
      merged.push({
        w: word.w,
        start: safeStart,
        end: round(Math.max(chunk.start + word.end, safeStart)),
      });
    }
  });
  return merged;
}
