'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { Project } from '@/core/types';
import { getBlob, getProject } from '@/storage/db';
import { formatBytes, formatDuration } from '../record/mime';
import { removeRawVideo } from '../removeRawVideo';
import { isQuotaError, saveRawVideo } from '../saveRawVideo';
import strings from './strings.fa.json';
import { ACCEPT, UploadError, checkFile, readVideoInfo, type UploadErrorKind, type VideoInfo } from './validate';

type LoadState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error' }
  | { status: 'ready'; project: Project };

type Selected = { file: File; url: string; info: VideoInfo };

// url is null when the stored blob could not be read.
type StoredVideo = { key: string; url: string | null };

type StorageEstimate = { usage: number; quota: number };

type Notice = 'saved' | 'deleted';

// 48px tall button, so the slanted edge is 48 * tan(33°) ≈ 31px wide.
const CUT_EDGE = 'polygon(0 0, 100% 0, 100% 100%, 31px 100%)';

const secondaryButton =
  'h-12 rounded border border-[#041E42] px-5 font-bold text-[#041E42] disabled:opacity-40';

async function readEstimate(): Promise<StorageEstimate | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return usage !== undefined && quota ? { usage, quota } : null;
  } catch {
    return null;
  }
}

export default function UploadScreen({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [checking, setChecking] = useState(false);
  const [fileError, setFileError] = useState<UploadErrorKind | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [stored, setStored] = useState<StoredVideo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedUrlRef = useRef<string | null>(null);
  const pickRef = useRef(0);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((project) => {
        if (active) setLoad(project ? { status: 'ready', project } : { status: 'notFound' });
      })
      .catch(() => {
        if (active) setLoad({ status: 'error' });
      });
    readEstimate().then((value) => {
      if (active) setEstimate(value);
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

  const clearSelection = useCallback(() => {
    pickRef.current++;
    if (selectedUrlRef.current) URL.revokeObjectURL(selectedUrlRef.current);
    selectedUrlRef.current = null;
    setSelected(null);
    setChecking(false);
  }, []);

  // Next.js keeps this page's state when it is hidden after navigation; start fresh on return.
  useLayoutEffect(() => {
    return () => {
      clearSelection();
      setFileError(null);
      setActionError(null);
      setNotice(null);
      setDragActive(false);
    };
  }, [clearSelection]);

  // Leaving while IndexedDB is still writing aborts the save.
  useEffect(() => {
    if (!saving && !deleting) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saving, deleting]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    clearSelection();
    setFileError(null);
    setActionError(null);
    setNotice(null);
    const pick = pickRef.current;
    let url: string | null = null;
    try {
      checkFile(file);
      // An object URL points at the file on disk, so even a large file is never copied into memory.
      url = URL.createObjectURL(file);
      setChecking(true);
      const info = await readVideoInfo(url);
      if (pick !== pickRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      selectedUrlRef.current = url;
      setSelected({ file, url, info });
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      if (pick === pickRef.current) setFileError(error instanceof UploadError ? error.kind : 'corrupt');
    } finally {
      if (pick === pickRef.current) setChecking(false);
    }
  };

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
  const busy = saving || deleting;

  const reloadProject = async () => {
    const updated = await getProject(projectId);
    if (updated) setLoad({ status: 'ready', project: updated });
    setEstimate(await readEstimate());
  };

  const handleSave = async () => {
    if (!selected) return;
    if (rawVideoKey && !window.confirm(strings.replaceConfirm)) return;
    setActionError(null);
    setNotice(null);
    // The estimate is rough, so only an obvious shortfall is stopped before writing.
    const latest = await readEstimate();
    if (latest && selected.file.size > latest.quota - latest.usage) {
      setActionError(strings.errors.quota);
      return;
    }
    setSaving(true);
    try {
      await saveRawVideo(projectId, selected.file, 'upload');
      clearSelection();
      await reloadProject();
      setNotice('saved');
    } catch (error) {
      setActionError(isQuotaError(error) ? strings.errors.quota : strings.errors.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(strings.current.deleteConfirm)) return;
    setActionError(null);
    setNotice(null);
    setDeleting(true);
    try {
      await removeRawVideo(projectId);
      await reloadProject();
      setNotice('deleted');
    } catch {
      setActionError(strings.errors.deleteFailed);
    } finally {
      setDeleting(false);
    }
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!busy) setDragActive(true);
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    // dragleave also fires when the pointer moves onto a child element.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (!busy) void handleFile(event.dataTransfer.files[0]);
  };

  const storageSummary =
    estimate &&
    strings.storage.summary
      .replace('{used}', formatBytes(estimate.usage))
      .replace('{quota}', formatBytes(estimate.quota))
      .replace('{free}', formatBytes(Math.max(0, estimate.quota - estimate.usage)));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 bg-[#F5F1EA] p-4 text-[#041E42] sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{strings.title}</h1>
          <p className="text-sm text-[#2B4C7E]">{project.title}</p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href={`/studio/${projectId}/record`} className="underline">
            {strings.toRecord}
          </Link>
          <Link href="/studio" className="underline">
            {strings.backToStudio}
          </Link>
        </nav>
      </header>

      <p className="text-sm text-[#2B4C7E]">{strings.privacy}</p>

      {!selected && (
        <section
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center ${
            dragActive ? 'border-[#2B4C7E] bg-white' : 'border-[#8A8D91]'
          }`}
        >
          {checking ? (
            <p aria-live="polite">{strings.checking}</p>
          ) : (
            <>
              <p className="font-bold">{dragActive ? strings.drop.active : strings.drop.hint}</p>
              <p className="text-sm text-[#8A8D91]">{strings.drop.or}</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="h-12 rounded bg-[#041E42] px-6 font-bold text-[#F5F1EA] disabled:opacity-40"
              >
                {strings.drop.choose}
              </button>
              <p className="text-sm text-[#8A8D91]">{strings.drop.formats}</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              // Lets the same file be picked again after an error.
              event.target.value = '';
            }}
          />
        </section>
      )}

      {fileError && (
        <p role="alert" className="rounded border border-[#CD001A] p-3 text-[#CD001A]">
          {strings.errors[fileError]}
        </p>
      )}

      {selected && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{strings.selectedTitle}</h2>
          <video
            key={selected.url}
            src={selected.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg bg-black"
          />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-[#2B4C7E]">{strings.info.name}</dt>
            <dd dir="ltr" className="truncate text-end">
              {selected.file.name}
            </dd>
            <dt className="text-[#2B4C7E]">{strings.info.duration}</dt>
            <dd dir="ltr" className="text-end tabular-nums">
              {formatDuration(selected.info.durationSec)}
            </dd>
            <dt className="text-[#2B4C7E]">{strings.info.dimensions}</dt>
            <dd dir="ltr" className="text-end tabular-nums">
              {selected.info.width} × {selected.info.height}
            </dd>
            <dt className="text-[#2B4C7E]">{strings.info.size}</dt>
            <dd dir="ltr" className="text-end tabular-nums">
              {formatBytes(selected.file.size)}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="h-12 bg-[#CD001A] pe-10 ps-6 font-bold text-white disabled:opacity-40"
              style={{ clipPath: CUT_EDGE }}
            >
              {saving ? strings.saving : strings.save}
            </button>
            <button type="button" onClick={clearSelection} disabled={busy} className={secondaryButton}>
              {strings.chooseAnother}
            </button>
          </div>
        </section>
      )}

      {actionError && (
        <p role="alert" className="rounded border border-[#CD001A] p-3 text-[#CD001A]">
          {actionError}
        </p>
      )}

      {notice && (
        <p role="status" className="rounded border border-[#2B4C7E] p-3">
          {notice === 'saved' ? strings.saved : strings.current.deleted}
        </p>
      )}

      {rawVideoKey && !selected && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{strings.current.title}</h2>
          {storedVideo?.url ? (
            <video
              key={storedVideo.url}
              src={storedVideo.url}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full rounded-lg bg-black"
            />
          ) : storedVideo ? (
            <p role="alert">{strings.current.loadError}</p>
          ) : (
            <p>{strings.loading}</p>
          )}
          <div>
            <button type="button" onClick={handleDelete} disabled={busy} className={secondaryButton}>
              {deleting ? strings.current.deleting : strings.current.delete}
            </button>
          </div>
        </section>
      )}

      {storageSummary && (
        <p className="text-sm text-[#8A8D91]">
          {strings.storage.label}: <span dir="ltr">{storageSummary}</span>
        </p>
      )}
    </main>
  );
}
