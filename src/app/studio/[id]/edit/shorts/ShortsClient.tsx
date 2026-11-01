"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { MediaState, Project, ShortSuggestion, Transcript } from "@/core/types";
import { getBlob, getProject } from "@/storage/db";
import { keptSegments, totalSeconds, type TimeRange } from "@/video/cuts";
import { MB, fill, int, num1 } from "@/video/format";
import { isQuotaError } from "@/video/saveRawVideo";
import { CENTER_POSITION, canMoveCrop } from "@/video/shorts/frame";
import { MakeShortError, makeShort, type MakeShortProgress } from "@/video/shorts/makeShort";
import { deleteShortOutput, saveShortOutput, saveShortSuggestions } from "@/video/shorts/saveShorts";
import { cutsMatchVideo, shortRangeError, suggestShorts } from "@/video/shorts/suggest";
import t from "@/video/shorts/strings.fa.json";
import { retimeWords, subtitleDuration } from "@/video/subtitles/srt";
import { readVideoInfo, type VideoInfo } from "@/video/upload/validate";
import { pickOutputs } from "../../publish/kit";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

type VideoState =
  | { kind: "loading" | "missing" | "unreadable" }
  | {
      kind: "ready";
      /** The video clips are cut from: the newest shortened video, or the raw one when there are no cuts. */
      sourceKey: string;
      url: string;
      duration: number;
      width: number;
      height: number;
      /** Set when the source is a shortened video: the parts of the raw video it is made of. */
      kept?: TimeRange[];
      cutsChanged: boolean;
    };

interface Item extends ShortSuggestion {
  id: string;
}

interface MadeClip {
  key: string;
  url: string | null;
  size: number;
}

type ListStatus = "idle" | "saving" | "saved" | "error";

type MakeStatus =
  | { kind: "idle" | "saved" | "cancelled" }
  | { kind: "running"; current: number; total: number; progress: MakeShortProgress }
  | { kind: "saving"; current: number; total: number }
  | { kind: "error"; message: string };

/** A clip added by hand starts this long, as far as the video allows. */
const NEW_CLIP_SECONDS = 30;

const toItems = (shorts: ShortSuggestion[]): Item[] => shorts.map((short) => ({ ...short, id: crypto.randomUUID() }));

/** Transcript times belong to the raw video, so they are moved onto a shortened one, as for subtitles. */
function suggestItems(transcript: Transcript, duration: number, kept?: TimeRange[]): Item[] {
  const words = kept ? retimeWords(transcript.words, kept) : transcript.words;
  return toItems(suggestShorts({ ...transcript, words }, duration));
}

/**
 * Saved clips are shown as they were saved, even when the user left none. Their times belong to
 * the source video; saving a new shortened video drops them (saveCutOutput).
 */
function initialItems(media: MediaState, duration: number, kept?: TimeRange[]): Item[] {
  if (media.shorts) return toItems(media.shorts);
  return media.transcript ? suggestItems(media.transcript, duration, kept) : [];
}

/** Null when the browser can't read the video. */
async function openVideo(blob: Blob, urls: string[]): Promise<{ url: string; info: VideoInfo } | null> {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  try {
    return { url, info: await readVideoInfo(url) };
  } catch {
    return null;
  }
}

