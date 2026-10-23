// Speech to text for one compressed audio chunk (never a whole video) with Groq Whisper.
// Without GROQ_API_KEY it answers with the sample transcript in fixtures (demo mode).
// Runs on the default Node.js runtime; Cache Components does not allow a `runtime` export.
import type { TranscriptWord } from "@/core/types";
import {
  ALLOWED_AUDIO_TYPES,
  MAX_CHUNK_BYTES,
  baseMimeType,
  type TranscribeErrorResponse,
  type TranscribeResponse,
} from "@/video/transcribe/protocol";
import t from "@/video/transcribe/strings.fa.json";
import demoTranscript from "../../../../fixtures/transcript.json";

export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3";
const GROQ_TIMEOUT_MS = 50_000;
/** Room for the multipart boundaries and headers around the file. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

function fail(status: number, error: string, headers?: HeadersInit): Response {
  const body: TranscribeErrorResponse = { error };
  return Response.json(body, { status, headers });
}

function ok(words: TranscriptWord[], demo: boolean): Response {
  const body: TranscribeResponse = { words, demo };
  return Response.json(body);
}

interface GroqWord {
  word?: unknown;
  start?: unknown;
  end?: unknown;
}

/** Keeps only well-formed words from Groq's verbose_json; a silent chunk has none. */
function parseWords(data: unknown): TranscriptWord[] | null {
  if (typeof data !== "object" || data === null) return null;
  const words = (data as { words?: unknown }).words;
  if (words === undefined) return [];
  if (!Array.isArray(words)) return null;
  return (words as GroqWord[]).flatMap(({ word, start, end }) => {
    if (typeof word !== "string" || typeof start !== "number" || typeof end !== "number") return [];
    const w = word.trim();
    return w ? [{ w, start, end: Math.max(start, end) }] : [];
  });
}

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_CHUNK_BYTES + FORM_OVERHEAD_BYTES) {
    return fail(413, t.errors.tooLarge);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, t.errors.badRequest);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, t.errors.badRequest);
  }
  if (file.size > MAX_CHUNK_BYTES) {
    return fail(413, t.errors.tooLarge);
  }
  if (!ALLOWED_AUDIO_TYPES.includes(baseMimeType(file.type))) {
    return fail(415, t.errors.unsupportedType);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return ok(demoTranscript.words, true);
  }

  const body = new FormData();
  body.append("file", file, file.name || "chunk.mp3");
  body.append("model", GROQ_MODEL);
  body.append("response_format", "verbose_json");
  body.append("timestamp_granularities[]", "word");
  body.append("language", "fa");
  body.append("temperature", "0");

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
  } catch {
    console.error("Groq transcription request failed (network or timeout)");
    return fail(502, t.errors.upstream);
  }

  // Groq's error text is never forwarded or logged; only the status code is.
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return fail(
      429,
      t.errors.rateLimited,
      Number.isFinite(retryAfter) && retryAfter > 0 ? { "Retry-After": String(Math.ceil(retryAfter)) } : undefined,
    );
  }
  if (response.status === 400 || response.status === 422) {
    return fail(400, t.errors.unreadableAudio);
  }
  if (!response.ok) {
    console.error(`Groq transcription failed with status ${response.status}`);
    return fail(502, t.errors.upstream);
  }

  let words: TranscriptWord[] | null;
  try {
    words = parseWords(await response.json());
  } catch {
    words = null;
  }
  if (!words) {
    console.error("Groq transcription returned an unexpected body");
    return fail(502, t.errors.upstream);
  }
  return ok(words, false);
}
