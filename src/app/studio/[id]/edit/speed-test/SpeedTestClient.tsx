"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { canUseMultiThread } from "@/video/ffmpeg/client";
import { runExportBenchmark } from "@/video/benchmark/runExportBenchmark";
import { recommendResolution } from "@/video/benchmark/recommend";
import type {
  BenchmarkResult,
  Resolution,
  ThreadMode,
  X264Preset,
} from "@/video/benchmark/types";
// Temporary: moves into src/i18n/fa.json once that file exists.
import t from "@/video/benchmark/strings.fa.json";

type Status =
  | { kind: "idle" | "done" | "cancelled" }
  | {
      kind: "loading" | "exporting";
      step: number;
      total: number;
      mode: ThreadMode;
      resolution: Resolution;
      percent: number;
    };

interface Env {
  isolated: boolean;
  cores: number | null;
}

const MB = 1024 * 1024;
const num1 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

// Browser capabilities never change during the page's life, so the snapshot is
// computed once; the server snapshot is null to keep hydration consistent.
let envSnapshot: Env | undefined;
const subscribeNoop = () => () => {};
const getEnv = (): Env =>
  (envSnapshot ??= {
    isolated: canUseMultiThread(),
    cores: navigator.hardwareConcurrency ?? null,
  });
const getServerEnv = (): Env | null => null;

