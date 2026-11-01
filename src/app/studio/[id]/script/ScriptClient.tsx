"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Surface } from "@/components/ui/Surface";
import type { IdeaCard, Project, Script } from "@/core/types";
import { getProject, updateProject } from "@/storage/db";
import { LengthSummary } from "./LengthSummary";
import { ScriptEditor } from "./ScriptEditor";
import { checkScript, fieldOrder, requestScript, textsDiffer, type FieldErrors, type FieldKey } from "./scriptDraft";
import t from "./strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

// Writing a script and saving it each show their own message, next to their own button.
type Generate = { kind: "idle" | "loading" | "done" } | { kind: "error"; message: string };
type Save = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };

/** What edits are measured against: the agent's script as it came, or the script last approved. */
type Base = { script: Script; edited: boolean };

// The script page: the script agent writes a script for the approved idea, the user picks a hook,
// edits the texts and approves it. Only the approved script is stored in the project.
export function ScriptClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [draft, setDraft] = useState<Script | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  // True while the draft is a new script from the agent that is not approved yet.
  const [fresh, setFresh] = useState(false);
  const [demo, setDemo] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generate, setGenerate] = useState<Generate>({ kind: "idle" });
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Unique per instance: Next keeps pages it navigated away from hidden in the document.
  const formId = useId();

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
        // This runs again each time the page is shown (Activity), so the saved script only fills an
        // empty page and never replaces edits that are not approved yet.
        const saved = project.script;
        if (saved) {
          setDraft((current) => current ?? saved);
          setBase((current) => current ?? { script: saved, edited: saved.edited ?? false });
        }
      })
      .catch(() => {
        if (active) setLoad({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  // Next keeps this page hidden after the user leaves (Activity) and runs this cleanup.
  // چرا لغو؟ جوابی که کسی منتظرش نیست فقط سهمیه‌ی مدل را مصرف می‌کند. پیام‌های گذرا و پنجره‌ی تأیید
  // هم بسته می‌شوند تا با برگشتن به صفحه چیز کهنه‌ای نبینی؛ پیش‌نویس و ویرایش‌ها می‌مانند.
  useLayoutEffect(() => {
    const abort = abortRef;
    return () => {
      abort.current?.abort();
      setGenerate({ kind: "idle" });
      setSave({ kind: "idle" });
      setConfirmOpen(false);
    };
  }, []);

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

  // A script is written only for an idea a human approved; without one, no request can be sent.
  const idea = project.steps.idea === "approved" ? project.idea : undefined;
  if (!idea) {
    return (
      <>
        {header}
        <div className="flex flex-col items-start gap-4">
          <p>{t.noIdea}</p>
          <Button variant="primary" href={`/studio/${project.id}/idea`}>
            {t.ideaPage}
          </Button>
        </div>
      </>
    );
  }

  const approvedIdea: IdeaCard = idea;
  const generating = generate.kind === "loading";
  const saving = save.kind === "saving";

  // چرا با دکمه و نه خودکار هنگام باز شدن صفحه؟ هر درخواست از سهمیه‌ی مدل کم می‌کند و ممکن است تا دو
  // دقیقه طول بکشد؛ کسی که فقط برای دیدن سناریوی قبلی‌اش آمده نباید هزینه‌ای بدهد.
  async function generateScript() {
    // One request at a time, and none while the approved script is being saved.
    if (abortRef.current || saving) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerate({ kind: "loading" });
    try {
      const result = await requestScript(project.channel, approvedIdea, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setGenerate({ kind: "error", message: result.message });
        return;
      }
      setDraft(result.script);
      setBase({ script: result.script, edited: false });
      setFresh(true);
      setDemo(result.demo);
      setErrors({});
      setSave({ kind: "idle" });
      setGenerate({ kind: "done" });
    } catch {
      // چرا خطا چیزی را پاک نمی‌کند؟ پیش‌نویس، قلاب انتخاب‌شده، ویرایش‌ها و سناریوی ذخیره‌شده فقط با
      // جواب موفق عوض می‌شوند. درخواست ناموفق نباید کار قبلی کاربر را از بین ببرد؛ فقط پیام می‌دهد.
      if (!controller.signal.aborted) setGenerate({ kind: "error", message: t.errors.network });
    } finally {
      // A request aborted by leaving the page may finish after a new one started; it must not
      // unlock that new request.
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // چرا پیش از سناریوی تازه می‌پرسیم؟ سناریوی تازه جای پیش‌نویس را می‌گیرد؛ ویرایش‌هایی که هنوز تأیید
  // نشده‌اند نباید با یک کلیک بی‌صدا از بین بروند. انتخاب قلاب ویرایش حساب نمی‌شود، چون دوباره‌اش ارزان است.
  function writeScript() {
    if (generating || saving) return;
    if (draft && base && textsDiffer(draft, base.script)) setConfirmOpen(true);
    else void generateScript();
  }

  function edit(key: FieldKey, update: (script: Script) => Script) {
    setDraft((current) => (current ? update(current) : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSave({ kind: "idle" });
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A new script on its way replaces this draft, so approving now would save the old one and
    // lose it a moment later.
    if (!draft || !base || saving || generating) return;

    const checked = checkScript(draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      const first = fieldOrder(draft).find((key) => checked.errors[key]);
      if (first) document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }

    setSave({ kind: "saving" });
    try {
      // Read again right before writing, so step statuses changed meanwhile are kept.
      const current = await getProject(project.id);
      if (!current) {
        setSave({ kind: "error", message: t.projectNotFound });
        return;
      }
      // چرا فقط سناریوی تأییدشده ذخیره می‌شود؟ تله‌پرامپتر (src/video/record) هر چه در project.script
      // باشد نشان می‌دهد و steps.script را نمی‌سنجد. پس پیش‌نویس تا تأیید فقط در همین صفحه می‌ماند.
      const edited = base.edited || textsDiffer(checked.script, base.script);
      const script: Script = { ...checked.script, edited };
      const steps: Project["steps"] = { ...current.steps, script: "approved" };
      await updateProject(project.id, { script, steps });
      setDraft(script);
      setBase({ script, edited });
      setFresh(false);
      setLoad({ kind: "ready", project: { ...current, script, steps } });
      setSave({ kind: "saved" });
    } catch {
      setSave({ kind: "error", message: t.errors.save });
    }
  }

  return (
    <>
      {header}
      <IdeaSummary idea={approvedIdea} href={`/studio/${project.id}/idea`} />

      <div className="flex flex-col items-start gap-3">
        {/* The only red button until there is a script; after that the red one is «سناریو رو تأیید کن». */}
        <Button
          variant={draft ? "secondary" : "primary"}
          size={draft ? "md" : "lg"}
          loading={generating}
          disabled={saving}
          onClick={writeScript}
        >
          {draft ? t.regenerate : t.generate}
        </Button>
        <p role="status" className="text-muted">
          {generating ? t.generating : generate.kind === "done" ? t.generated : ""}
        </p>
        {generate.kind === "error" && <p role="alert">{generate.message}</p>}
        {fresh && project.script && <p className="text-muted">{t.previous}</p>}
      </div>

      {draft && (
        <form noValidate onSubmit={approve} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Locked while a new script is on its way: it replaces this draft, so edits made meanwhile would be lost. */}
          <fieldset disabled={generating} className="min-w-0 disabled:opacity-60">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-h3">{t.editor.heading}</h2>
                  {demo && <Badge tone="outline">{t.demo.badge}</Badge>}
                </div>
                {demo && <p className="text-muted">{t.demo.note}</p>}
              </div>
              <ScriptEditor idPrefix={formId} script={draft} errors={errors} onEdit={edit} />
            </div>
          </fieldset>

          <Surface className="flex flex-col gap-5 lg:sticky lg:top-6">
            <LengthSummary script={draft} avgLengthMin={project.channel.avgLengthMin} />
            <div className="flex flex-col items-start gap-3">
              <Button type="submit" variant="primary" loading={saving} disabled={generating}>
                {t.form.approve}
              </Button>
              <p role="status">{save.kind === "saved" ? t.form.saved : ""}</p>
              {save.kind === "saved" && (
                <Button variant="ghost" size="sm" href={`/studio/${project.id}`} className="-ms-4">
                  {t.projectPage}
                </Button>
              )}
              {save.kind === "error" && <p role="alert">{save.message}</p>}
              {errors.form && <p role="alert">{errors.form}</p>}
            </div>
          </Surface>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t.confirm.title}
        confirmLabel={t.confirm.confirm}
        cancelLabel={t.confirm.cancel}
        onConfirm={() => {
          setConfirmOpen(false);
          void generateScript();
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        {t.confirm.text}
      </ConfirmDialog>
    </>
  );
}

// Read-only: the idea is changed and approved again on its own page.
function IdeaSummary({ idea, href }: { idea: IdeaCard; href: string }) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-w-2xl flex-col items-start gap-2 p-5 ring-1 ring-concrete ring-inset"
    >
      <h2 id={headingId} className="text-caption text-muted">
        {t.idea.heading}
      </h2>
      <p className="font-heading text-h3">{idea.workingTitle}</p>
      <p className="flex flex-col">
        <span className="text-caption text-muted">{t.idea.angle}</span>
        <span>{idea.angle}</span>
      </p>
      <Button variant="ghost" size="sm" href={href} className="-ms-4">
        {t.ideaPage}
      </Button>
    </section>
  );
}
