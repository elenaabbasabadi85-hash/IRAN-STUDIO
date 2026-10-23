// Pure helpers for automatic silence removal: turns a transcript's word times into cut
// segments and works out which parts of the video are kept.
import type { CutSegment, Transcript } from "@/core/types";

export interface SilenceOptions {
  /** A pause between words at least this long (seconds) becomes a cut. */
  minGap: number;
  /** Seconds of the pause kept on each side of speech, so words aren't clipped. */
  padding: number;
}

export const DEFAULT_SILENCE_OPTIONS: SilenceOptions = { minGap: 0.7, padding: 0.15 };

/** Cuts or kept pieces shorter than this are dropped; they would only cause a visible jump. */
export const MIN_SEGMENT_SECONDS = 0.05;

export interface TimeRange {
  start: number;
  end: number;
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * Finds pauses in the transcript, including before the first word and after the
 * last one. Overlapping word times are handled by measuring each gap from the
 * latest end so far. The result is sorted and has no overlaps. An empty
 * transcript gives no cuts, so a video with no detected speech is never removed whole.
 */
export function findSilenceCuts(
  transcript: Transcript,
  duration: number,
  { minGap, padding }: SilenceOptions = DEFAULT_SILENCE_OPTIONS,
): CutSegment[] {
  const words = transcript.words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end))
    .sort((a, b) => a.start - b.start);
  if (words.length === 0 || !(duration > 0)) return [];

  const cuts: CutSegment[] = [];
  const add = (start: number, end: number) => {
    cuts.push({ start, end, reason: "silence" });
  };

  if (words[0].start >= minGap) add(0, words[0].start - padding);
  let spokenUntil = Math.max(words[0].start, words[0].end);
  for (const word of words.slice(1)) {
    if (word.start - spokenUntil >= minGap) add(spokenUntil + padding, word.start - padding);
    spokenUntil = Math.max(spokenUntil, word.end);
  }
  if (duration - spokenUntil >= minGap) add(spokenUntil + padding, duration);

  return normalizeCuts(cuts, duration);
}

/**
 * Clamps cuts to [0, duration], drops tiny ones, sorts them and merges cuts that
 * overlap or touch. A merged cut keeps the reason of its first part.
 */
export function normalizeCuts(cuts: CutSegment[], duration: number): CutSegment[] {
  const sorted = cuts
    .map((c) => ({ ...c, start: round(Math.max(0, c.start)), end: round(Math.min(duration, c.end)) }))
    .filter((c) => c.end - c.start >= MIN_SEGMENT_SECONDS)
    .sort((a, b) => a.start - b.start);

  const merged: CutSegment[] = [];
  for (const cut of sorted) {
    const last = merged.at(-1);
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else merged.push(cut);
  }
  return merged;
}

/** The parts of [0, duration] that remain after the cuts, in order. */
export function keptSegments(cuts: CutSegment[], duration: number): TimeRange[] {
  const kept: TimeRange[] = [];
  let from = 0;
  for (const cut of normalizeCuts(cuts, duration)) {
    if (cut.start - from >= MIN_SEGMENT_SECONDS) kept.push({ start: from, end: cut.start });
    from = cut.end;
  }
  if (duration - from >= MIN_SEGMENT_SECONDS) kept.push({ start: from, end: round(duration) });
  return kept;
}

export function totalSeconds(ranges: TimeRange[]): number {
  return round(ranges.reduce((sum, r) => sum + (r.end - r.start), 0));
}
