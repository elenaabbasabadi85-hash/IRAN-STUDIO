// Removes the cut segments from a video with ffmpeg.wasm, entirely in the browser.
// Every kept piece is trimmed out of the source and the pieces are joined with the concat
// filter. Re-encoding (instead of stream copy) lets cuts land on any frame, not only on
// keyframes, so the result has no jumps or frozen frames at the joins.
import type { CutSegment } from "@/core/types";
import { keptSegments, totalSeconds, type TimeRange } from "@/video/cuts";
import { runFFmpegJob } from "@/video/ffmpeg/client";
import { INPUT_PATH_TOKEN } from "@/video/ffmpeg/protocol";

const OUTPUT_FILE = "cut.mp4";
const OUTPUT_TYPE = "video/mp4";
const EXEC_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * ffmpeg.wasm can't address more than about 2 GB, and the finished video is held in
 * wasm memory before it is handed back. Above this source size the page warns first.
 */
export const MEMORY_WARN_BYTES = 1024 * 1024 * 1024;

export type ApplyCutsErrorCode = "nothingLeft" | "memory" | "ffmpeg";

export class ApplyCutsError extends Error {
  constructor(readonly code: ApplyCutsErrorCode) {
    super(code);
    this.name = "ApplyCutsError";
  }
}

export type ApplyCutsProgress =
  | { phase: "loading" }
  /** ratio of the kept length encoded so far, 0..1. */
  | { phase: "encoding"; ratio: number };

export interface ApplyCutsOptions {
  video: Blob;
  cuts: CutSegment[];
  /** Length of the source video in seconds. */
  duration: number;
  signal: AbortSignal;
  onProgress?: (progress: ApplyCutsProgress) => void;
}

export interface ApplyCutsResult {
  video: Blob;
  /** Length of the result in seconds. */
  duration: number;
}

const MEMORY_RE = /out of memory|OOM|Cannot enlarge memory|Aborted\(\)/i;

function filterGraph(kept: TimeRange[]): string {
  const parts = kept.map(
    ({ start, end }, i) =>
      `[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}];` +
      `[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`,
  );
  const inputs = kept.map((_, i) => `[v${i}][a${i}]`).join("");
  // H.264 with yuv420p needs even dimensions; phone recordings are sometimes odd-sized.
  return [
    ...parts,
    `${inputs}concat=n=${kept.length}:v=1:a=1[vc][a]`,
    "[vc]scale=trunc(iw/2)*2:trunc(ih/2)*2[v]",
  ].join(";");
}

/** Rejects with the signal's reason when cancelled, otherwise with ApplyCutsError. */
export async function applyCuts({ video, cuts, duration, signal, onProgress }: ApplyCutsOptions): Promise<ApplyCutsResult> {
  const kept = keptSegments(cuts, duration);
  if (kept.length === 0) throw new ApplyCutsError("nothingLeft");
  const keptSeconds = totalSeconds(kept);

  onProgress?.({ phase: "loading" });
  try {
    const job = await runFFmpegJob({
      file: new File([video], "source", { type: video.type }),
      mode: "st",
      args: [
        "-i", INPUT_PATH_TOKEN,
        "-filter_complex", filterGraph(kept),
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
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
      // The progress time is the output's, so it is compared with the kept length.
      onProgress: (seconds) =>
        onProgress?.({ phase: "encoding", ratio: Math.min(1, Math.max(0, seconds / keptSeconds)) }),
    });
    return { video: new Blob([job.output as BlobPart], { type: OUTPUT_TYPE }), duration: keptSeconds };
  } catch (e) {
    if (signal.aborted) throw signal.reason;
    const message = e instanceof Error ? e.message : String(e);
    throw new ApplyCutsError(MEMORY_RE.test(message) ? "memory" : "ffmpeg");
  }
}