export default function SpeedTestClient() {
  const env = useSyncExternalStore(subscribeNoop, getEnv, getServerEnv);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<X264Preset>("ultrafast");
  const [include1080, setInclude1080] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const outputUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    const outputUrls = outputUrlsRef;
    const abort = abortRef;
    return () => {
      abort.current?.abort();
      outputUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function start() {
    if (!file || !env || running) return;
    outputUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    outputUrlsRef.current = [];
    setResults([]);

    const controller = new AbortController();
    abortRef.current = controller;
    const modes: ThreadMode[] = env.isolated ? ["st", "mt"] : ["st"];
    const resolutions: Resolution[] = include1080 ? [720, 1080] : [720];
    // 720p for every mode first, so the main comparison is ready early.
    const runs = resolutions.flatMap((resolution) => modes.map((mode) => ({ mode, resolution })));

    setRunning(true);
    for (const [index, run] of runs.entries()) {
      if (controller.signal.aborted) break;
      const progressBase = { step: index + 1, total: runs.length, ...run, percent: 0 };
      const result = await runExportBenchmark({
        file,
        preset,
        ...run,
        signal: controller.signal,
        onPhase: (kind) => setStatus({ kind, ...progressBase }),
        onProgress: (ratio) =>
          setStatus((s) =>
            s.kind === "exporting" ? { ...s, percent: Math.round(ratio * 100) } : s,
          ),
      });
      if (result.ok) outputUrlsRef.current.push(result.outputUrl);
      setResults((prev) => [...prev, result]);
    }
    setStatus({ kind: controller.signal.aborted ? "cancelled" : "done" });
    setRunning(false);
    abortRef.current = null;
  }

  const recommendation = status.kind === "done" ? recommendResolution(results) : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="leading-7 text-foreground/80">{t.intro}</p>
      </header>

      <section className="rounded-xl border border-foreground/15 p-4">
        <h2 className="mb-3 font-semibold">{t.env.title}</h2>
        {env ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt>{t.env.isolated}</dt>
            <dd>{env.isolated ? t.env.yes : t.env.no}</dd>
            <dt>{t.env.cores}</dt>
            <dd>{env.cores === null ? "—" : int.format(env.cores)}</dd>
          </dl>
        ) : (
          <p className="text-sm">{t.env.checking}</p>
        )}
        {env && (
          <p className={`mt-3 text-sm ${env.isolated ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
            {env.isolated ? t.env.mtAvailable : t.env.mtUnavailable}
          </p>
        )}
        {env && !env.isolated && <p className="mt-1 text-sm text-foreground/70">{t.directLoadNote}</p>}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-4">
        <label className="flex flex-col gap-2">
          <span className="font-semibold">{t.form.file}</span>
          <input
            type="file"
            accept="video/*"
            disabled={running}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-foreground/10 file:px-3 file:py-2"
          />
          <span className="text-sm text-foreground/70">
            {file ? (
              <bdi>{fill(t.form.fileInfo, { name: file.name, size: num1.format(file.size / MB) })}</bdi>
            ) : (
              t.form.noFile
            )}
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-semibold">{t.form.preset}</span>
          <select
            value={preset}
            disabled={running}
            onChange={(e) => setPreset(e.target.value as X264Preset)}
            className="w-fit rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm"
          >
            <option value="ultrafast">{t.form.presetUltrafast}</option>
            <option value="veryfast">{t.form.presetVeryfast}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={include1080}
            disabled={running}
            onChange={(e) => setInclude1080(e.target.checked)}
          />
          {t.form.include1080}
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={start}
            disabled={!file || !env || running}
            className="rounded-lg bg-foreground px-5 py-2 font-medium text-background disabled:opacity-40"
          >
            {t.form.start}
          </button>
          {running && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg border border-foreground/30 px-5 py-2 font-medium"
            >
              {t.form.cancel}
            </button>
          )}
        </div>

        <StatusLine status={status} />
      </section>

      {results.length > 0 && <ResultsTable results={results} />}

      {status.kind === "done" && (
        <section className="rounded-xl border-2 border-foreground/40 p-4">
          <h2 className="mb-2 font-semibold">{t.recommendation.title}</h2>
          {recommendation ? (
            <>
              <p className="mb-2 text-3xl font-bold" dir="ltr">
                {fill(t.recommendation.resolution, { resolution: recommendation.resolution })}
              </p>
              <p className="leading-7">
                {fill(t.recommendation[recommendation.reason], {
                  mode: t.mode[recommendation.mode],
                  export:
                    recommendation.export1080Seconds === null
                      ? "—"
                      : num1.format(recommendation.export1080Seconds),
                  clip: num1.format(recommendation.clipSeconds),
                })}
              </p>
            </>
          ) : (
            <p>{t.recommendation.none}</p>
          )}
          <p className="mt-3 text-sm text-foreground/70">{t.deviceNote}</p>
        </section>
      )}
    </main>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "loading" || status.kind === "exporting") {
    const vars = {
      step: int.format(status.step),
      total: int.format(status.total),
      mode: t.mode[status.mode],
      resolution: status.resolution,
      percent: int.format(status.percent),
    };
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-sm">{fill(t.status[status.kind], vars)}</p>
        <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full bg-foreground transition-[width]"
            style={{ width: `${status.kind === "exporting" ? status.percent : 0}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <p className="text-sm" aria-live="polite">
      {t.status[status.kind]}
    </p>
  );
}

function ResultsTable({ results }: { results: BenchmarkResult[] }) {
  const headers = [
    t.table.mode,
    t.table.resolution,
    t.table.export,
    t.table.speed,
    t.table.load,
    t.table.total,
    t.table.clip,
    t.table.size,
    t.table.output,
  ];
  return (
    <section className="rounded-xl border border-foreground/15 p-4">
      <h2 className="mb-3 font-semibold">{t.table.title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-foreground/15">
              {headers.map((h) => (
                <th key={h} className="px-2 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={`${r.mode}-${r.resolution}`} className="border-b border-foreground/10 align-top">
                <td className="px-2 py-2">{t.mode[r.mode]}</td>
                <td className="px-2 py-2" dir="ltr">{r.resolution}p</td>
                {r.ok ? (
                  <>
                    <td className="px-2 py-2 font-semibold">{num1.format(r.exportMs / 1000)}</td>
                    <td className="px-2 py-2">
                      {fill(t.table.speedValue, {
                        value: num2.format(r.clipSeconds / (r.exportMs / 1000)),
                      })}
                    </td>
                    <td className="px-2 py-2">{num1.format(r.loadMs / 1000)}</td>
                    <td className="px-2 py-2">{num1.format(r.totalMs / 1000)}</td>
                    <td className="px-2 py-2">{num1.format(r.clipSeconds)}</td>
                    <td className="px-2 py-2">
                      {num1.format(r.outputBytes / MB)}
                      {r.inputFs === "memfs" && (
                        <span className="block text-xs text-foreground/60">{t.table.memfsNote}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <a href={r.outputUrl} target="_blank" rel="noopener" className="underline">
                        {t.table.watch}
                      </a>
                    </td>
                  </>
                ) : (
                  <td colSpan={7} className="px-2 py-2">
                    {r.cancelled ? (
                      t.table.cancelled
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-red-700 dark:text-red-400">
                          {t.table.failed}
                        </summary>
                        <pre dir="ltr" className="mt-2 whitespace-pre-wrap text-xs">{r.error}</pre>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
