// Browser side of transcription: ffmpeg.wasm pulls a small mono MP3 out of the video,
// cuts it into overlapping chunks under 4 MB, sends them one by one to /api/transcribe,
// and stitches the words back into one Transcript. The video itself never leaves the browser.
import type { Transcript } from "@/core/types";
import { runFFmpegJob } from "@/video/ffmpeg/client";
import { INPUT_PATH_TOKEN } from "@/video/ffmpeg/protocol";
import { mergeChunkWords, planChunks, type ChunkWords } from "./merge";
import {
  MAX_CHUNK_BYTES,
  type TranscribeErrorResponse,
  type TranscribeResponse,
} from "./protocol";

const ENDPOINT = "/api/transcribe";

/** Mono 16 kHz is what Whisper uses internally; 32 kbit/s MP3 is ~240 KB per minute. */
const AUDIO_ARGS = ["-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k"];
const AUDIO_TYPE = "audio/mpeg";
const AUDIO_FILE = "audio.mp3";
const CHUNK_FILE = "chunk.mp3";

/** Two minutes per request (~0.5 MB), with 2 s shared between neighbours. */
export const CHUNK_SECONDS = 120;
export const OVERLAP_SECONDS = 2;
const MIN_TAIL_SECONDS = 15;

const EXTRACT_TIMEOUT_MS = 30 * 60 * 1000;
const SLICE_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 4;
const MAX_WAIT_SECONDS = 60;

export type TranscribeErrorCode = "server" | "network" | "ffmpeg" | "noAudio" | "chunkTooLarge";

export class TranscribeError extends Error {
  constructor(
    readonly code: TranscribeErrorCode,
    /** Persian text from the server, when it sent one. */
    readonly serverMessage?: string,
  ) {
    super(serverMessage ?? code);
    this.name = "TranscribeError";
  }
}

export type TranscribeProgress =
  | { phase: "loading" }
  /** ratio is null while the input length is unknown (e.g. MediaRecorder WebM). */
  | { phase: "extracting"; ratio: number | null }
  | { phase: "slicing" | "uploading"; chunk: number; total: number }
  | { phase: "waiting"; chunk: number; total: number; seconds: number };

export interface TranscribeOptions {
  media: Blob;
  signal: AbortSignal;
  onProgress?: (progress: TranscribeProgress) => void;
}

export interface TranscribeResult {
  transcript: Transcript;
  /** The extracted mono MP3, worth keeping as the project's audioKey. */
  audio: Blob;
  duration: number;
  demo: boolean;
}

const NO_AUDIO_RE = /matches no streams|does not contain any stream/i;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Reads the length from the MP3 header; ffmpeg can't for MediaRecorder WebM (Duration: N/A). */
function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement("audio");
    const done = () => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      done();
      if (Number.isFinite(seconds) && seconds > 0) resolve(seconds);
      else reject(new Error("unknown duration"));
    };
    audio.onerror = () => {
      done();
      reject(new Error("unreadable audio"));
    };
    audio.src = url;
  });
}

async function runAudioJob(
  input: File,
  args: string[],
  outputPath: string,
  timeoutMs: number,
  signal: AbortSignal,
  callbacks: Pick<Parameters<typeof runFFmpegJob>[0], "onLoaded" | "onDuration" | "onProgress"> = {},
): Promise<Blob> {
  try {
    const job = await runFFmpegJob({ file: input, mode: "st", args, outputPath, timeoutMs, signal, ...callbacks });
    return new Blob([job.output as BlobPart], { type: AUDIO_TYPE });
  } catch (e) {
    if (signal.aborted) throw signal.reason;
    const message = e instanceof Error ? e.message : String(e);
    throw new TranscribeError(NO_AUDIO_RE.test(message) ? "noAudio" : "ffmpeg");
  }
}

async function readServerError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as Partial<TranscribeErrorResponse>;
    return typeof body.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sends one chunk, retrying rate limits (429), server/upstream errors (5xx)
 * and network failures with growing waits. Other errors are final.
 */
