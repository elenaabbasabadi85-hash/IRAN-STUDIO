"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { CutSegment, MediaState, Project } from "@/core/types";
import { getBlob, getProject } from "@/storage/db";
import {
  DEFAULT_SILENCE_OPTIONS,
  findSilenceCuts,
  normalizeCuts,
  totalSeconds,
  type SilenceOptions,
} from "@/video/cuts";
import { MB, fill, formatDuration, formatTime, int, num1 } from "@/video/format";
import { isQuotaError } from "@/video/saveRawVideo";
import {
  ApplyCutsError,
  MEMORY_WARN_BYTES,
  applyCuts,
  type ApplyCutsProgress,
} from "@/video/silence/applyCuts";
import { saveCutOutput, saveSilenceCuts } from "@/video/silence/saveCuts";
import { readVideoInfo } from "@/video/upload/validate";
// Temporary: these strings move into src/i18n/fa.json.
import t from "@/video/silence/strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

type VideoState =
  | { kind: "loading" | "missing" | "unreadable" }
  | { kind: "ready"; url: string; duration: number; size: number };

interface Item {
  cut: CutSegment;
  enabled: boolean;
}

type CutsStatus = "idle" | "saving" | "saved" | "error";

type ExportStatus =
  | { kind: "idle" | "saving" | "saved" | "cancelled" }
  | { kind: "running"; progress: ApplyCutsProgress }
  | { kind: "error"; message: string };

/** How far before a cut "listen" starts playing, so the join can be heard in context. */
const LISTEN_LEAD_SECONDS = 1.5;
/** Seeking lands slightly early; a cut this close to its end is treated as passed. */
const SKIP_TOLERANCE_SECONDS = 0.05;

function detect(media: MediaState, duration: number, options: SilenceOptions, enabled: boolean): Item[] {
  if (!media.transcript) return [];
  return findSilenceCuts(media.transcript, duration, options).map((cut) => ({ cut, enabled }));
}

/**
 * Saved silence cuts are shown as they were saved. Only enabled cuts are stored,
 * so a project saved with every cut off shows the detected cuts switched off.
 */
function initialItems(media: MediaState, duration: number): Item[] {
  const saved = (media.cuts ?? []).filter((c) => c.reason === "silence");
  if (saved.length > 0) return normalizeCuts(saved, duration).map((cut) => ({ cut, enabled: true }));
  return detect(media, duration, DEFAULT_SILENCE_OPTIONS, media.cuts === undefined);
}

