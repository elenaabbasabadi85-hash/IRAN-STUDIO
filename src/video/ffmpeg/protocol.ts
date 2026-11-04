// Messages between the main thread (client.ts) and ffmpeg.worker.ts.

export type ThreadMode = "st" | "mt";

/** How the source video reached ffmpeg: mounted lazily (WORKERFS) or copied into wasm memory (MEMFS). */
export type InputFs = "workerfs" | "memfs";

/** Placeholder in `args` that the worker replaces with the input file's path inside ffmpeg's FS. */
export const INPUT_PATH_TOKEN = "{input}";

/** Where the input files sit inside ffmpeg's FS. */
export const INPUT_DIR = "/input";

/** The path of a file from extraFiles, for a job's arguments. */
export function extraInputPath(name: string): string {
  return `${INPUT_DIR}/${name}`;
}

export interface CoreURLs {
  coreURL: string;
  wasmURL: string;
  /** Only for the multi-thread core (pthread worker script). */
  workerURL?: string;
}

export interface FFmpegJobRequest {
  core: CoreURLs;
  file: File;
  /** More input files for a job that needs several, such as images and audio. Names must be unique. */
  extraFiles?: File[];
  args: string[];
  outputPath: string;
  timeoutMs: number;
}

export type FFmpegWorkerMessage =
  | { type: "loaded"; initMs: number }
  /** Input duration in seconds, parsed from ffmpeg's log. */
  | { type: "duration"; seconds: number }
  /** Seconds of media encoded so far. */
  | { type: "progress"; seconds: number }
  | {
      type: "done";
      mountMs: number;
      execMs: number;
      readMs: number;
      inputFs: InputFs;
      output: Uint8Array;
    }
  /** Error text followed by the last ffmpeg log lines. */
  | { type: "error"; message: string };
