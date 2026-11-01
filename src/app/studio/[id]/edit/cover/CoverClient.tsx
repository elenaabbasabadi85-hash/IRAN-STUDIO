"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pickOutputs } from "@/app/studio/[id]/publish/kit";
import { Button } from "@/components/ui/Button";
import type { MediaState, Project } from "@/core/types";
import { getBlob, getProject } from "@/storage/db";
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  canvasToPng,
  drawCover,
  loadCoverFont,
  readCoverStyle,
} from "@/video/cover/draw";
import { saveCover } from "@/video/cover/saveCover";
import { MAX_COVER_CHARS, clampCoverText } from "@/video/cover/wrap";
import { fill, formatTime, int } from "@/video/format";
import { isQuotaError } from "@/video/saveRawVideo";
import { readVideoInfo } from "@/video/upload/validate";
// Temporary: these strings move into src/i18n/fa.json.
import t from "@/video/cover/strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

type VideoState =
  | { kind: "loading" | "missing" | "unreadable" }
  | { kind: "ready"; url: string; duration: number };

type SaveStatus = "idle" | "saving" | "saved" | "quota" | "error" | "renderError";

const FRAME_STEP_SECONDS = 0.1;

/** The newest exported video comes first, so the cover shows the video that gets published. */
function videoKeys(media: MediaState | undefined): string[] {
  if (!media) return [];
  const newest = pickOutputs(media.outputs).video?.key;
  return [newest, media.rawVideoKey].filter((key): key is string => Boolean(key));
}

export default function CoverClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [video, setVideo] = useState<VideoState>({ kind: "loading" });

  // Loads the project, then its video, and reads the length once the file is known.
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

      const keys = videoKeys(project?.media);
      if (keys.length === 0) return;
      let blob: Blob | undefined;
      for (const key of keys) {
        blob = await getBlob(key).catch(() => undefined);
        if (blob) break;
      }
      if (!active) return;
      if (!blob) {
        setVideo({ kind: "missing" });
        return;
      }
      url = URL.createObjectURL(blob);
      try {
        const info = await readVideoInfo(url);
        if (active) setVideo({ kind: "ready", url, duration: info.durationSec });
      } catch {
        if (active) setVideo({ kind: "unreadable" });
      }
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId]);

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

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-sm text-foreground/70">{project.title}</p>
      <p className="leading-7 text-foreground/80">{t.intro}</p>
    </header>
  );

  if (videoKeys(project.media).length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        {header}
        <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
          <p>{t.noVideo}</p>
          <Link href={`/studio/${project.id}`} className="w-fit underline">
            {t.goToProject}
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      {header}
      <CoverEditor
        project={project}
        videoUrl={video.url}
        duration={video.duration}
        onSaved={(fresh) => setLoad({ kind: "ready", project: fresh })}
      />
    </main>
  );
}

