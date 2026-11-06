"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Project, Script } from "@/core/types";
import { getProject } from "@/storage/db";
import { EditorReview } from "./EditorReview";
import { sameScript } from "./editorDraft";
import t from "./strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

/** The stored script a review started from; `n` changes each time the page starts over. */
type Start = { script: Script; n: number };

// The editor page: code fixes Persian spelling, the editor agent suggests tone changes, the user ticks
// the ones to keep and approves. Only the approved script is stored in the project.
export function EditorClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [start, setStart] = useState<Start | null>(null);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((project) => {
        if (!active) return;
        if (!project) {
          setLoad({ kind: "notFound" });
          return;
        }
        setLoad({ kind: "ready", project });
        const stored = project.steps.script === "approved" ? project.script : undefined;
        if (!stored) return;
        // This runs again each time the page is shown (Activity). Only a stored script that changed
        // meanwhile (approved again, or saved by this page) starts the review over; otherwise the
        // cards and ticks stay. A new `n` is a new key below, so React resets the whole review at once.
        setStart((current) =>
          current && sameScript(current.script, stored) ? current : { script: stored, n: (current?.n ?? 0) + 1 },
        );
      })
      .catch(() => {
        if (active) setLoad({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (load.kind === "loading") return <p>{t.loadingProject}</p>;

  if (load.kind !== "ready") {
    return (
      <div className="flex flex-col items-start gap-4">
        <Button variant="ghost" size="sm" href="/studio" className="-ms-4">
          {t.allProjects}
        </Button>
        <p role="alert">{load.kind === "notFound" ? t.projectNotFound : t.projectLoadError}</p>
      </div>
    );
  }

  const { project } = load;
  const header = (
    <header className="flex flex-col items-start gap-3">
      <Button variant="ghost" size="sm" href={`/studio/${project.id}`} className="-ms-4">
        {t.projectPage}
      </Button>
      <h1>{t.title}</h1>
      <p className="font-heading text-h3">{project.title}</p>
      <p className="max-w-2xl text-muted">{t.intro}</p>
    </header>
  );

  // Only a script a human approved is edited; without one, no request can be sent.
  const approved = project.steps.script === "approved" && project.script;
  if (!approved || !start) {
    return (
      <>
        {header}
        <div className="flex flex-col items-start gap-4">
          <p>{t.noScript}</p>
          <Button variant="primary" href={`/studio/${project.id}/script`}>
            {t.scriptPage}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {/* Saving does not change `start`, so the success message stays until the user leaves the page. */}
      <EditorReview
        key={start.n}
        project={project}
        original={start.script}
        onSaved={(saved) => setLoad({ kind: "ready", project: saved })}
      />
    </>
  );
}
