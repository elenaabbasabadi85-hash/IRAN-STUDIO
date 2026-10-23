import type { BenchmarkResult, BenchmarkSuccess, Resolution, ThreadMode } from "./types";

/** 1080p is recommended only if it exports no slower than the clip plays (≤ 1× realtime). */
export const REALTIME_BUDGET = 1;
/** 1080p has 2.25× the pixels of 720p; used when 1080p was not measured. */
const PIXEL_RATIO_1080_TO_720 = (1920 * 1080) / (1280 * 720);

export type RecommendationReason =
  | "fast1080"
  | "slow1080"
  | "failed1080"
  | "estimatedFast1080"
  | "estimatedSlow1080";

export interface Recommendation {
  resolution: Resolution;
  reason: RecommendationReason;
  /** Thread mode the decision is based on (the fastest one). */
  mode: ThreadMode;
  /** Measured or estimated 1080p export time in seconds (null when 1080p failed). */
  export1080Seconds: number | null;
  clipSeconds: number;
}

function fastest(results: BenchmarkResult[], resolution: Resolution): BenchmarkSuccess | undefined {
  return results
    .filter((r): r is BenchmarkSuccess => r.ok && r.resolution === resolution)
    .sort((a, b) => a.exportMs - b.exportMs)[0];
}

export function recommendResolution(results: BenchmarkResult[]): Recommendation | null {
  const best720 = fastest(results, 720);
  const best1080 = fastest(results, 1080);

  if (best1080) {
    const seconds = best1080.exportMs / 1000;
    const fast = seconds <= best1080.clipSeconds * REALTIME_BUDGET;
    return {
      resolution: fast ? 1080 : 720,
      reason: fast ? "fast1080" : "slow1080",
      mode: best1080.mode,
      export1080Seconds: seconds,
      clipSeconds: best1080.clipSeconds,
    };
  }
  if (!best720) return null;

  const failed1080 = results.some((r) => !r.ok && !r.cancelled && r.resolution === 1080);
  if (failed1080) {
    return {
      resolution: 720,
      reason: "failed1080",
      mode: best720.mode,
      export1080Seconds: null,
      clipSeconds: best720.clipSeconds,
    };
  }

  const estimated = (best720.exportMs / 1000) * PIXEL_RATIO_1080_TO_720;
  const fast = estimated <= best720.clipSeconds * REALTIME_BUDGET;
  return {
    resolution: fast ? 1080 : 720,
    reason: fast ? "estimatedFast1080" : "estimatedSlow1080",
    mode: best720.mode,
    export1080Seconds: estimated,
    clipSeconds: best720.clipSeconds,
  };
}
