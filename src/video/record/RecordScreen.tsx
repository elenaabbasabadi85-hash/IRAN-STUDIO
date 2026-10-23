'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useState } from 'react';
import type { Project } from '@/core/types';
import { getBlob, getProject } from '@/storage/db';
import { isQuotaError, saveRawVideo } from '../saveRawVideo';
import { fixInfiniteDuration, formatBytes, formatDuration } from './mime';
import { scriptToPrompterText } from './scriptText';
import strings from './strings.fa.json';
import Teleprompter from './Teleprompter';
import { useMediaDevices } from './useMediaDevices';
import { useRecorder } from './useRecorder';

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error' }
  | { status: 'ready'; project: Project };

// url is null when the stored blob could not be read.
type StoredVideo = { key: string; url: string | null };

// 48px tall button, so the slanted edge is 48 * tan(33°) ≈ 31px wide.
const CUT_EDGE = 'polygon(0 0, 100% 0, 100% 100%, 31px 100%)';

const secondaryButton =
  'h-12 rounded border border-[#041E42] px-5 font-bold text-[#041E42] disabled:opacity-40';

export default function RecordScreen({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [prompterText, setPrompterText] = useState('');
  const [prompterPlaying, setPrompterPlaying] = useState(false);
  const [stored, setStored] = useState<StoredVideo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const devices = useMediaDevices();
  const recorder = useRecorder(devices.stream);
  const { phase } = recorder;

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((project) => {
        if (!active) return;
        if (!project) {
          setLoad({ status: 'notFound' });
          return;
        }
        setLoad({ status: 'ready', project });
        setPrompterText(scriptToPrompterText(project.script));
      })
      .catch(() => {
        if (active) setLoad({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const rawVideoKey = load.status === 'ready' ? load.project.media?.rawVideoKey : undefined;

  useEffect(() => {
    if (!rawVideoKey) return;
    let active = true;
    let url: string | null = null;
    getBlob(rawVideoKey)
      .then((blob) => {
        if (!active) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setStored({ key: rawVideoKey, url });
      })
      .catch(() => {
        if (active) setStored({ key: rawVideoKey, url: null });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [rawVideoKey]);

  const storedVideo = stored && stored.key === rawVideoKey ? stored : null;

  // Next.js keeps this page's state when it is hidden after navigation; start fresh on return.
  useLayoutEffect(() => {
    return () => {
      setPrompterPlaying(false);
      setSavedNotice(false);
      setSaveError(null);
    };
  }, []);

  const unsaved = phase === 'countdown' || phase === 'recording' || phase === 'paused' || phase === 'stopped';
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  if (load.status === 'loading') {
    return <p className="p-6">{strings.loading}</p>;
  }

  if (load.status === 'notFound' || load.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-4 p-6">
        <p role="alert">{load.status === 'notFound' ? strings.notFound : strings.loadError}</p>
        <Link href="/studio" className="underline">
          {strings.backToStudio}
        </Link>
      </div>
    );
  }

  const { project } = load;
  const busy = phase === 'countdown' || phase === 'recording' || phase === 'paused';
  // The prompter waits during the countdown and while the recording is paused.
  const prompterActive = prompterPlaying && phase !== 'countdown' && phase !== 'paused';

  const handleStart = () => {
    setSavedNotice(false);
    setSaveError(null);
    setPrompterPlaying(prompterText.trim().length > 0);
    recorder.start();
  };

  const handleStop = () => {
    setPrompterPlaying(false);
    recorder.stop();
  };

  const handleRetake = () => {
    setSaveError(null);
    recorder.reset();
  };

  const handleSave = async () => {
    const take = recorder.recording;
    if (!take) return;
    if (rawVideoKey && !window.confirm(strings.recorder.replaceConfirm)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveRawVideo(projectId, take.blob, 'camera');
      const updated = await getProject(projectId);
      devices.stop();
      recorder.reset();
      if (updated) setLoad({ status: 'ready', project: updated });
      setSavedNotice(true);
    } catch (error) {
      setSaveError(isQuotaError(error) ? strings.recorder.errors.quota : strings.recorder.errors.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const deviceLabel = (label: string, index: number) =>
    label || strings.camera.deviceFallback.replace('{n}', String(index + 1));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 bg-[#F5F1EA] p-4 text-[#041E42] sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{strings.title}</h1>
          <p className="text-sm text-[#2B4C7E]">{project.title}</p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href={`/studio/${projectId}/record/upload`} className="underline">
            {strings.toUpload}
          </Link>
          <Link href="/studio" className="underline">
            {strings.backToStudio}
          </Link>
        </nav>
      </header>

      {/* Above the camera preview, so the eyes stay close to the lens. */}
      <Teleprompter
        text={prompterText}
        onTextChange={setPrompterText}
        playing={prompterActive}
        onPlayingChange={setPrompterPlaying}
        locked={busy}
      />

      {phase !== 'stopped' && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#041E42]">
          {devices.stream ? (
            <video
              ref={(video) => {
                if (video && video.srcObject !== devices.stream) video.srcObject = devices.stream;
              }}
              autoPlay
              muted
              playsInline
              // Mirrored like a selfie; the recording itself is not mirrored.
              className="h-full w-full -scale-x-100 object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center text-[#F5F1EA]">
              <p>{devices.starting ? strings.camera.starting : strings.camera.off}</p>
              {!devices.starting && (
                <button
                  type="button"
                  onClick={() => devices.start()}
                  className="rounded border border-[#F5F1EA] px-4 py-2"
                >
                  {strings.camera.enable}
                </button>
              )}
            </div>
          )}

          {phase === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#041E42]/60">
              <span className="text-8xl font-bold text-[#F5F1EA]" aria-live="assertive">
                {recorder.countdown}
              </span>
            </div>
          )}

          {(phase === 'recording' || phase === 'paused') && (
            <div
              className="absolute right-3 top-3 flex items-center gap-2 rounded bg-[#041E42] px-3 py-1 text-[#F5F1EA]"
              aria-live="polite"
            >
              <span
                className={`h-3 w-3 rounded-full bg-[#FF2D46] ${phase === 'recording' ? 'animate-pulse' : 'opacity-40'}`}
              />
              <span className="font-bold">{phase === 'recording' ? strings.recorder.rec : strings.recorder.paused}</span>
              <span dir="ltr" className="tabular-nums">
                {formatDuration(recorder.elapsedMs / 1000)}
              </span>
            </div>
          )}
        </div>
      )}

      {devices.error && (
        <p role="alert" className="rounded border border-[#CD001A] p-3 text-[#CD001A]">
          {strings.camera.errors[devices.error]}
        </p>
      )}
      {recorder.failed && (
        <p role="alert" className="rounded border border-[#CD001A] p-3 text-[#CD001A]">
          {strings.recorder.errors.recorderFailed}
        </p>
      )}

      {devices.stream && phase !== 'stopped' && (
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            {strings.camera.cameraLabel}
            <select
              value={devices.cameraId}
              disabled={busy}
              onChange={(event) => devices.start(event.target.value, devices.micId)}
              className="max-w-56 rounded border border-[#8A8D91] bg-white p-1"
            >
              {devices.cameras.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {deviceLabel(device.label, index)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            {strings.camera.micLabel}
            <select
              value={devices.micId}
              disabled={busy}
              onChange={(event) => devices.start(devices.cameraId, event.target.value)}
              className="max-w-56 rounded border border-[#8A8D91] bg-white p-1"
            >
              {devices.microphones.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {deviceLabel(device.label, index)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {phase !== 'stopped' && (
        <div className="flex flex-wrap items-center gap-3">
          {phase === 'idle' && (
            <button
              type="button"
              onClick={handleStart}
              disabled={!devices.stream}
              className="h-12 bg-[#CD001A] pe-10 ps-6 font-bold text-white disabled:opacity-40"
              style={{ clipPath: CUT_EDGE }}
            >
              {strings.recorder.start}
            </button>
          )}
          {phase === 'countdown' && (
            <button type="button" onClick={recorder.cancelCountdown} className={secondaryButton}>
              {strings.recorder.cancelCountdown}
            </button>
          )}
          {phase === 'recording' && (
            <button type="button" onClick={recorder.pause} className={secondaryButton}>
              {strings.recorder.pause}
            </button>
          )}
          {phase === 'paused' && (
            <button type="button" onClick={recorder.resume} className={secondaryButton}>
              {strings.recorder.resume}
            </button>
          )}
          {(phase === 'recording' || phase === 'paused') && (
            <button type="button" onClick={handleStop} className={secondaryButton}>
              {strings.recorder.stop}
            </button>
          )}
        </div>
      )}

      {phase === 'stopped' && recorder.recording && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{strings.recorder.recordedTitle}</h2>
          <video
            key={recorder.recording.url}
            src={recorder.recording.url}
            controls
            playsInline
            onLoadedMetadata={(event) => fixInfiniteDuration(event.currentTarget)}
            className="aspect-video w-full rounded-lg bg-black"
          />
          <p className="text-sm text-[#2B4C7E]">
            {strings.recorder.duration}: <span dir="ltr">{formatDuration(recorder.recording.durationSec)}</span>
            {' · '}
            {strings.recorder.size}: <span dir="ltr">{formatBytes(recorder.recording.blob.size)}</span>
          </p>
          {saveError && (
            <p role="alert" className="rounded border border-[#CD001A] p-3 text-[#CD001A]">
              {saveError}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-12 rounded bg-[#041E42] px-6 font-bold text-[#F5F1EA] disabled:opacity-40"
            >
              {saving ? strings.recorder.saving : strings.recorder.save}
            </button>
            <button type="button" onClick={handleRetake} disabled={saving} className={secondaryButton}>
              {strings.recorder.retake}
            </button>
          </div>
        </section>
      )}

      {savedNotice && (
        <p role="status" className="rounded border border-[#2B4C7E] p-3">
          {strings.recorder.saved}
        </p>
      )}

      {rawVideoKey && phase !== 'stopped' && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{strings.current.title}</h2>
          {storedVideo?.url ? (
            <video
              key={storedVideo.url}
              src={storedVideo.url}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => fixInfiniteDuration(event.currentTarget)}
              className="aspect-video w-full rounded-lg bg-black"
            />
          ) : storedVideo ? (
            <p role="alert">{strings.current.loadError}</p>
          ) : (
            <p>{strings.loading}</p>
          )}
        </section>
      )}
    </main>
  );
}
