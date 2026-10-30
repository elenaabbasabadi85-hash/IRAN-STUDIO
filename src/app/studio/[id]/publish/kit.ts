// Pure helpers for the publish page: which output files go into the ZIP, their names inside it,
// and the text file with the chosen title, description, chapters and hashtags.
import type { OutputFile, PublishKit } from '@/core/types';

export type FileKind = 'video' | 'short' | 'srt' | 'cover';

export interface PickedOutputs {
  video?: OutputFile;
  srt?: OutputFile;
  cover?: OutputFile;
  /** Oldest first, so their numbers follow the order they were made in. */
  shorts: OutputFile[];
}

/**
 * Every export adds a new output, so only the newest video, subtitle and cover are kept, while
 * every short is kept. "description" outputs are left out: the text file is built from the kit.
 */
export function pickOutputs(outputs: OutputFile[]): PickedOutputs {
  const picked: PickedOutputs = { shorts: [] };
  for (const output of outputs) {
    if (output.kind === 'short') {
      picked.shorts.push(output);
    } else if (output.kind !== 'description') {
      const current = picked[output.kind];
      // On equal times the later entry wins: it was added to the list later.
      if (!current || output.createdAt >= current.createdAt) picked[output.kind] = output;
    }
  }
  picked.shorts.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return picked;
}

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const DEFAULT_EXTENSIONS: Record<FileKind, string> = { video: 'mp4', short: 'mp4', srt: 'srt', cover: 'png' };

/** OutputFile records no file type, so the extension comes from the stored file's own type (Blob.type). */
export function extensionFor(kind: FileKind, mimeType: string): string {
  if (kind === 'srt') return 'srt';
  const type = mimeType.split(';')[0].trim().toLowerCase();
  return EXTENSIONS[type] ?? DEFAULT_EXTENSIONS[kind];
}

export interface ZipNames {
  video: string;
  short: (number: number) => string;
  srt: string;
  cover: string;
}

export function outputFileName(kind: FileKind, mimeType: string, names: ZipNames, number = 1): string {
  const base = kind === 'short' ? names.short(number) : names[kind];
  return `${base}.${extensionFor(kind, mimeType)}`;
}

// Characters Windows does not allow in file names. The backslash is spelled as a char code.
const FORBIDDEN = new Set(['<', '>', ':', '"', '/', String.fromCharCode(92), '|', '?', '*']);

const ZWNJ = 0x200c;

// Invisible format characters (bidi marks, zero-width joiners, BOM). Chrome turns each of them
// into "_" in a download's name, so «پروژه‌ی» would arrive as «پروژه_ی».
function isFormatChar(code: number): boolean {
  return (
    code === 0x061c ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/**
 * The ZIP is named after the project. Characters a file name cannot hold become spaces, a
 * zero-width non-joiner becomes a space too, and the other invisible format characters go.
 */
export function zipFileName(title: string, fallback: string): string {
  const cleaned = [...title]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (FORBIDDEN.has(char) || code < 32 || code === ZWNJ) return ' ';
      return isFormatChar(code) ? '' : char;
    })
    .slice(0, 100)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows drops trailing dots and spaces.
    .replace(/[. ]+$/, '');
  return `${cleaned || fallback}.zip`;
}

/** "m:ss", or "h:mm:ss" from one hour on, in Latin digits: YouTube reads only these as chapters. */
export function chapterTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

export function toPersianDigits(text: string): string {
  return text.replace(/[0-9]/g, (digit) => String.fromCharCode(0x6f0 + Number(digit)));
}

export function sortedChapters(chapters: PublishKit['chapters']): NonNullable<PublishKit['chapters']> {
  return [...(chapters ?? [])].sort((a, b) => a.start - b.start);
}

/** One chapter per line, as YouTube expects them in a description. */
export function chaptersText(chapters: PublishKit['chapters']): string {
  return sortedChapters(chapters)
    .map((chapter) => `${chapterTime(chapter.start)} ${chapter.title}`)
    .join('\n');
}

/** A missing # is added, and spaces inside a tag become _ so the tag stays one word. */
export function hashtagList(hashtags: string[]): string[] {
  return hashtags
    .map((tag) => tag.trim().replace(/^#+/, '').trim().replace(/\s+/g, '_'))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
}

/** The title shown as chosen: the kit's choice when it is valid, otherwise the first title. */
export function chosenTitleIndex(kit: PublishKit): number {
  const index = kit.chosenTitle ?? 0;
  return Number.isInteger(index) && index >= 0 && index < kit.titles.length ? index : 0;
}

export interface TextLabels {
  demo: string;
  title: string;
  description: string;
  chapters: string;
  hashtags: string;
  coverTexts: string;
}

// A byte order mark, so older Windows editors open the Persian text as UTF-8.
const BOM = String.fromCharCode(0xfeff);

/** The text file inside the ZIP. Parts that are empty are left out. */
export function publishText(kit: PublishKit, chosenTitle: number, labels: TextLabels, demo: boolean): string {
  const blocks: string[] = [];
  if (demo) blocks.push(labels.demo);
  const title = kit.titles[chosenTitle] ?? kit.titles[0];
  if (title?.trim()) blocks.push(`${labels.title}:\n${title.trim()}`);
  if (kit.description.trim()) blocks.push(`${labels.description}:\n${kit.description.trim()}`);
  const chapters = chaptersText(kit.chapters);
  if (chapters) blocks.push(`${labels.chapters}:\n${chapters}`);
  const tags = hashtagList(kit.hashtags);
  if (tags.length > 0) blocks.push(`${labels.hashtags}:\n${tags.join(' ')}`);
  const covers = kit.coverTexts.map((text) => text.trim()).filter(Boolean);
  if (covers.length > 0) blocks.push(`${labels.coverTexts}:\n${covers.map((text) => `- ${text}`).join('\n')}`);
  return `${BOM}${blocks.join('\n\n')}\n`;
}

/**
 * "a، b و c". Written by hand: Intl.ListFormat for Persian adds a comma before «و» and
 * invisible right-to-left marks after each comma.
 */
export function listText(items: string[], separator: string, and: string): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(separator)}${and}${items[items.length - 1]}`;
}

export type SizeUnit = 'kb' | 'mb' | 'gb';

/** Bytes as kilobytes, megabytes or gigabytes, with one decimal; never below 0.1 KB. */
export function fileSize(bytes: number): { size: number; unit: SizeUnit } {
  const round = (value: number) => Math.round(value * 10) / 10;
  const kb = bytes / 1024;
  if (kb < 1024) return { size: Math.max(0.1, round(kb)), unit: 'kb' };
  const mb = kb / 1024;
  if (mb < 1024) return { size: round(mb), unit: 'mb' };
  return { size: round(mb / 1024), unit: 'gb' };
}
