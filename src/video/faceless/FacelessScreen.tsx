'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { estimateSeconds } from '@/agents/scriptTiming';
import { Button } from '@/components/ui/Button';
import type { Project } from '@/core/types';
import { getBlob, getProject } from '@/storage/db';
import { fill, formatDuration, formatTime, int } from '../format';
import { isQuotaError } from '../saveRawVideo';
import { readAudioDuration } from './audioDuration';
import { renderSlides, type RenderedSlide } from './drawSlide';
import { MakeSlideVideoError, makeSlideVideo, type MakeSlideVideoProgress } from './makeSlideVideo';
import { saveFacelessVideo, savedFacelessAudioKey } from './saveFaceless';
import t from './strings.fa.json';
import { planSlides, slideParts } from './timing';

type Load =
  | { kind: 'loading' | 'notFound' | 'error' }
  | { kind: 'ready'; project: Project };

type Source =
  | { kind: 'loading' }
  | { kind: 'missing' | 'unreadable' | 'slidesError'; key: string }
  | { kind: 'ready'; key: string; audio: Blob; duration: number; slides: (RenderedSlide & { url: string })[] };

type BuildStatus =
  | { kind: 'idle' | 'saving' | 'cancelled' }
  | { kind: 'running'; progress: MakeSlideVideoProgress }
  | { kind: 'error'; message: string };

const mainClass = 'mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10';
const sectionClass = 'flex flex-col gap-3 rounded-xl border border-foreground/15 p-4';

function buildErrorMessage(error: unknown): string {
  if (error instanceof MakeSlideVideoError) return error.code === 'memory' ? t.errors.memory : t.errors.ffmpeg;
  return isQuotaError(error) ? t.errors.quota : t.errors.save;
}

