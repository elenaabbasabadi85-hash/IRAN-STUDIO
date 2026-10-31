'use client';

import { downloadZip } from 'client-zip';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Surface } from '@/components/ui/Surface';
import { focusRing } from '@/components/ui/focus';
import type { OutputFile, Project, PublishKit } from '@/core/types';
import fa from '@/i18n/fa.json';
import { format } from '@/i18n/format';
import { getBlob, getProject, updateProject } from '@/storage/db';
import {
  chapterTime,
  chaptersText,
  chosenTitleIndex,
  fileSize,
  hashtagList,
  listText,
  outputFileName,
  pickOutputs,
  publishText,
  sortedChapters,
  toPersianDigits,
  zipFileName,
  type FileKind,
  type ZipNames,
} from './kit';
import { samplePublishKit } from './samplePublishKit';

const t = fa.publish;

const MESSAGE_MS = 2500;
const FAILED_MESSAGE_MS = 6000;
// How long the ZIP's address is kept, so the browser has time to start the download.
const REVOKE_MS = 60_000;

const zipNames: ZipNames = {
  video: t.zip.video,
  short: (number) => format(t.zip.short, { number }),
  srt: t.zip.srt,
  cover: t.zip.cover,
};

type Load = { status: 'loading' } | { status: 'ready'; project: Project } | { status: 'notFound' } | { status: 'error' };

type FileRow =
  | { id: string; label: string; state: 'ready'; name: string; blob: Blob; output: OutputFile }
  | { id: string; label: string; state: 'missing' | 'notMade' };

async function fileRow(
  id: string,
  label: string,
  kind: FileKind,
  output: OutputFile | undefined,
  number?: number,
): Promise<FileRow> {
  if (!output) return { id, label, state: 'notMade' };
  // A file that cannot be read counts as missing, so everything else can still be downloaded.
  const blob = await getBlob(output.key).catch(() => undefined);
  if (!blob) return { id, label, state: 'missing' };
  return { id, label, state: 'ready', name: outputFileName(kind, blob.type, zipNames, number), blob, output };
}

/** One row per file in a fixed order (video, shorts, subtitle, cover), each saying whether it can go into the ZIP. */
async function checkFiles(outputs: OutputFile[]): Promise<FileRow[]> {
  const picked = pickOutputs(outputs);
  const shorts =
    picked.shorts.length === 0
      ? [fileRow('short', t.files.short, 'short', undefined)]
      : picked.shorts.map((output, index) =>
          fileRow(`short-${index + 1}`, format(t.files.shortItem, { number: index + 1 }), 'short', output, index + 1),
        );
  return Promise.all([
    fileRow('video', t.files.video, 'video', picked.video),
    ...shorts,
    fileRow('srt', t.files.srt, 'srt', picked.srt),
    fileRow('cover', t.files.cover, 'cover', picked.cover),
  ]);
}

function rowStatus(row: FileRow): string {
  if (row.state !== 'ready') return row.state === 'missing' ? t.files.missing : t.files.notMade;
  const { size, unit } = fileSize(row.blob.size);
  return format(t.files[unit], { size });
}

function validDate(iso: string): Date {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

// The Clipboard API needs HTTPS. The fallback covers plain HTTP too, such as testing on a phone
// over the local network.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'fixed top-0 opacity-0';
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();
    focused?.focus();
    return copied;
  }
}

function Section({ heading, action, children }: { heading: string; action?: ReactNode; children: ReactNode }) {
  // Unique per instance: Next keeps pages it navigated away from hidden in the document.
  const headingId = useId();
  return (
    <Surface as="section" aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-h3">
          {heading}
        </h2>
        {action}
      </div>
      {children}
    </Surface>
  );
}

function CopyButton({ name, copied, onCopy }: { name: string; copied: boolean; onCopy: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onCopy}>
      {copied ? t.copy.done : t.copy.button}
      <span className="sr-only">: {name}</span>
    </Button>
  );
}

