// Contract between the browser (transcribe.ts) and POST /api/transcribe. Imported by both sides.
import type { TranscriptWord } from "@/core/types";

/** Vercel caps request bodies at 4.5 MB, so one audio chunk must stay under 4 MB. */
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

/** Audio types Groq Whisper accepts (flac, mp3, mp4, m4a, ogg, wav, webm). */
export const ALLOWED_AUDIO_TYPES: readonly string[] = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/x-flac",
];

/** Drops parameters such as `;codecs=opus` before comparing. */
export function baseMimeType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

export interface TranscribeResponse {
  /** Word times are relative to the start of the uploaded chunk. */
  words: TranscriptWord[];
  /** True when the server has no API key and returned the sample transcript. */
  demo: boolean;
}

export interface TranscribeErrorResponse {
  /** Persian message, safe to show to the user. */
  error: string;
}
