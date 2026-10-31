// Pure helpers for SRT subtitles: groups a transcript's words into cues, moves word times onto
// the shortened video when silence was cut, and writes the SRT text.
import type { CutSegment, Transcript, TranscriptWord } from "@/core/types";
import type { TimeRange } from "@/video/cuts";

/** A pause between words at least this long (seconds) starts a new cue. */
export const MAX_PAUSE_SECONDS = 0.6;
/** A cue's text never grows past this many characters, unless one word alone is longer. */
export const MAX_CUE_CHARS = 42;
/** A cue never lasts longer than this, unless one word alone does. */
export const MAX_CUE_SECONDS = 6;
/** Each cue stays on screen at least this long, as far as the next cue allows. */
export const MIN_CUE_SECONDS = 0.8;

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** Drops words without text or valid times and sorts the rest by start. */
function cleanWords(words: TranscriptWord[]): TranscriptWord[] {
  return words
    .filter((w) => w.w.trim() !== "" && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ w: w.w.trim(), start: w.start, end: Math.max(w.start, w.end) }))
    .sort((a, b) => a.start - b.start);
}

/**
 * The length keptSegments needs: the latest word or cut end. The subtitle page never loads
 * the video, and anything after the last word has no subtitle anyway.
 */
export function subtitleDuration(words: TranscriptWord[], cuts: CutSegment[] = []): number {
  return Math.max(0, ...cleanWords(words).map((w) => w.end), ...cuts.map((c) => c.end));
}

/**
 * Moves word times from the raw video onto the video made of the kept segments. A word stays
 * when its middle falls in a kept segment; it is clamped to that segment, so a word half inside
 * a cut keeps only its kept part. Words whose middle is inside a cut are dropped.
 */
export function retimeWords(words: TranscriptWord[], kept: TimeRange[]): TranscriptWord[] {
  const result: TranscriptWord[] = [];
  for (const word of cleanWords(words)) {
    const middle = (word.start + word.end) / 2;
    let offset = 0;
    for (const segment of kept) {
      const last = segment === kept.at(-1);
      if (middle >= segment.start && (middle < segment.end || (last && middle === segment.end))) {
        const shift = offset - segment.start;
        result.push({
          w: word.w,
          start: round(Math.max(word.start, segment.start) + shift),
          end: round(Math.min(word.end, segment.end) + shift),
        });
        break;
      }
      offset += segment.end - segment.start;
    }
  }
  return result;
}

/**
 * Groups words into cues. A new cue starts after a pause of MAX_PAUSE_SECONDS or more, or when
 * the next word would push the cue past MAX_CUE_CHARS or MAX_CUE_SECONDS. Short cues are then
 * lengthened to MIN_CUE_SECONDS, but never past the start of the next cue.
 */
export function buildCues(words: TranscriptWord[]): Cue[] {
  const cues: Cue[] = [];
  let current: Cue | undefined;
  for (const word of cleanWords(words)) {
    const breaks =
      !current ||
      word.start - current.end >= MAX_PAUSE_SECONDS ||
      `${current.text} ${word.w}`.length > MAX_CUE_CHARS ||
      word.end - current.start > MAX_CUE_SECONDS;
    if (breaks) {
      current = { start: word.start, end: word.end, text: word.w };
      cues.push(current);
    } else if (current) {
      current.text = `${current.text} ${word.w}`;
      current.end = Math.max(current.end, word.end);
    }
  }

  return cues.map((cue, i) => {
    const next = cues[i + 1];
    let end = Math.max(cue.end, cue.start + MIN_CUE_SECONDS);
    if (next) end = Math.min(end, next.start);
    return { start: round(cue.start), end: round(Math.max(end, cue.start)), text: cue.text };
  });
}

/** Cues for a transcript; with kept segments, timed for the video with the cuts removed. */
export function buildSubtitles(transcript: Transcript, kept?: TimeRange[]): Cue[] {
  return buildCues(kept ? retimeWords(transcript.words, kept) : transcript.words);
}

/** "HH:MM:SS,mmm" in Latin digits, as SRT requires. */
export function srtTime(seconds: number): string {
  const total = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 1000);
  const ms = total % 1000;
  const secs = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / 60_000) % 60;
  const hours = Math.floor(total / 3_600_000);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
}

/** Number, times, text and a blank line per cue. No cues give an empty string. */
export function srtText(cues: Cue[]): string {
  return cues.map((cue, i) => `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n\n`).join("");
}

// A byte order mark, so older Windows players read the Persian text as UTF-8.
const BOM = String.fromCharCode(0xfeff);

export function srtBlob(text: string): Blob {
  return new Blob([BOM + text], { type: "application/x-subrip;charset=utf-8" });
}