// The publish page: the publish kit with a copy button per part, the project's output files,
// and one ZIP with all of them, built in the browser.
export function PublishClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  // null while the stored files are being checked.
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [chosen, setChosen] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [download, setDownload] = useState<'idle' | 'working' | 'error'>('idle');
  const messageTimer = useRef<number | undefined>(undefined);
  const filesId = useId();
  const radioName = useId();

  useEffect(() => {
    let active = true;
    (async () => {
      const project = await getProject(projectId);
      if (!active) return;
      if (!project) {
        setLoad({ status: 'notFound' });
        return;
      }
      setLoad({ status: 'ready', project });
      setChosen(chosenTitleIndex(project.publish ?? samplePublishKit));
      const rows = await checkFiles(project.media?.outputs ?? []);
      if (active) setFiles(rows);
    })().catch(() => {
      if (active) setLoad({ status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  // Next keeps this page hidden after navigating away (Activity); clear passing messages so it
  // comes back fresh. The effect above reads the project again when the page is shown.
  useLayoutEffect(
    () => () => {
      window.clearTimeout(messageTimer.current);
      setCopied(null);
      setMessage('');
      setDownload('idle');
      setSaveError(false);
    },
    [],
  );

  function showMessage(text: string, ms: number, copiedId: string | null = null) {
    window.clearTimeout(messageTimer.current);
    setCopied(copiedId);
    setMessage(text);
    messageTimer.current = window.setTimeout(() => {
      setCopied(null);
      setMessage('');
    }, ms);
  }

  async function copy(id: string, name: string, text: string) {
    if (await copyText(text)) {
      showMessage(format(t.copy.announce, { name }), MESSAGE_MS, id);
    } else {
      showMessage(t.copy.failed, FAILED_MESSAGE_MS);
    }
  }

  async function choose(index: number, demo: boolean) {
    setChosen(index);
    setSaveError(false);
    // The sample is never saved to the project, so its choice lives only on this page.
    if (demo) return;
    try {
      // Read again right before writing, so changes made to the kit meanwhile are kept.
      const current = await getProject(projectId);
      if (!current?.publish) return;
      await updateProject(projectId, { publish: { ...current.publish, chosenTitle: index } });
    } catch {
      setSaveError(true);
    }
  }

  async function downloadAll(project: Project, kit: PublishKit, demo: boolean, rows: FileRow[]) {
    setDownload('working');
    try {
      const outputs = rows.flatMap((row) =>
        row.state === 'ready' ? [{ name: row.name, input: row.blob, lastModified: validDate(row.output.createdAt) }] : [],
      );
      const text = { name: `${t.zip.text}.txt`, input: publishText(kit, chosen, t.text, demo), lastModified: new Date() };
      const zip = await downloadZip([...outputs, text]).blob();
      const url = URL.createObjectURL(zip);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFileName(project.title, t.zip.fallback);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
      setDownload('idle');
      showMessage(t.download.done, MESSAGE_MS);
    } catch {
      setDownload('error');
    }
  }

  if (load.status === 'loading') return <p>{t.loading}</p>;

  if (load.status !== 'ready') {
    return (
      <div className="flex flex-col items-start gap-4">
        <Button variant="ghost" size="sm" href="/studio" className="-ms-4">
          {t.toList}
        </Button>
        <p role="alert">{load.status === 'notFound' ? t.notFound : t.loadError}</p>
      </div>
    );
  }

  const { project } = load;
  const demo = !project.publish;
  const kit = project.publish ?? samplePublishKit;
  const chosenTitle = kit.titles[chosen]?.trim();
  const description = kit.description.trim();
  const chapters = sortedChapters(kit.chapters);
  const tags = hashtagList(kit.hashtags);
  const notWritten = <p className="text-muted">{t.notWritten}</p>;

  const skipped = (files ?? []).filter((row) => row.state !== 'ready').map((row) => row.label);
  const skippedText =
    skipped.length === 0
      ? ''
      : format(skipped.length === 1 ? t.download.skippedOne : t.download.skippedMany, {
          list: listText(skipped, t.download.listSeparator, t.download.listAnd),
        });

  return (
    <>
      <header className="flex flex-col items-start gap-3">
        <Button variant="ghost" size="sm" href={`/studio/${project.id}`} className="-ms-4">
          {t.back}
        </Button>
        <h1>{t.title}</h1>
        <p className="font-heading text-h3">{project.title}</p>
        <p className="max-w-2xl text-muted">{t.intro}</p>
      </header>

      {demo && (
        <div className="flex max-w-3xl flex-col items-start gap-2 p-4 ring-1 ring-cream/40 ring-inset sm:flex-row sm:items-center sm:gap-4">
          <Badge tone="outline">{t.demo.badge}</Badge>
          <p className="text-muted">{t.demo.note}</p>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section
            heading={t.titles.heading}
            action={
              chosenTitle && (
                <CopyButton
                  name={t.titles.heading}
                  copied={copied === 'title'}
                  onCopy={() => copy('title', t.titles.heading, chosenTitle)}
                />
              )
            }
          >
            {kit.titles.length === 0 ? (
              notWritten
            ) : (
              <fieldset>
                <legend className="mb-3 text-muted">{t.titles.legend}</legend>
                <div className="flex flex-col gap-2">
                  {kit.titles.map((title, index) => {
                    const selected = index === chosen;
                    return (
                      <label
                        key={index}
                        className={`flex cursor-pointer items-start gap-3 p-3 ring-inset ${
                          selected ? 'bg-navy ring-2 ring-cream' : 'ring-1 ring-cream/40 hover:bg-cream/10'
                        }`}
                      >
                        <input
                          type="radio"
                          name={radioName}
                          checked={selected}
                          onChange={() => choose(index, demo)}
                          className={`mt-1.5 size-4 shrink-0 accent-cream ${focusRing}`}
                        />
                        <span>{title}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {saveError && <p role="alert">{t.titles.saveError}</p>}
          </Section>

          <Section heading={t.cover.heading}>
            {kit.coverTexts.length === 0 ? (
              notWritten
            ) : (
              <ul className="flex flex-col gap-2">
                {kit.coverTexts.map((text, index) => {
                  const id = `cover-${index}`;
                  const name = format(t.cover.item, { number: index + 1 });
                  return (
                    <li key={index} className="flex flex-wrap items-center justify-between gap-3 bg-navy p-3">
                      <span className="font-display text-h3">{text}</span>
                      <CopyButton name={name} copied={copied === id} onCopy={() => copy(id, name, text)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section
            heading={t.description.heading}
            action={
              description && (
                <CopyButton
                  name={t.description.heading}
                  copied={copied === 'description'}
                  onCopy={() => copy('description', t.description.heading, description)}
                />
              )
            }
          >
            {description ? <p className="whitespace-pre-line">{description}</p> : notWritten}
          </Section>

          <Section
            heading={t.hashtags.heading}
            action={
              tags.length > 0 && (
                <CopyButton
                  name={t.hashtags.heading}
                  copied={copied === 'hashtags'}
                  onCopy={() => copy('hashtags', t.hashtags.heading, tags.join(' '))}
                />
              )
            }
          >
            {tags.length === 0 ? (
              notWritten
            ) : (
              <ul className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <li key={`${index}-${tag}`}>
                    <Badge tone="outline">{tag}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            heading={t.chapters.heading}
            action={
              chapters.length > 0 && (
                <CopyButton
                  name={t.chapters.heading}
                  copied={copied === 'chapters'}
                  onCopy={() => copy('chapters', t.chapters.heading, chaptersText(chapters))}
                />
              )
            }
          >
            {chapters.length === 0 ? (
              <p className="text-muted">{t.chapters.empty}</p>
            ) : (
              <>
                <ol className="flex flex-col gap-2">
                  {chapters.map((chapter, index) => (
                    <li key={index} className="flex gap-4">
                      <bdi dir="ltr" className="min-w-12 text-muted tabular-nums">
                        {toPersianDigits(chapterTime(chapter.start))}
                      </bdi>
                      <span>{chapter.title}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-caption text-muted">{t.chapters.note}</p>
              </>
            )}
          </Section>
        </div>

        <Surface as="section" aria-labelledby={filesId} className="flex flex-col gap-5 lg:sticky lg:top-6">
          <h2 id={filesId} className="text-h3">
            {t.files.heading}
          </h2>
          {files === null ? (
            <p className="text-muted">{t.files.checking}</p>
          ) : (
            <ul className="flex flex-col">
              {files.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-cream/20 py-3 first:pt-0"
                >
                  <span className="font-bold">{row.label}</span>
                  <span className={row.state === 'ready' ? '' : 'text-muted'}>{rowStatus(row)}</span>
                </li>
              ))}
              <li className="flex flex-col gap-1 pt-3">
                <span className="font-bold">{t.files.text}</span>
                <span className="text-caption text-muted">{t.files.textNote}</span>
              </li>
            </ul>
          )}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={files === null || download === 'working'}
            onClick={() => files && downloadAll(project, kit, demo, files)}
          >
            {t.download.button}
          </Button>
          {skippedText && <p className="text-caption text-muted">{skippedText}</p>}
          {download === 'error' && <p role="alert">{t.download.error}</p>}
        </Surface>
      </div>

      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center">
        {message && (
          <p className="flex w-full max-w-md justify-center bg-navy p-4 text-center font-bold ring-2 ring-cream ring-inset">
            {message}
          </p>
        )}
      </div>
    </>
  );
}
