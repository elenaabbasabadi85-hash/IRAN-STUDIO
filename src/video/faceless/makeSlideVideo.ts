// Joins the slide images and the voice into one MP4 with ffmpeg.wasm, entirely in the browser.
// The concat demuxer reads one image at a time, so memory does not grow with the number of slides.
import { runFFmpegJob } from '@/video/ffmpeg/client';
import { INPUT_PATH_TOKEN, extraInputPath } from '@/video/ffmpeg/protocol';
import type { RenderedSlide } from './drawSlide';

const OUTPUT_FILE = 'slides.mp4';
const OUTPUT_TYPE = 'video/mp4';
const LIST_FILE = 'slides.txt';
const AUDIO_FILE = 'audio';
const EXEC_TIMEOUT_MS = 30 * 60 * 1000;
const MEMORY_RE = /out of memory|OOM|Cannot enlarge memory|Aborted\(\)/i;

/**
 * Low because nothing moves, but not 1: applyCuts trims on frame borders, so a low rate would move
 * the picture away from the sound at every cut. At 10 the error stays under 100 ms.
 */
const SLIDE_FPS = 10;
/** Measured on 60 s of audio: about 20 s and 1.6 MB, against about 42 s and 1.1 MB with veryfast. */
const SLIDE_PRESET = 'ultrafast';
/** The last slide runs past the voice, so -shortest ends the video with the real audio, not the estimate. */
const LAST_SLIDE_EXTRA_SECONDS = 1;

export type MakeSlideVideoErrorCode = 'memory' | 'ffmpeg';

export class MakeSlideVideoError extends Error {
  constructor(readonly code: MakeSlideVideoErrorCode) {
    super(code);
    this.name = 'MakeSlideVideoError';
  }
}

export type MakeSlideVideoProgress =
  | { phase: 'loading' }
  /** ratio of the video encoded so far, 0..1. */
  | { phase: 'encoding'; ratio: number };

export interface MakeSlideVideoOptions {
  audio: Blob;
  slides: RenderedSlide[];
  /** Length of the audio in seconds. */
  duration: number;
  signal: AbortSignal;
  onProgress?: (progress: MakeSlideVideoProgress) => void;
}

const imageName = (index: number) => `slide-${index}.png`;

/** The concat demuxer needs the last image listed twice, or it ignores that image's duration. */
function concatList(slides: RenderedSlide[]): string {
  const last = slides.length - 1;
  const lines = slides.flatMap(({ start, end }, i) => [
    `file '${imageName(i)}'`,
    `duration ${(end - start + (i === last ? LAST_SLIDE_EXTRA_SECONDS : 0)).toFixed(3)}`,
  ]);
  return ['ffconcat version 1.0', ...lines, `file '${imageName(last)}'`, ''].join('\n');
}

/** Rejects with the signal's reason when cancelled, otherwise with MakeSlideVideoError. */
export async function makeSlideVideo({ audio, slides, duration, signal, onProgress }: MakeSlideVideoOptions): Promise<Blob> {
  onProgress?.({ phase: 'loading' });
  try {
    const job = await runFFmpegJob({
      file: new File([concatList(slides)], LIST_FILE, { type: 'text/plain' }),
      extraFiles: [
        new File([audio], AUDIO_FILE, { type: audio.type }),
        ...slides.map((slide, i) => new File([slide.image], imageName(i), { type: slide.image.type })),
      ],
      mode: 'st',
      args: [
        '-f', 'concat',
        '-i', INPUT_PATH_TOKEN,
        '-i', extraInputPath(AUDIO_FILE),
        '-map', '0:v:0',
        '-map', '1:a:0',
        // Converting first turns each slide into YUV once; after fps it is every frame, which takes twice as long.
        '-vf', `format=yuv420p,fps=${SLIDE_FPS}`,
        '-c:v', 'libx264',
        '-preset', SLIDE_PRESET,
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        OUTPUT_FILE,
      ],
      outputPath: OUTPUT_FILE,
      timeoutMs: EXEC_TIMEOUT_MS,
      signal,
      onLoaded: () => onProgress?.({ phase: 'encoding', ratio: 0 }),
      // The progress time is the output's, so it is compared with the audio's length.
      onProgress: (seconds) => onProgress?.({ phase: 'encoding', ratio: Math.min(1, Math.max(0, seconds / duration)) }),
    });
    return new Blob([job.output as BlobPart], { type: OUTPUT_TYPE });
  } catch (e) {
    if (signal.aborted) throw signal.reason;
    const message = e instanceof Error ? e.message : String(e);
    throw new MakeSlideVideoError(MEMORY_RE.test(message) ? 'memory' : 'ffmpeg');
  }
}