export default function FacelessScreen({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [loadedSource, setSource] = useState<Source>({ kind: 'loading' });
  const [status, setStatus] = useState<BuildStatus>({ kind: 'idle' });
  const [videoUrl, setVideoUrl] = useState<{ key: string; url: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((project) => {
        if (active) setLoad(project ? { kind: 'ready', project } : { kind: 'notFound' });
      })
      .catch(() => {
        if (active) setLoad({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const project = load.kind === 'ready' ? load.project : undefined;
  const audioKey = savedFacelessAudioKey(project?.media);
  const videoKey = project?.media?.mode === 'faceless' ? project.media.rawVideoKey : undefined;
  const script = project?.script;
  const title = project?.title ?? '';

  // Reads the take, then plans and draws the slides from its real length.
  useEffect(() => {
    if (!audioKey) return;
    let active = true;
    const urls: string[] = [];
    (async () => {
      const audio = await getBlob(audioKey).catch(() => undefined);
      if (!active) return;
      if (!audio) {
        setSource({ kind: 'missing', key: audioKey });
        return;
      }
      let duration: number;
      try {
        duration = await readAudioDuration(audio);
      } catch {
        if (active) setSource({ kind: 'unreadable', key: audioKey });
        return;
      }
      if (!active) return;
      try {
        const rendered = await renderSlides(planSlides(slideParts(script, title, estimateSeconds), duration));
        if (!active) return;
        const slides = rendered.map((slide) => {
          const url = URL.createObjectURL(slide.image);
          urls.push(url);
          return { ...slide, url };
        });
        setSource({ kind: 'ready', key: audioKey, audio, duration, slides });
      } catch {
        if (active) setSource({ kind: 'slidesError', key: audioKey });
      }
    })();
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [audioKey, script, title]);

  useEffect(() => {
    if (!videoKey) return;
    let active = true;
    let url: string | null = null;
    getBlob(videoKey)
      .then((blob) => {
        if (!active) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setVideoUrl({ key: videoKey, url });
      })
      .catch(() => {
        if (active) setVideoUrl({ key: videoKey, url: null });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [videoKey]);

  useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  // Next.js keeps this page's state when it is hidden after navigation; start fresh on return.
  useLayoutEffect(() => {
    return () => setStatus({ kind: 'idle' });
  }, []);

  if (load.kind !== 'ready') {
    return (
      <main className={mainClass}>
        {load.kind === 'loading' ? (
          <p>{t.loadingProject}</p>
        ) : (
          <>
            <p role="alert">{load.kind === 'notFound' ? t.projectNotFound : t.projectLoadError}</p>
            <Link href="/studio" className="w-fit underline">
              {t.allProjects}
            </Link>
          </>
        )}
      </main>
    );
  }

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-sm text-foreground/70">{load.project.title}</p>
      <p className="leading-7 text-foreground/80">{t.intro}</p>
    </header>
  );

  const recordLink = (
    <Link href={`/studio/${projectId}/record`} className="w-fit underline">
      {t.recordPage}
    </Link>
  );

  if (videoKey) {
    const stored = videoUrl?.key === videoKey ? videoUrl : null;
    return (
      <main className={mainClass}>
        {header}
        <section className={sectionClass}>
          <h2 className="font-semibold">{t.result.title}</h2>
          {stored?.url ? (
            <video key={stored.url} src={stored.url} controls playsInline className="aspect-video w-full rounded-lg bg-navy" />
          ) : stored ? (
            <p role="alert">{t.result.loadError}</p>
          ) : (
            <p>{t.loadingProject}</p>
          )}
          <p role="status">{t.result.saved}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Button href={`/studio/${projectId}/edit`}>{t.result.editPage}</Button>
            {recordLink}
          </div>
        </section>
      </main>
    );
  }

  if (!audioKey) {
    return (
      <main className={mainClass}>
        {header}
        <section className={sectionClass}>
          <p>{t.noAudio}</p>
          {recordLink}
        </section>
      </main>
    );
  }

  // A hidden page keeps its state, so what was read for an earlier take must not be used for a new one.
  const source: Source = loadedSource.kind !== 'loading' && loadedSource.key === audioKey ? loadedSource : { kind: 'loading' };

  if (source.kind !== 'ready') {
    const errors = { missing: t.audioMissing, unreadable: t.audioUnreadable, slidesError: t.slidesError };
    return (
      <main className={mainClass}>
        {header}
        {source.kind === 'loading' ? <p>{t.loadingAudio}</p> : <p role="alert">{errors[source.kind]}</p>}
        {source.kind !== 'loading' && recordLink}
      </main>
    );
  }

  const ready = source;
  const running = status.kind === 'running' || status.kind === 'saving';

  async function build() {
    if (running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'running', progress: { phase: 'loading' } });
    try {
      const video = await makeSlideVideo({
        audio: ready.audio,
        slides: ready.slides,
        duration: ready.duration,
        signal: controller.signal,
        onProgress: (progress) => setStatus({ kind: 'running', progress }),
      });
      setStatus({ kind: 'saving' });
      await saveFacelessVideo(projectId, video, ready.slides);
      const fresh = await getProject(projectId);
      if (fresh) setLoad({ kind: 'ready', project: fresh });
      setStatus({ kind: 'idle' });
    } catch (error) {
      setStatus(controller.signal.aborted ? { kind: 'cancelled' } : { kind: 'error', message: buildErrorMessage(error) });
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <main className={mainClass}>
      {header}

      <section className={sectionClass}>
        <h2 className="font-semibold">{t.slides.title}</h2>
        <p className="text-sm text-foreground/70">
          {fill(t.slides.summary, { count: int.format(source.slides.length), duration: formatDuration(source.duration) })}
        </p>
        <p className="text-sm text-foreground/70">{t.slides.note}</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {source.slides.map((slide) => (
            <li key={slide.sectionId} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image can't optimize */}
              <img src={slide.url} alt={slide.text} className="aspect-video w-full rounded-lg" />
              <span className="text-sm tabular-nums text-foreground/70">
                {fill(t.slides.item, { start: formatTime(slide.start), end: formatTime(slide.end) })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={sectionClass}>
        <p className="text-sm text-foreground/70">{t.build.slowNote}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void build()} loading={running}>
            {status.kind === 'error' || status.kind === 'cancelled' ? t.build.retry : t.build.start}
          </Button>
          {status.kind === 'running' && <Button onClick={() => abortRef.current?.abort()}>{t.build.cancel}</Button>}
        </div>
        {status.kind === 'running' && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p>
              {status.progress.phase === 'loading'
                ? t.build.loading
                : fill(t.build.encoding, { percent: int.format(Math.round(status.progress.ratio * 100)) })}
            </p>
            {status.progress.phase === 'encoding' && <progress value={status.progress.ratio} className="w-full" />}
          </div>
        )}
        {status.kind === 'saving' && <p aria-live="polite">{t.build.saving}</p>}
        {status.kind === 'cancelled' && <p aria-live="polite">{t.build.cancelled}</p>}
        {status.kind === 'error' && (
          <p role="alert" className="text-live-red">
            {status.message}
          </p>
        )}
        {recordLink}
      </section>
    </main>
  );
}