function CoverEditor({
  project,
  videoUrl,
  duration,
  onSaved,
}: {
  project: Project;
  videoUrl: string;
  duration: number;
  onSaved: (project: Project) => void;
}) {
  const [time, setTime] = useState(0);
  const [text, setText] = useState("");
  const [frameReady, setFrameReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintIdRef = useRef(0);
  const findingDurationRef = useRef(false);

  // While a seek runs the frame is not ready: the seeked event paints again with the latest text.
  const paint = useCallback(async () => {
    const player = videoRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!player || !ctx || player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || player.seeking) return;
    const id = ++paintIdRef.current;
    const style = readCoverStyle();
    // Without the font the cover is still drawn, in the next font of the brand stack.
    await loadCoverFont(text, style).catch(() => {});
    if (id !== paintIdRef.current) return;
    drawCover(ctx, { source: player, width: player.videoWidth, height: player.videoHeight }, text, style);
    setFrameReady(true);
  }, [text]);

  useEffect(() => {
    void paint();
  }, [paint]);

  // Revokes the previous result when a new one replaces it, and the last one on leaving.
  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [outputUrl]);

  const suggestions = (project.publish?.coverTexts ?? []).map((item) => clampCoverText(item)).filter(Boolean);
  const savedCount = (project.media?.outputs ?? []).filter((o) => o.kind === "cover").length;
  const saving = saveStatus === "saving";

  // A saved result no longer matches once the frame or the text changes.
  function clearResult() {
    setSaveStatus("idle");
    setOutputUrl(null);
  }

  function changeTime(next: number) {
    setTime(next);
    clearResult();
    if (videoRef.current) videoRef.current.currentTime = next;
  }

  function changeText(next: string) {
    setText(next);
    clearResult();
  }

  // WebM files saved by MediaRecorder have no duration; seeking past the end makes the
  // browser compute it (same trick as readVideoInfo).
  function findDuration(player: HTMLVideoElement) {
    if (player.duration !== Infinity) return;
    findingDurationRef.current = true;
    player.currentTime = Number.MAX_SAFE_INTEGER;
  }

  function returnFromEnd(player: HTMLVideoElement) {
    if (!findingDurationRef.current || !Number.isFinite(player.duration)) return;
    findingDurationRef.current = false;
    player.currentTime = time;
  }

  async function save() {
    const player = videoRef.current;
    const canvas = canvasRef.current;
    if (!player || !canvas) return;
    setSaveStatus("saving");
    setOutputUrl(null);

    let png: Blob;
    try {
      if (player.seeking) {
        await new Promise((resolve) => player.addEventListener("seeked", resolve, { once: true }));
      }
      await paint();
      png = await canvasToPng(canvas);
    } catch {
      setSaveStatus("renderError");
      return;
    }

    // The download link comes first, so it still works if storing fails.
    setOutputUrl(URL.createObjectURL(png));
    try {
      await saveCover(project.id, png);
      const fresh = await getProject(project.id);
      if (fresh) onSaved(fresh);
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus(isQuotaError(e) ? "quota" : "error");
    }
  }

  const title = project.title.split(String.fromCharCode(0x200c)).join(" ");

  return (
    <>
      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.preview.title}</h2>
        <canvas
          ref={canvasRef}
          dir="rtl"
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
          role="img"
          aria-label={t.preview.label}
          className="aspect-video w-full rounded-lg bg-black"
        />
        {/* Only the source of the frames. sr-only, not hidden: some browsers do not decode a display:none video. */}
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="sr-only"
          onLoadedMetadata={(e) => findDuration(e.currentTarget)}
          onDurationChange={(e) => returnFromEnd(e.currentTarget)}
          onLoadedData={() => void paint()}
          onSeeked={() => void paint()}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.frame.title}</h2>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm">
            <span>{t.frame.label}</span>
            <span className="tabular-nums">{formatTime(time)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step={FRAME_STEP_SECONDS}
            value={time}
            disabled={saving}
            onChange={(e) => changeTime(Number(e.target.value))}
          />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <h2 className="font-semibold">{t.text.title}</h2>
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t.text.suggestions}</h3>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, i) => (
                <Button
                  key={`${i}-${suggestion}`}
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={() => changeText(suggestion)}
                  className="max-w-full shrink! whitespace-normal!"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm">
            <span>{t.text.label}</span>
            <span className="tabular-nums">
              {fill(t.text.count, { count: int.format(text.length), max: int.format(MAX_COVER_CHARS) })}
            </span>
          </span>
          <textarea
            dir="auto"
            rows={3}
            maxLength={MAX_COVER_CHARS}
            value={text}
            disabled={saving}
            onChange={(e) => changeText(e.target.value)}
            className="rounded-lg border border-foreground/15 bg-transparent p-3 leading-7"
          />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
        <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!frameReady} className="w-fit">
          {t.save}
        </Button>
        {saveStatus === "saved" && (
          <p className="text-sm" aria-live="polite">
            {t.status.saved}
          </p>
        )}
        {(saveStatus === "quota" || saveStatus === "error" || saveStatus === "renderError") && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {saveStatus === "quota" ? t.errors.quota : saveStatus === "error" ? t.errors.save : t.errors.render}
          </p>
        )}
        {outputUrl && (
          <a href={outputUrl} download={`${title || t.fileFallback}.png`} className="w-fit underline">
            {t.download}
          </a>
        )}
        {savedCount > 0 && (
          <p className="text-sm text-foreground/70">{fill(t.status.savedCount, { count: int.format(savedCount) })}</p>
        )}
      </section>
    </>
  );
}
