// Cuts one 9:16 clip out of the source video with ffmpeg.wasm, entirely in the browser.
// -ss before -i seeks instead of decoding everything before the clip, so a clip late in a long
// video costs about the same as an early one. The default stream choice keeps silent videos working.
import { runFFmpegJob } from "@/video/ffmpeg/client";
import { INPUT_PATH_TOKEN } from "@/video/ffmpeg/protocol";
import { SHORT_PRESET, shortVideoFilter } from "@/video/shorts/frame";

const OUTPUT_FILE = "short.mp4";
const OUTPUT_TYPE = "video/mp4";
const EXEC_TIMEOUT_MS = 60 * 60 * 1000;
const MEMORY_RE = /out of memory|OOM|Cannot enlarge memory|Aborted\(\)/i;

export type MakeShortErrorCode = "memory" | "ffmpeg";

export class MakeShortError extends Error {
  constructor(readonly code: MakeShortErrorCode) {
    super(code);
    this.name = "MakeShortError";
  }
}

export type MakeShortProgress =
  | { phase: "loading" }
  /** ratio of the clip encoded so far, 0..1. */
  | { phase: "encoding"; ratio: number };

export interface MakeShortOptions {
  video: Blob;
  start: number;
  end: number;
  /** See shortVideoFilter. */
  position: number;
  signal: AbortSignal;
  onProgress?: (progress: MakeShortProgress) => void;
}

/** Rejects with the signal's reason when cancelled, otherwise with MakeShortError. */
export async function makeShort({ video, start, end, position, signal, onProgress }: MakeShortOptions): Promise<Blob> {
  const seconds = end - start;
  onProgress?.({ phase: "loading" });
  try {
    const job = await runFFmpegJob({
      file: new File([video], "source", { type: video.type }),
      mode: "st",
      args: [
        "-ss", String(start),
        "-t", String(seconds),
        "-i", INPUT_PATH_TOKEN,
        "-vf", shortVideoFilter(position),
        "-c:v", "libx264",
        "-preset", SHORT_PRESET,
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        OUTPUT_FILE,
      ],
      outputPath: OUTPUT_FILE,
      timeoutMs: EXEC_TIMEOUT_MS,
      signal,
      onLoaded: () => onProgress?.({ phase: "encoding", ratio: 0 }),
      // The progress time is the output's, so it is compared with the clip's length.
      onProgress: (done) => onProgress?.({ phase: "encoding", ratio: Math.min(1, Math.max(0, done / seconds)) }),
    });
    return new Blob([job.output as BlobPart], { type: OUTPUT_TYPE });
  } catch (e) {
    if (signal.aborted) throw signal.reason;
    const message = e instanceof Error ? e.message : String(e);
    throw new MakeShortError(MEMORY_RE.test(message) ? "memory" : "ffmpeg");
  }
}
