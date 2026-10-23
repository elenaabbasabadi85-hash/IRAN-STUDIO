"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Project, Transcript } from "@/core/types";
import { getBlob, getProject } from "@/storage/db";
import { saveTranscript } from "@/video/transcribe/saveTranscript";
import {
  TranscribeError,
  transcribeMedia,
  type TranscribeProgress,
} from "@/video/transcribe/transcribe";
// Temporary: these strings move into src/i18n/fa.json.
import t from "@/video/transcribe/strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

type Status =
  | { kind: "idle" | "saving" | "done" | "saved" | "cancelled" }
  | { kind: "running"; progress: TranscribeProgress }
  | { kind: "error"; message: string };

interface Result {
  transcript: Transcript;
  demo: boolean;
}

const MB = 1024 * 1024;
const num1 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const pad2 = new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2, maximumFractionDigits: 0 });
const tenths = new Intl.NumberFormat("fa-IR", {
  minimumIntegerDigits: 2,
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** m:ss.s in Persian digits, e.g. ۱:۰۵٫۳ */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${int.format(minutes)}:${tenths.format(Math.floor((seconds - minutes * 60) * 10) / 10)}`;
}

/** m:ss in Persian digits, for the total length. */
function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${int.format(Math.floor(total / 60))}:${pad2.format(total % 60)}`;
}

function errorMessage(e: unknown): string {
  if (e instanceof TranscribeError) {
    return e.code === "server" ? (e.serverMessage ?? t.errors.unknown) : t.errors[e.code];
  }
  return t.errors.unknown;
}

export default function TranscribeClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // null means "show what the project already has".
  const [result, setResult] = useState<Result | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((project) => {
        if (active) setLoad(project ? { kind: "ready", project } : { kind: "notFound" });
      })
      .catch(() => {
        if (active) setLoad({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  if (load.kind !== "ready") {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-10">
        {load.kind === "loading" ? (
          <p>{t.loadingProject}</p>
        ) : (
          <>
            <p role="alert">{load.kind === "notFound" ? t.projectNotFound : t.projectLoadError}</p>
            <Link href="/studio" className="underline">
              {t.backToStudio}
            </Link>
          </>
        )}
      </main>
    );
  }

  const { project } = load;
  const rawVideoKey = project.media?.rawVideoKey;
  const running = status.kind === "running" || status.kind === "saving";
  const shown: Result | null =
    result ?? (rawVideoKey && project.media?.transcript ? { transcript: project.media.transcript, demo: false } : null);

  async function start() {
    if (running) return;
    if (rawVideoKey && project.media?.transcript && !window.confirm(t.confirmReplace)) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "running", progress: { phase: "loading" } });
    try {
      const media = rawVideoKey ? await getBlob(rawVideoKey) : localFile;
      if (!media) {
        setStatus({ kind: "error", message: t.videoMissing });
        return;
      }
      const { transcript, audio, demo } = await transcribeMedia({
        media,
        signal: controller.signal,
        onProgress: (progress) => setStatus({ kind: "running", progress }),
      });
      setResult({ transcript, demo });
      if (!rawVideoKey) {
        setStatus({ kind: "done" });
        return;
      }

      setStatus({ kind: "saving" });
      try {
        await saveTranscript(project.id, transcript, audio);
        const fresh = await getProject(project.id);
        if (fresh) setLoad({ kind: "ready", project: fresh });
        setStatus({ kind: "saved" });
      } catch {
        setStatus({ kind: "error", message: t.errors.save });
      }
    } catch (e) {
      setStatus(controller.signal.aborted ? { kind: "cancelled" } : { kind: "error", message: errorMessage(e) });
    } finally {
      abortRef.current = null;
    }
  }

  const canStart = Boolean(rawVideoKey || localFile) && !running;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-foreground/70">{project.title}</p>
        <p className="leading-7 text-foreground/80">{t.intro}</p>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-4">
        {!rawVideoKey && (
          <>
            <p>{t.noVideo}</p>
            <Link href={`/studio/${project.id}/record`} className="w-fit underline">
              {t.goToRecord}
            </Link>
            <div className="flex flex-col gap-2 border-t border-foreground/15 pt-4">
              <h2 className="font-semibold">{t.localFile.title}</h2>
              <p className="text-sm text-foreground/70">{t.localFile.hint}</p>
              <label className="flex flex-col gap-2">
                <span className="text-sm">{t.localFile.label}</span>
                <input
                  type="file"
                  accept="video/*,audio/*"
                  disabled={running}
                  onChange={(e) => {
                    setLocalFile(e.target.files?.[0] ?? null);
                    setResult(null);
                    setStatus({ kind: "idle" });
                  }}
                  className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-foreground/10 file:px-3 file:py-2"
                />
              </label>
              {localFile && (
                <p className="text-sm text-foreground/70">
                  <bdi>
                    {fill(t.localFile.selected, { name: localFile.name, size: num1.format(localFile.size / MB) })}
                  </bdi>
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className="rounded-lg bg-foreground px-5 py-2 font-medium text-background disabled:opacity-40"
          >
            {status.kind === "error" ? t.retry : shown ? t.restart : t.start}
          </button>
          {status.kind === "running" && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg border border-foreground/30 px-5 py-2 font-medium"
            >
              {t.cancel}
            </button>
          )}
        </div>

        <StatusLine status={status} />
      </section>

      {shown && <TranscriptView result={shown} />}
    </main>
  );
}

function progressText(progress: TranscribeProgress): string {
  switch (progress.phase) {
    case "loading":
      return t.status.loading;
    case "extracting":
      return progress.ratio === null
        ? t.status.extractingUnknown
        : fill(t.status.extracting, { percent: int.format(Math.round(progress.ratio * 100)) });
    case "slicing":
    case "uploading":
      return fill(t.status[progress.phase], { chunk: int.format(progress.chunk), total: int.format(progress.total) });
    case "waiting":
      return fill(t.status.waiting, { chunk: int.format(progress.chunk), seconds: int.format(progress.seconds) });
  }
}

/** Extraction fills the first 30 % of the bar, the chunks the rest. */
function progressRatio(progress: TranscribeProgress): number | null {
  switch (progress.phase) {
    case "loading":
      return 0;
    case "extracting":
      return progress.ratio === null ? null : progress.ratio * 0.3;
    default:
      return 0.3 + (0.7 * (progress.chunk - 1)) / progress.total;
  }
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "running") {
    const ratio = progressRatio(status.progress);
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-sm">{progressText(status.progress)}</p>
        <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className={`h-full bg-foreground transition-[width] ${ratio === null ? "animate-pulse" : ""}`}
            style={{ width: `${ratio === null ? 100 : Math.round(ratio * 100)}%` }}
          />
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        {status.message}
      </p>
    );
  }
  if (status.kind === "idle") return null;
  return (
    <p className="text-sm" aria-live="polite">
      {t.status[status.kind]}
    </p>
  );
}

function TranscriptView({ result }: { result: Result }) {
  const { words } = result.transcript;
  const duration = words.at(-1)?.end ?? 0;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t.result.title}</h2>
        {result.demo && (
          <span className="rounded-full border border-foreground/40 px-3 py-0.5 text-xs font-semibold">
            {t.demoBadge}
          </span>
        )}
        {words.length > 0 && (
          <span className="text-sm text-foreground/70">
            {fill(t.result.summary, { words: int.format(words.length), duration: formatDuration(duration) })}
          </span>
        )}
      </div>
      {result.demo && <p className="text-sm text-foreground/70">{t.demoNote}</p>}

      {words.length === 0 ? (
        <p>{t.result.empty}</p>
      ) : (
        <>
          <p className="leading-9">
            {words.map((word, i) => (
              <span key={i} title={formatTime(word.start)}>
                {word.w}{" "}
              </span>
            ))}
          </p>
          <details>
            <summary className="cursor-pointer text-sm">{t.result.showTimes}</summary>
            <div className="mt-2 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/15">
                    <th className="px-2 py-1 text-start font-medium">{t.result.time}</th>
                    <th className="px-2 py-1 text-start font-medium">{t.result.word}</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word, i) => (
                    <tr key={i} className="border-b border-foreground/10">
                      <td className="px-2 py-1 tabular-nums">
                        <bdi dir="ltr">
                          {formatTime(word.start)} – {formatTime(word.end)}
                        </bdi>
                      </td>
                      <td className="px-2 py-1">{word.w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
