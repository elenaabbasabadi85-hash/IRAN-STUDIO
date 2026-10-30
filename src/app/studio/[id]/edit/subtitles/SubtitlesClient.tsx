"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { Project } from "@/core/types";
import { getProject } from "@/storage/db";
import { keptSegments } from "@/video/cuts";
import { fill, formatDuration, int } from "@/video/format";
import { isQuotaError } from "@/video/saveRawVideo";
import { saveSrt } from "@/video/subtitles/saveSrt";
import { buildSubtitles, srtBlob, srtText, subtitleDuration } from "@/video/subtitles/srt";
// Temporary: these strings move into src/i18n/fa.json.
import t from "@/video/subtitles/strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

type SaveStatus = "idle" | "saving" | "saved" | "quota" | "error";

export default function SubtitlesClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    let active = true;
    getProject(projectId).then(
      (project) => {
        if (active) setLoad(project ? { kind: "ready", project } : { kind: "notFound" });
      },
      () => {
        if (active) setLoad({ kind: "error" });
      },
    );
    return () => {
      active = false;
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
  const media = project.media;

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-sm text-foreground/70">{project.title}</p>
      <p className="leading-7 text-foreground/80">{t.intro}</p>
    </header>
  );

  if (!media?.transcript) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        {header}
        <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
          <p>{t.noTranscript}</p>
          <Link href={`/studio/${project.id}/edit`} className="w-fit underline">
            {t.goToTranscript}
          </Link>
        </section>
      </main>
    );
  }

  const cuts = media.cuts ?? [];
  const kept = cuts.length > 0 ? keptSegments(cuts, subtitleDuration(media.transcript.words, cuts)) : undefined;
  const cues = buildSubtitles(media.transcript, kept);
  const text = srtText(cues);
  const savedCount = media.outputs.filter((o) => o.kind === "srt").length;

  async function save() {
    setSaveStatus("saving");
    try {
      await saveSrt(project.id, text);
      const fresh = await getProject(project.id);
      if (fresh) setLoad({ kind: "ready", project: fresh });
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus(isQuotaError(e) ? "quota" : "error");
    }
  }

  function download() {
    const url = URL.createObjectURL(srtBlob(text));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.title || t.fileFallback}.srt`;
    link.click();
    // Revoked a moment later: some browsers start the download only after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      {header}

      {cues.length === 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
          <p>{t.noSpeech}</p>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
            <h2 className="font-semibold">{t.preview.title}</h2>
            <p className="text-sm font-medium">
              {fill(t.preview.summary, {
                count: int.format(cues.length),
                duration: formatDuration(cues[cues.length - 1].end),
              })}
            </p>
            {kept && <p className="text-sm text-foreground/70">{t.cutsNote}</p>}
            <pre dir="auto" className="max-h-96 overflow-y-auto rounded-lg bg-foreground/5 p-3 text-sm leading-7 whitespace-pre-wrap">
              {text}
            </pre>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void save()} loading={saveStatus === "saving"}>
                {t.create}
              </Button>
              <Button variant="secondary" onClick={download}>
                {t.download}
              </Button>
            </div>
            {saveStatus === "saved" && (
              <p className="text-sm" aria-live="polite">
                {t.status.saved}
              </p>
            )}
            {(saveStatus === "quota" || saveStatus === "error") && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {saveStatus === "quota" ? t.errors.quota : t.errors.save}
              </p>
            )}
            {savedCount > 0 && (
              <p className="text-sm text-foreground/70">{fill(t.status.savedCount, { count: int.format(savedCount) })}</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
