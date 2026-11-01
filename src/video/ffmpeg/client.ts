import type {
  CoreURLs,
  FFmpegJobRequest,
  FFmpegWorkerMessage,
  InputFs,
  ThreadMode,
} from "./protocol";

// The single-thread core is served from our own site (/ffmpeg/, copied from
// @ffmpeg/core on postinstall), with the pinned CDN version (the one
// @ffmpeg/ffmpeg 0.12.15 targets) as a fallback. The multi-thread core only
// loads from the CDN. Only the engine is downloaded; the user's video never
// leaves the browser.
const CORE_VERSION = "0.12.10";
const CDN = "https://cdn.jsdelivr.net/npm";
const LOCAL_BASE = "/ffmpeg";

// Blob URLs are cached per mode so the ~31 MB wasm is downloaded once per tab.
const coreURLCache = new Map<ThreadMode, Promise<CoreURLs>>();

async function fetchLocalCoreURLs(): Promise<CoreURLs> {
  const { toBlobURL } = await import("@ffmpeg/util");
  const jsPath = `${LOCAL_BASE}/ffmpeg-core.js`;
  const wasmPath = `${LOCAL_BASE}/ffmpeg-core.wasm`;
  // toBlobURL doesn't check the status, so a 404 page would become the "core".
  const heads = await Promise.all([jsPath, wasmPath].map((p) => fetch(p, { method: "HEAD" })));
  if (heads.some((r) => !r.ok)) throw new Error("Local ffmpeg core not found");
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(jsPath, "text/javascript"),
    toBlobURL(wasmPath, "application/wasm"),
  ]);
  return { coreURL, wasmURL };
}

async function fetchCoreURLs(mode: ThreadMode): Promise<CoreURLs> {
  if (mode === "st") {
    try {
      return await fetchLocalCoreURLs();
    } catch {
      // Fall through to the CDN.
    }
  }
  const { toBlobURL } = await import("@ffmpeg/util");
  // ESM build: the job worker is a module worker and imports the core with import().
  const base = `${CDN}/@ffmpeg/${mode === "mt" ? "core-mt" : "core"}@${CORE_VERSION}/dist/esm`;
  const [coreURL, wasmURL, workerURL] = await Promise.all([
    toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    mode === "mt"
      ? toBlobURL(`${base}/ffmpeg-core.worker.js`, "text/javascript")
      : undefined,
  ]);
  return { coreURL, wasmURL, workerURL };
}

function getCoreURLs(mode: ThreadMode): Promise<CoreURLs> {
  let urls = coreURLCache.get(mode);
  if (!urls) {
    urls = fetchCoreURLs(mode);
    // Don't cache a failed download, so a retry can succeed.
    urls.catch(() => coreURLCache.delete(mode));
    coreURLCache.set(mode, urls);
  }
  return urls;
}

/** The multi-thread core needs SharedArrayBuffer, which needs cross-origin isolation (COOP/COEP). */
export function canUseMultiThread(): boolean {
  return typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated === true;
}

export interface FFmpegJob {
  file: File;
  mode: ThreadMode;
  /** ffmpeg arguments; use INPUT_PATH_TOKEN where the input path goes. */
  args: string[];
  outputPath: string;
  timeoutMs: number;
  signal: AbortSignal;
  onLoaded?: () => void;
  onDuration?: (seconds: number) => void;
  onProgress?: (seconds: number) => void;
}

export interface FFmpegJobResult {
  /** Core download time; ~0 once cached in this tab. */
  downloadMs: number;
  initMs: number;
  mountMs: number;
  execMs: number;
  readMs: number;
  inputFs: InputFs;
  output: Uint8Array;
}

/**
 * Runs one ffmpeg job in a dedicated Web Worker. Rejects with the signal's
 * reason on abort; the worker is always terminated when the job settles.
 */
export async function runFFmpegJob({
  file,
  mode,
  args,
  outputPath,
  timeoutMs,
  signal,
  onLoaded,
  onDuration,
  onProgress,
}: FFmpegJob): Promise<FFmpegJobResult> {
  if (mode === "mt" && !canUseMultiThread()) {
    throw new Error("Multi-thread core requires crossOriginIsolated");
  }
  const downloadStart = performance.now();
  const core = await getCoreURLs(mode);
  const downloadMs = performance.now() - downloadStart;
  signal.throwIfAborted();

  const worker = new Worker(new URL("./ffmpeg.worker.ts", import.meta.url), { type: "module" });
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<FFmpegJobResult>((resolve, reject) => {
      let initMs = 0;
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      worker.onerror = (e) =>
        reject(new Error(e.message || "ffmpeg worker failed to start (check COEP headers)"));
      worker.onmessage = ({ data }: MessageEvent<FFmpegWorkerMessage>) => {
        switch (data.type) {
          case "loaded":
            initMs = data.initMs;
            onLoaded?.();
            break;
          case "duration":
            onDuration?.(data.seconds);
            break;
          case "progress":
            onProgress?.(data.seconds);
            break;
          case "done":
            resolve({
              downloadMs,
              initMs,
              mountMs: data.mountMs,
              execMs: data.execMs,
              readMs: data.readMs,
              inputFs: data.inputFs,
              output: data.output,
            });
            break;
          case "error":
            reject(new Error(data.message));
            break;
        }
      };
      const request: FFmpegJobRequest = { core, file, args, outputPath, timeoutMs };
      worker.postMessage(request);
    });
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    worker.terminate();
  }
}
