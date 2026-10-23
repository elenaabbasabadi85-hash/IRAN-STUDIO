// Runs one ffmpeg job off the main thread. A fresh worker is used per job and
// terminated afterwards, which also frees the wasm memory.
import {
  INPUT_PATH_TOKEN,
  type CoreURLs,
  type FFmpegJobRequest,
  type FFmpegWorkerMessage,
  type InputFs,
} from "./protocol";

// The slice of the ffmpeg-core module API used here (full types: @ffmpeg/types).
interface FFmpegCore {
  FS: {
    mkdir(path: string): void;
    mount(type: unknown, options: { files: File[] }, mountPoint: string): void;
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string, options: { encoding: "binary" }): Uint8Array;
    filesystems: { WORKERFS?: unknown };
  };
  ret: number;
  exec(...args: string[]): number;
  reset(): void;
  setTimeout(ms: number): void;
  setLogger(logger: (log: { type: string; message: string }) => void): void;
  setProgress(handler: (progress: { progress: number; time: number }) => void): void;
}

type FFmpegCoreFactory = (overrides: { mainScriptUrlOrBlob: string }) => Promise<FFmpegCore>;

const INPUT_DIR = "/input";
const LOG_TAIL_LINES = 6;
const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<FFmpegJobRequest>) => void) | null;
  postMessage(message: FFmpegWorkerMessage, transfer?: Transferable[]): void;
};

async function loadCore({ coreURL, wasmURL, workerURL }: CoreURLs): Promise<FFmpegCore> {
  // The core is a blob URL resolved at runtime, so the bundler must leave this import alone.
  const { default: createFFmpegCore } = (await import(
    /* webpackIgnore: true */ coreURL
  )) as { default: FFmpegCoreFactory };
  // Same convention as @ffmpeg/ffmpeg's worker: the core's locateFile reads the
  // wasm and pthread-worker URLs from the hash of mainScriptUrlOrBlob.
  return createFFmpegCore({
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
  });
}

/** WORKERFS reads the File lazily, so a large video isn't copied into wasm memory. */
async function attachInput(ffmpeg: FFmpegCore, file: File): Promise<{ path: string; fs: InputFs }> {
  const workerfs = ffmpeg.FS.filesystems.WORKERFS;
  if (workerfs) {
    try {
      ffmpeg.FS.mkdir(INPUT_DIR);
      ffmpeg.FS.mount(workerfs, { files: [file] }, INPUT_DIR);
      return { path: `${INPUT_DIR}/${file.name}`, fs: "workerfs" };
    } catch {
      // Fall back to the in-memory copy below.
    }
  }
  ffmpeg.FS.writeFile("input", new Uint8Array(await file.arrayBuffer()));
  return { path: "input", fs: "memfs" };
}

scope.onmessage = async ({ data: job }) => {
  const logTail: string[] = [];
  try {
    const initStart = performance.now();
    const ffmpeg = await loadCore(job.core);
    scope.postMessage({ type: "loaded", initMs: performance.now() - initStart });

    let durationSent = false;
    ffmpeg.setLogger(({ message }) => {
      logTail.push(message);
      if (logTail.length > LOG_TAIL_LINES) logTail.shift();
      const m = durationSent ? null : DURATION_RE.exec(message);
      if (m) {
        durationSent = true;
        scope.postMessage({
          type: "duration",
          seconds: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]),
        });
      }
    });
    // `time` is in microseconds.
    ffmpeg.setProgress(({ time }) => scope.postMessage({ type: "progress", seconds: time / 1e6 }));

    const mountStart = performance.now();
    const input = await attachInput(ffmpeg, job.file);
    const mountMs = performance.now() - mountStart;

    const args = job.args.map((arg) => (arg === INPUT_PATH_TOKEN ? input.path : arg));
    ffmpeg.setTimeout(job.timeoutMs);
    const execStart = performance.now();
    ffmpeg.exec(...args);
    const execMs = performance.now() - execStart;
    const code = ffmpeg.ret;
    ffmpeg.reset();
    if (code !== 0) {
      throw new Error(execMs >= job.timeoutMs ? "ffmpeg timeout" : `ffmpeg exit code ${code}`);
    }

    const readStart = performance.now();
    const output = ffmpeg.FS.readFile(job.outputPath, { encoding: "binary" });
    const readMs = performance.now() - readStart;
    scope.postMessage(
      { type: "done", mountMs, execMs, readMs, inputFs: input.fs, output },
      [output.buffer as ArrayBuffer],
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    scope.postMessage({ type: "error", message: [message, ...logTail].join("\n") });
  }
};