async function postChunk(
  audio: Blob,
  name: string,
  signal: AbortSignal,
  onWait: (seconds: number) => void,
): Promise<TranscribeResponse> {
  for (let attempt = 1; ; attempt++) {
    let failure: TranscribeError;
    let waitSeconds: number;
    try {
      const form = new FormData();
      form.append("file", audio, name);
      const response = await fetch(ENDPOINT, { method: "POST", body: form, signal });
      if (response.ok) {
        const body = (await response.json()) as TranscribeResponse;
        if (!Array.isArray(body.words)) throw new TranscribeError("server");
        return body;
      }
      failure = new TranscribeError("server", await readServerError(response));
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        waitSeconds = retryAfter > 0 ? retryAfter : 5 * 2 ** attempt;
      } else if (response.status >= 500) {
        waitSeconds = 2 ** attempt;
      } else {
        throw failure;
      }
    } catch (e) {
      if (signal.aborted) throw signal.reason;
      if (e instanceof TranscribeError) throw e;
      failure = new TranscribeError("network");
      waitSeconds = 2 ** attempt;
    }
    if (attempt >= MAX_ATTEMPTS) throw failure;
    waitSeconds = Math.min(MAX_WAIT_SECONDS, Math.ceil(waitSeconds));
    onWait(waitSeconds);
    await sleep(waitSeconds * 1000, signal);
  }
}

/** Rejects with the signal's reason when cancelled, otherwise with TranscribeError. */
export async function transcribeMedia({ media, signal, onProgress }: TranscribeOptions): Promise<TranscribeResult> {
  onProgress?.({ phase: "loading" });
  let inputSeconds: number | undefined;
  let encodedSeconds = 0;
  const audio = await runAudioJob(
    new File([media], "source", { type: media.type }),
    ["-i", INPUT_PATH_TOKEN, "-vn", "-map", "0:a:0", ...AUDIO_ARGS, AUDIO_FILE],
    AUDIO_FILE,
    EXTRACT_TIMEOUT_MS,
    signal,
    {
      onLoaded: () => onProgress?.({ phase: "extracting", ratio: null }),
      onDuration: (seconds) => {
        inputSeconds = seconds;
      },
      onProgress: (seconds) => {
        encodedSeconds = Math.max(encodedSeconds, seconds);
        const ratio = inputSeconds ? Math.min(1, Math.max(0, seconds / inputSeconds)) : null;
        onProgress?.({ phase: "extracting", ratio });
      },
    },
  );

  const duration = await probeDuration(audio).catch(() => encodedSeconds || inputSeconds || 0);
  if (!duration) throw new TranscribeError("noAudio");

  const plan = planChunks(duration, CHUNK_SECONDS, OVERLAP_SECONDS, MIN_TAIL_SECONDS);
  const audioFile = new File([audio], AUDIO_FILE, { type: AUDIO_TYPE });
  const chunks: ChunkWords[] = [];
  for (const [index, chunk] of plan.entries()) {
    signal.throwIfAborted();
    const position = { chunk: index + 1, total: plan.length };

    let piece: Blob = audio;
    if (plan.length > 1) {
      onProgress?.({ phase: "slicing", ...position });
      // Stream copy cuts on MP3 frame borders (≤ 72 ms at 16 kHz): fast and close enough.
      piece = await runAudioJob(
        audioFile,
        ["-ss", String(chunk.start), "-i", INPUT_PATH_TOKEN, "-t", String(chunk.end - chunk.start), "-c", "copy", CHUNK_FILE],
        CHUNK_FILE,
        SLICE_TIMEOUT_MS,
        signal,
      );
    }
    if (piece.size > MAX_CHUNK_BYTES) throw new TranscribeError("chunkTooLarge");

    onProgress?.({ phase: "uploading", ...position });
    const response = await postChunk(piece, `chunk-${position.chunk}.mp3`, signal, (seconds) =>
      onProgress?.({ phase: "waiting", ...position, seconds }),
    );
    if (response.demo) {
      // The sample transcript is the same for every chunk, so one request is enough.
      return { transcript: { language: "fa", words: response.words }, audio, duration, demo: true };
    }
    chunks.push({ ...chunk, words: response.words });
  }

  return { transcript: { language: "fa", words: mergeChunkWords(chunks) }, audio, duration, demo: false };
}
