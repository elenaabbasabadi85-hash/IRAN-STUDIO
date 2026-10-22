import { runFFmpegJob } from "@/video/ffmpeg/client";
import { INPUT_PATH_TOKEN } from "@/video/ffmpeg/protocol";
import type { BenchmarkResult, Resolution, ThreadMode, X264Preset } from "./types";

/** The issue asks for a 2-minute cut. */
export const CLIP_SECONDS = 120;
const CUT_START_SECONDS = 0;
/** A stuck run (core-mt can hang) is stopped after this. */
const EXEC_TIMEOUT_MS = 30 * 60 * 1000;
const OUTPUT_FILE = "out.mp4";

export interface BenchmarkOptions {
  file: File;
  mode: ThreadMode;
  resolution: Resolution;
  preset: X264Preset;
  signal: AbortSignal;
  /** Called with 0..1 during the export phase. */
  onProgress?: (ratio: number) => void;
  onPhase?: (phase: "loading" | "exporting") => void;
}

function exportArgs(resolution: Resolution, preset: X264Preset): string[] {
  return [
    "-ss", String(CUT_START_SECONDS),
    "-t", String(CLIP_SECONDS),
    "-i", INPUT_PATH_TOKEN,
    "-vf", `scale=-2:${resolution}`,
    "-c:v", "libx264",
    "-preset", preset,
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    OUTPUT_FILE,
  ];
}

/**
 * Cuts the first CLIP_SECONDS of `file` and exports it at `resolution` with
 * ffmpeg.wasm in a Web Worker, timing each phase. Never throws.
 */
export async function runExportBenchmark({
  file,
  mode,
  resolution,
  preset,
  signal,
  onProgress,
  onPhase,
}: BenchmarkOptions): Promise<BenchmarkResult> {
  const info = { mode, resolution, preset };
  let inputSeconds: number | undefined;
  const clipSeconds = () => Math.min(CLIP_SECONDS, inputSeconds ?? CLIP_SECONDS);

  try {
    const start = performance.now();
    onPhase?.("loading");
    const job = await runFFmpegJob({
      file,
      mode,
      args: exportArgs(resolution, preset),
      outputPath: OUTPUT_FILE,
      timeoutMs: EXEC_TIMEOUT_MS,
      signal,
      onLoaded: () => {
        onPhase?.("exporting");
        onProgress?.(0);
      },
      onDuration: (seconds) => {
        inputSeconds = seconds;
      },
      // ffmpeg's own progress ratio is relative to the whole input, which is
      // wrong for a cut, so compute it against the clip length instead.
      onProgress: (seconds) => onProgress?.(Math.min(1, Math.max(0, seconds / clipSeconds()))),
    });

    return {
      ...info,
      ok: true,
      loadMs: job.downloadMs + job.initMs,
      mountMs: job.mountMs,
      exportMs: job.execMs,
      readMs: job.readMs,
      totalMs: performance.now() - start,
      clipSeconds: clipSeconds(),
      outputBytes: job.output.byteLength,
      inputFs: job.inputFs,
      outputUrl: URL.createObjectURL(new Blob([job.output as BlobPart], { type: "video/mp4" })),
    };
  } catch (e) {
    return {
      ...info,
      ok: false,
      cancelled: signal.aborted,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