export default function ShortsClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [video, setVideo] = useState<VideoState>({ kind: "loading" });
  const [items, setItems] = useState<Item[]>([]);
  const [dirty, setDirty] = useState(false);
  const [position, setPosition] = useState(CENTER_POSITION);
  const [listStatus, setListStatus] = useState<ListStatus>("idle");
  const [makeStatus, setMakeStatus] = useState<MakeStatus>({ kind: "idle" });
  const [made, setMade] = useState<MadeClip[]>([]);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // A finished clip that could not be stored, so the wait isn't lost.
  const [unsavedUrl, setUnsavedUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopAtRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Loads the project, then its source video, and suggests clips once the length is known.
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
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
      if (!media?.rawVideoKey || (!media.transcript && !media.shorts)) return;

      // Replacing the raw video drops the cuts but keeps old outputs, so without cuts a
      // shortened video in the list belongs to an earlier raw video and is ignored.
      const cuts = media.cuts ?? [];
      const cutKey = cuts.length > 0 ? pickOutputs(media.outputs).video?.key : undefined;
      const [rawBlob, cutBlob] = await Promise.all([
        getBlob(media.rawVideoKey).catch(() => undefined),
        cutKey ? getBlob(cutKey).catch(() => undefined) : undefined,
      ]);
      if (!active) return;
      if (!rawBlob && !cutBlob) {
        setVideo({ kind: "missing" });
        return;
      }

      const raw = rawBlob ? await openVideo(rawBlob, urls) : null;
      const cut = cutBlob ? await openVideo(cutBlob, urls) : null;
      if (!active) return;
      const source = cut ?? raw;
      if (!source) {
        setVideo({ kind: "unreadable" });
        return;
      }

      const { durationSec: duration, width, height } = source.info;
      // applyCuts works from the raw video's length; the last word's end stands in if it can't be read.
      const rawDuration = raw?.info.durationSec ?? subtitleDuration(media.transcript?.words ?? [], cuts);
      const kept = cut ? keptSegments(cuts, rawDuration) : undefined;
      setItems(initialItems(media, duration, kept));
      setVideo({
        kind: "ready",
        sourceKey: cut && cutKey ? cutKey : media.rawVideoKey,
        url: source.url,
        duration,
        width,
        height,
        kept,
        cutsChanged: kept !== undefined && raw !== null && !cutsMatchVideo(totalSeconds(kept), duration),
      });
    })();
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [projectId]);

  useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (unsavedUrl) URL.revokeObjectURL(unsavedUrl);
    };
  }, [unsavedUrl]);

  // Same order and numbers as the publish page's ZIP. Reloaded whenever the list of clips changes.
  const madeKeys =
    load.kind === "ready"
      ? pickOutputs(load.project.media?.outputs ?? [])
          .shorts.map((output) => output.key)
          .join(",")
      : "";

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    (async () => {
      const clips: MadeClip[] = [];
      for (const key of madeKeys ? madeKeys.split(",") : []) {
        const blob = await getBlob(key).catch(() => undefined);
        if (!active) return;
        const url = blob ? URL.createObjectURL(blob) : null;
        if (url) urls.push(url);
        clips.push({ key, url, size: blob?.size ?? 0 });
      }
      if (active) setMade(clips);
    })();
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [madeKeys]);

  if (load.kind !== "ready") {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-10">
        {load.kind === "loading" ? (
          <p>{t.loadingProject}</p>
        ) : (
          <>
            <p role="alert">{load.kind === "notFound" ? t.projectNotFound : t.projectLoadError}</p>
            <Link href="/studio" className="underline">
              {t.allProjects}
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

  if (!media?.rawVideoKey || (!media.transcript && !media.shorts)) {
    const noVideo = !media?.rawVideoKey;
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        {header}
        <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
          <p>{noVideo ? t.noVideo : t.noTranscript}</p>
          <Link href={`/studio/${project.id}/${noVideo ? "record" : "edit"}`} className="w-fit underline">
            {noVideo ? t.recordPage : t.transcriptPage}
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

  const { duration, kept, sourceKey } = video;
  const busy = makeStatus.kind === "running" || makeStatus.kind === "saving" || listStatus === "saving";
  const allValid = items.every((item) => shortRangeError(item.start, item.end, duration) === null);

  function changed(next: Item[]) {
    setItems(next);
    setDirty(true);
    setListStatus("idle");
  }

  function setTime(id: string, field: "start" | "end", value: number) {
    changed(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function addClip() {
    changed([...items, { id: crypto.randomUUID(), start: 0, end: Math.min(NEW_CLIP_SECONDS, duration), hook: "" }]);
  }

  function suggestAgain() {
    if (!media?.transcript) return;
    if (items.length > 0 && !window.confirm(t.list.confirmSuggest)) return;
    changed(suggestItems(media.transcript, duration, kept));
  }

  function play({ start, end }: Item) {
    const player = videoRef.current;
    if (!player) return;
    player.currentTime = start;
    stopAtRef.current = end;
    player.scrollIntoView({ behavior: "smooth", block: "nearest" });
    void player.play().catch(() => {});
  }

  function stopAtClipEnd(player: HTMLVideoElement) {
    if (stopAtRef.current === null || player.currentTime < stopAtRef.current) return;
    stopAtRef.current = null;
    player.pause();
  }

  async function refresh() {
    const fresh = await getProject(project.id);
    if (fresh) setLoad({ kind: "ready", project: fresh });
  }

  /** Returns false when saving failed (the error is already shown). */
  async function persistList(): Promise<boolean> {
    // "Saved" is shown only when the user had unsaved changes, not for a save before making clips.
    const announce = dirty;
    setListStatus("saving");
    try {
      await saveShortSuggestions(project.id, items.map(({ start, end, hook }) => ({ start, end, hook })));
      await refresh();
      setDirty(false);
      setListStatus(announce ? "saved" : "idle");
      return true;
    } catch {
      setListStatus("error");
      return false;
    }
  }

  /** One at a time: a fresh ffmpeg worker per clip frees the wasm memory between them. */
  async function makeClips(list: Item[]) {
    if (busy) return;
    if (!(await persistList())) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setUnsavedUrl(null);
    const total = list.length;
    setMakeStatus({ kind: "running", current: 1, total, progress: { phase: "loading" } });
    try {
      const source = await getBlob(sourceKey);
      if (!source) {
        setMakeStatus({ kind: "error", message: t.videoMissing });
        return;
      }
      for (const [index, { start, end }] of list.entries()) {
        const current = index + 1;
        const clip = await makeShort({
          video: source,
          start,
          end,
          position,
          signal: controller.signal,
          onProgress: (progress) => setMakeStatus({ kind: "running", current, total, progress }),
        });
        setMakeStatus({ kind: "saving", current, total });
        try {
          await saveShortOutput(project.id, clip);
          await refresh();
        } catch (e) {
          setUnsavedUrl(URL.createObjectURL(clip));
          setMakeStatus({ kind: "error", message: isQuotaError(e) ? t.errors.quota : t.errors.saveOutput });
          return;
        }
      }
      setMakeStatus({ kind: "saved" });
    } catch (e) {
      if (controller.signal.aborted) setMakeStatus({ kind: "cancelled" });
      else setMakeStatus({ kind: "error", message: e instanceof MakeShortError ? t.errors[e.code] : t.errors.unknown });
    } finally {
      abortRef.current = null;
    }
  }

  async function deleteClip(key: string) {
    if (busy || !window.confirm(t.made.confirmDelete)) return;
    setDeleteFailed(false);
    try {
      await deleteShortOutput(project.id, key);
      await refresh();
    } catch {
      setDeleteFailed(true);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      {header}

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.frame.title}</h2>
        {video.cutsChanged && (
          <p role="alert" className="text-sm text-accent">
            {t.frame.cutsChanged}
          </p>
        )}
        {/* object-fit: cover shows exactly what the crop filter keeps. */}
        <video
          ref={videoRef}
          src={video.url}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => stopAtClipEnd(e.currentTarget)}
          style={{ objectPosition: `${position * 100}% 50%` }}
          className="aspect-[9/16] max-h-[70vh] w-full max-w-xs self-center rounded-lg bg-navy object-cover"
        />
        {canMoveCrop(video.width, video.height) && (
          <label className="flex flex-col gap-1">
            <span className="text-sm">{t.frame.position}</span>
            {/* A range input flips under RTL, but the crop's position runs left to right. */}
            <input
              type="range"
              dir="ltr"
              min={0}
              max={1}
              step={0.01}
              value={position}
              disabled={busy}
              onChange={(e) => setPosition(Number(e.target.value))}
            />
            <span dir="ltr" className="flex justify-between text-xs text-foreground/70">
              <span>{t.frame.left}</span>
              <span>{t.frame.right}</span>
            </span>
            <span className="text-sm text-foreground/70">{t.frame.note}</span>
          </label>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.list.title}</h2>
        {items.length === 0 ? (
          <p>{t.list.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item, i) => {
              const error = shortRangeError(item.start, item.end, duration);
              return (
                <li key={item.id} className="flex flex-col gap-3 border-b border-foreground/10 py-3">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="font-medium">{fill(t.list.item, { number: int.format(i + 1) })}</h3>
                    {!error && (
                      <span className="text-sm text-foreground/70">
                        {fill(t.list.length, { length: num1.format(item.end - item.start) })}
                      </span>
                    )}
                  </div>
                  {item.hook && <p className="text-sm leading-7 text-foreground/80">{item.hook}</p>}
                  <div className="flex flex-wrap gap-4">
                    <TimeField
                      label={t.list.start}
                      value={item.start}
                      max={duration}
                      disabled={busy}
                      onChange={(value) => setTime(item.id, "start", value)}
                    />
                    <TimeField
                      label={t.list.end}
                      value={item.end}
                      max={duration}
                      disabled={busy}
                      onChange={(value) => setTime(item.id, "end", value)}
                    />
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-accent">
                      {t.list.rangeErrors[error]}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" size="sm" onClick={() => play(item)} disabled={error !== null}>
                      {t.list.play}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void makeClips([item])}
                      disabled={busy || !allValid}
                    >
                      {t.list.make}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => changed(items.filter((other) => other.id !== item.id))}
                      disabled={busy}
                    >
                      {t.list.remove}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={addClip} disabled={busy}>
            {t.list.add}
          </Button>
          {media.transcript && (
            <Button variant="secondary" size="sm" onClick={suggestAgain} disabled={busy}>
              {t.list.suggest}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void persistList()}
            disabled={busy || !dirty || !allValid}
          >
            {t.list.save}
          </Button>
          {dirty && listStatus !== "error" && <span className="text-sm text-foreground/70">{t.list.unsaved}</span>}
          {listStatus === "saved" && !dirty && (
            <span className="text-sm" aria-live="polite">
              {t.list.saved}
            </span>
          )}
          {listStatus === "error" && (
            <span role="alert" className="text-sm text-accent">
              {t.errors.saveList}
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-4">
        <p className="text-sm text-foreground/70">{t.make.slowNote}</p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => void makeClips(items)}
            disabled={busy || items.length === 0 || !allValid}
          >
            {t.make.all}
          </Button>
          {makeStatus.kind === "running" && (
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              {t.make.cancel}
            </Button>
          )}
        </div>
        <MakeLine status={makeStatus} />
        {unsavedUrl && (
          <a href={unsavedUrl} download={fill(t.made.fileName, { number: made.length + 1 })} className="w-fit underline">
            {t.make.downloadUnsaved}
          </a>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.made.title}</h2>
        {made.length === 0 ? (
          <p>{t.made.empty}</p>
        ) : (
          <>
            <p className="text-sm text-foreground/70">{t.made.note}</p>
            <ul className="grid gap-4 sm:grid-cols-2">
              {made.map((clip, i) => (
                <li key={clip.key} className="flex flex-col gap-2">
                  {clip.url ? (
                    <>
                      <p className="text-sm">
                        {fill(t.made.item, { number: int.format(i + 1), size: num1.format(clip.size / MB) })}
                      </p>
                      <video
                        src={clip.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="aspect-[9/16] w-full max-w-48 rounded-lg bg-foreground/10"
                      />
                      <a href={clip.url} download={fill(t.made.fileName, { number: i + 1 })} className="w-fit underline">
                        {t.made.download}
                      </a>
                    </>
                  ) : (
                    <p role="alert" className="text-sm text-accent">
                      {fill(t.made.missing, { number: int.format(i + 1) })}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteClip(clip.key)}
                    disabled={busy}
                    className="w-fit"
                  >
                    {t.made.delete}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {deleteFailed && (
          <p role="alert" className="text-sm text-accent">
            {t.errors.delete}
          </p>
        )}
      </section>
    </main>
  );
}

function TimeField({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <input
        type="number"
        dir="ltr"
        min={0}
        max={max}
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 rounded-lg border border-foreground/30 bg-transparent px-2 py-1 tabular-nums"
      />
    </label>
  );
}

function MakeLine({ status }: { status: MakeStatus }) {
  if (status.kind === "running") {
    const { current, total, progress } = status;
    const ratio = progress.phase === "encoding" ? progress.ratio : 0;
    const counts = { current: int.format(current), total: int.format(total) };
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-sm">
          {progress.phase === "loading"
            ? fill(t.make.loading, counts)
            : fill(t.make.encoding, { ...counts, percent: int.format(Math.round(ratio * 100)) })}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full bg-foreground transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      </div>
    );
  }
  if (status.kind === "saving") {
    return (
      <p className="text-sm" aria-live="polite">
        {fill(t.make.saving, { current: int.format(status.current), total: int.format(status.total) })}
      </p>
    );
  }
  if (status.kind === "error") {
    return (
      <p role="alert" className="text-sm text-accent">
        {status.message}
      </p>
    );
  }
  if (status.kind === "idle") return null;
  return (
    <p className="text-sm" aria-live="polite">
      {t.make[status.kind]}
    </p>
  );
}
