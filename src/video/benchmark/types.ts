import type { InputFs, ThreadMode } from "@/video/ffmpeg/protocol";

export type { InputFs, ThreadMode };
export type Resolution = 720 | 1080;
export type X264Preset = "ultrafast" | "veryfast";

interface RunInfo {
  mode: ThreadMode;
  resolution: Resolution;
  preset: X264Preset;
}

export interface BenchmarkSuccess extends RunInfo {
  ok: true;
  /** Core download (0 when cached in this tab) + wasm init. */
  loadMs: number;
  mountMs: number;
  /** Time spent in ffmpeg.exec: the cut + scale + encode itself. */
  exportMs: number;
  readMs: number;
  totalMs: number;
  /** Length of the exported clip in seconds (≤ CLIP_SECONDS). */
  clipSeconds: number;
  outputBytes: number;
  inputFs: InputFs;
  /** Object URL of the exported MP4, so the cut can be checked by eye. */
  outputUrl: string;
}

export interface BenchmarkFailure extends RunInfo {
  ok: false;
  cancelled: boolean;
  /** Raw error from ffmpeg plus the last log lines; technical detail, not UI copy. */
  error: string;
}

export type BenchmarkResult = BenchmarkSuccess | BenchmarkFailure;