export default function SilenceCutClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [video, setVideo] = useState<VideoState>({ kind: "loading" });
  const [options, setOptions] = useState<SilenceOptions>(DEFAULT_SILENCE_OPTIONS);
  const [items, setItems] = useState<Item[]>([]);
  const [dirty, setDirty] = useState(false);
  const [cutsStatus, setCutsStatus] = useState<CutsStatus>("idle");
  const [skipCuts, setSkipCuts] = useState(true);
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ kind: "idle" });
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Loads the project, then its raw video, and detects the cuts once the length is known.
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    (async () => {
      let project: Project | undefined;
      try {
        project = await getProject(projectId);
      } catch {
        if (active) setLoad({ kind: "error" });
        return;
      }
      if (!active) return;
      setLoad(project ? { kind: "ready", project } : { kind: "notFound" });
      const media = project?.media;
      if (!media?.rawVideoKey || !media.transcript) return;

      const blob = await getBlob(media.rawVideoKey).catch(() => undefined);
      if (!active) return;
      if (!blob) {
        setVideo({ kind: "missing" });
        return;
      }
      url = URL.createObjectURL(blob);
      try {
        const info = await readVideoInfo(url);
        if (!active) return;
        setItems(initialItems(media, info.durationSec));
        setVideo({ kind: "ready", url, duration: info.durationSec, size: blob.size });
      } catch {
        if (active) setVideo({ kind: "unreadable" });
      }
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId]);

  useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  // Revokes the previous result when a new one replaces it, and the last one on leaving.
  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [outputUrl]);

  // Preview: while playing, jump over every enabled cut.
  useEffect(() => {
    const player = videoRef.current;
    if (!player || !skipCuts) return;
    const active = items.filter((i) => i.enabled).map((i) => i.cut);
    const jump = () => {
      const now = player.currentTime;
      const cut = active.find((c) => now >= c.start && now < c.end - SKIP_TOLERANCE_SECONDS);
      if (cut) player.currentTime = cut.end;
    };
    // Called every frame where supported; timeupdate (~4 per second) is the fallback.
    if (typeof player.requestVideoFrameCallback === "function") {
      let handle = 0;
      const tick = () => {
        jump();
        handle = player.requestVideoFrameCallback(tick);
      };
      handle = player.requestVideoFrameCallback(tick);
      return () => player.cancelVideoFrameCallback(handle);
    }
    player.addEventListener("timeupdate", jump);
    return () => player.removeEventListener("timeupdate", jump);
  }, [skipCuts, items, video]);

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
  const media = project.media;

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-sm text-foreground/70">{project.title}</p>
      <p className="leading-7 text-foreground/80">{t.intro}</p>
    </header>
  );

  if (!media?.rawVideoKey || !media.transcript) {
    const noVideo = !media?.rawVideoKey;
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        {header}
        <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
          <p>{noVideo ? t.noVideo : t.noTranscript}</p>
          <Link
            href={`/studio/${project.id}/${noVideo ? "record" : "edit"}`}
            className="w-fit underline"
          >
            {noVideo ? t.goToRecord : t.goToTranscript}
          </Link>
        </section>
      </main>
    );
  }

  if (video.kind !== "ready") {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        {header}
        {video.kind === "loading" ? (
          <p>{t.loadingVideo}</p>
        ) : (
          <p role="alert">{video.kind === "missing" ? t.videoMissing : t.videoUnreadable}</p>
        )}
      </main>
    );
  }

  const { duration } = video;
  const enabledCuts = items.filter((i) => i.enabled).map((i) => i.cut);
  // Retake or manual cuts saved by other tools are applied too.
  const otherCuts = (media.cuts ?? []).filter((c) => c.reason !== "silence");
  const allCuts = normalizeCuts([...otherCuts, ...enabledCuts], duration);
  const savedSeconds = totalSeconds(allCuts);
  const busy = exportStatus.kind === "running" || exportStatus.kind === "saving" || cutsStatus === "saving";
  const bigVideo = video.size > MEMORY_WARN_BYTES;

  function changeOptions(next: SilenceOptions) {
    if (!media) return;
    setOptions(next);
    setItems(detect(media, duration, next, true));
    setDirty(true);
    setCutsStatus("idle");
  }

  function toggle(index: number) {
    setItems((list) => list.map((item, i) => (i === index ? { ...item, enabled: !item.enabled } : item)));
    setDirty(true);
    setCutsStatus("idle");
  }

  function setAll(enabled: boolean) {
    setItems((list) => list.map((item) => ({ ...item, enabled })));
    setDirty(true);
    setCutsStatus("idle");
  }

  function listen(cut: CutSegment) {
    const player = videoRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, cut.start - LISTEN_LEAD_SECONDS);
    player.scrollIntoView({ behavior: "smooth", block: "nearest" });
    void player.play().catch(() => {});
  }

  async function refresh() {
    const fresh = await getProject(project.id);
    if (fresh) setLoad({ kind: "ready", project: fresh });
  }

  /** Returns false when saving failed (the error is already shown). */
  async function persistCuts(): Promise<boolean> {
    setCutsStatus("saving");
    try {
      await saveSilenceCuts(project.id, enabledCuts);
      await refresh();
      setDirty(false);
      setCutsStatus("saved");
      return true;
    } catch {
      setCutsStatus("error");
      return false;
    }
  }

  async function exportVideo() {
    if (busy || !media?.rawVideoKey) return;
    if (bigVideo && !window.confirm(t.export.memoryConfirm)) return;
    if (dirty && !(await persistCuts())) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setOutputUrl(null);
    setExportStatus({ kind: "running", progress: { phase: "loading" } });
    try {
      const source = await getBlob(media.rawVideoKey);
      if (!source) {
        setExportStatus({ kind: "error", message: t.videoMissing });
        return;
      }
      const result = await applyCuts({
        video: source,
        cuts: allCuts,
        duration,
        signal: controller.signal,
        onProgress: (progress) => setExportStatus({ kind: "running", progress }),
      });
      setOutputUrl(URL.createObjectURL(result.video));

      setExportStatus({ kind: "saving" });
      try {
        await saveCutOutput(project.id, result.video);
        await refresh();
        setExportStatus({ kind: "saved" });
      } catch (e) {
        setExportStatus({ kind: "error", message: isQuotaError(e) ? t.errors.quota : t.errors.saveOutput });
      }
    } catch (e) {
      if (controller.signal.aborted) setExportStatus({ kind: "cancelled" });
      else setExportStatus({ kind: "error", message: e instanceof ApplyCutsError ? t.errors[e.code] : t.errors.unknown });
    } finally {
      abortRef.current = null;
    }
  }

  const outputsCount = media.outputs.filter((o) => o.kind === "video").length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      {header}

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.preview.title}</h2>
        <video
          ref={videoRef}
          src={video.url}
          controls
          playsInline
          preload="metadata"
          className="max-h-[60vh] w-full rounded-lg bg-black"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={skipCuts} onChange={(e) => setSkipCuts(e.target.checked)} />
          {t.preview.skip}
        </label>
        <p className="text-sm font-medium" aria-live="polite">
          {fill(t.summary, {
            count: int.format(allCuts.length),
            saved: formatDuration(savedSeconds),
            after: formatDuration(duration - savedSeconds),
            before: formatDuration(duration),
          })}
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.settings.title}</h2>
        <RangeField
          label={t.settings.minGap}
          value={options.minGap}
          min={0.3}
          max={3}
          step={0.1}
          disabled={busy}
          onChange={(minGap) => changeOptions({ ...options, minGap })}
        />
        <RangeField
          label={t.settings.padding}
          value={options.padding}
          min={0}
          max={0.5}
          step={0.05}
          disabled={busy}
          onChange={(padding) => changeOptions({ ...options, padding })}
        />
        <p className="text-sm text-foreground/70">{t.settings.hint}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => changeOptions(DEFAULT_SILENCE_OPTIONS)}
          disabled={busy}
          className="w-fit"
        >
          {t.settings.reset}
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">{t.list.title}</h2>
          {items.length > 0 && (
            <>
              <button type="button" onClick={() => setAll(true)} disabled={busy} className="text-sm underline disabled:opacity-40">
                {t.list.enableAll}
              </button>
              <button type="button" onClick={() => setAll(false)} disabled={busy} className="text-sm underline disabled:opacity-40">
                {t.list.disableAll}
              </button>
            </>
          )}
        </div>
        {items.length === 0 ? (
          <p>{t.noCuts}</p>
        ) : (
          <ul className="flex max-h-96 flex-col overflow-y-auto">
            {items.map(({ cut, enabled }, i) => (
              <li
                key={`${cut.start}-${cut.end}`}
                className="flex flex-wrap items-center gap-3 border-b border-foreground/10 py-2 text-sm"
              >
                <label className="flex grow items-center gap-2">
                  <input type="checkbox" checked={enabled} disabled={busy} onChange={() => toggle(i)} />
                  <span className={enabled ? "" : "text-foreground/50 line-through"}>
                    {fill(t.list.item, {
                      start: formatTime(cut.start),
                      end: formatTime(cut.end),
                      length: num1.format(cut.end - cut.start),
                    })}
                  </span>
                  {(cut.start === 0 || cut.end >= duration) && (
                    <span className="text-xs text-foreground/60">{t.list.edge}</span>
                  )}
                </label>
                <button type="button" onClick={() => listen(cut)} className="underline">
                  {t.list.listen}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void persistCuts()} disabled={busy || !dirty}>
            {t.saveCuts}
          </Button>
          {dirty && cutsStatus !== "error" && <span className="text-sm text-foreground/70">{t.unsaved}</span>}
          {cutsStatus === "saved" && !dirty && (
            <span className="text-sm" aria-live="polite">
              {t.cutsSaved}
            </span>
          )}
          {cutsStatus === "error" && (
            <span role="alert" className="text-sm text-red-700 dark:text-red-400">
              {t.errors.saveCuts}
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-4">
        <p className="text-sm text-foreground/70">{t.export.slowNote}</p>
        {bigVideo && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t.export.memoryWarning} <bdi>({num1.format(video.size / MB)} MB)</bdi>
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void exportVideo()} disabled={busy || allCuts.length === 0}>
            {t.export.start}
          </Button>
          {exportStatus.kind === "running" && (
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              {t.export.cancel}
            </Button>
          )}
        </div>
        <ExportLine status={exportStatus} />
        {outputUrl && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">{t.export.result}</h3>
            <video src={outputUrl} controls playsInline className="max-h-[60vh] w-full rounded-lg bg-black" />
            <a href={outputUrl} download={`${project.title || "video"}-cut.mp4`} className="w-fit underline">
              {t.export.download}
            </a>
          </div>
        )}
        {outputsCount > 0 && (
          <p className="text-sm text-foreground/70">{fill(t.export.outputsCount, { count: int.format(outputsCount) })}</p>
        )}
      </section>
    </main>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{num1.format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ExportLine({ status }: { status: ExportStatus }) {
  if (status.kind === "running") {
    const { progress } = status;
    const ratio = progress.phase === "encoding" ? progress.ratio : 0;
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-sm">
          {progress.phase === "loading"
            ? t.export.loading
            : fill(t.export.encoding, { percent: int.format(Math.round(ratio * 100)) })}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full bg-foreground transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
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
      {t.export[status.kind]}
    </p>
  );
}
