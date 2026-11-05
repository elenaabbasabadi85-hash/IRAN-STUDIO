"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Surface } from "@/components/ui/Surface";
import type { IdeaCard, Project, PublishKit, Script } from "@/core/types";
import { getProject, updateProject } from "@/storage/db";
import { TextsEditor } from "./TextsEditor";
import {
  checkTexts,
  fieldOrder,
  requestTexts,
  textsDiffer,
  textsOf,
  type FieldErrors,
  type FieldKey,
  type Texts,
} from "./writeDraft";
import t from "./strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

// Writing the texts and saving them each show their own message, next to their own button.
type Generate = { kind: "idle" | "loading" | "done" } | { kind: "error"; message: string };
type Save =
  | { kind: "idle" | "saving" }
  /** titleCleared: the publish page's title choice was dropped, because the titles are new. */
  | { kind: "saved"; titleCleared: boolean }
  | { kind: "error"; message: string };

// The write page: the writer agent writes publish texts for the approved idea and script, the user
// edits them and approves them. Only approved texts are stored in the project.
export function WriteClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [draft, setDraft] = useState<Texts | null>(null);
  // What edits are measured against: the agent's texts as they came, or the texts last approved.
  const [base, setBase] = useState<Texts | null>(null);
  // True while the draft is new texts from the agent that are not approved yet.
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
        // This runs again each time the page is shown (Activity), so the approved texts only fill an
        // empty page and never replace edits that are not approved yet.
        const saved = project.steps.writer === "approved" ? project.publish : undefined;
        if (saved) {
          const texts = textsOf(saved);
          setDraft((current) => current ?? texts);
          setBase((current) => current ?? texts);
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

  // Texts are written only for an idea and a script a human approved; without both, no request can be sent.
  const idea = project.steps.idea === "approved" ? project.idea : undefined;
  const script = project.steps.script === "approved" ? project.script : undefined;
  if (!idea || !script) {
    return (
      <>
        {header}
        <div className="flex flex-col items-start gap-4">
          <p>{idea ? t.noScript : t.noIdea}</p>
          <Button variant="primary" href={`/studio/${project.id}/${idea ? "script" : "idea"}`}>
            {idea ? t.scriptPage : t.ideaPage}
          </Button>
        </div>
      </>
    );
  }

  const approvedIdea: IdeaCard = idea;
  const approvedScript: Script = script;
  const generating = generate.kind === "loading";
  const saving = save.kind === "saving";

  // چرا با دکمه و نه خودکار هنگام باز شدن صفحه؟ هر درخواست از سهمیه‌ی مدل کم می‌کند و ممکن است تا یک
  // دقیقه طول بکشد؛ کسی که فقط برای دیدن متن‌های قبلی‌اش آمده نباید هزینه‌ای بدهد.
  async function generateTexts() {
    // One request at a time, and none while the approved texts are being saved.
    if (abortRef.current || saving) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerate({ kind: "loading" });
    try {
      const result = await requestTexts(project.channel, approvedIdea, approvedScript, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setGenerate({ kind: "error", message: result.message });
        return;
      }
      setDraft(result.texts);
      setBase(result.texts);
      setFresh(true);
      setDemo(result.demo);
      setErrors({});
      setSave({ kind: "idle" });
      setGenerate({ kind: "done" });
    } catch {
      // چرا خطا چیزی را پاک نمی‌کند؟ پیش‌نویس، ویرایش‌ها و متن‌های ذخیره‌شده فقط با جواب موفق عوض
      // می‌شوند. درخواست ناموفق نباید کار قبلی کاربر را از بین ببرد؛ فقط پیام می‌دهد.
      if (!controller.signal.aborted) setGenerate({ kind: "error", message: t.errors.network });
    } finally {
      // A request aborted by leaving the page may finish after a new one started; it must not
      // unlock that new request.
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // چرا پیش از متن‌های تازه می‌پرسیم؟ متن‌های تازه جای پیش‌نویس را می‌گیرند؛ ویرایش‌هایی که هنوز تأیید
  // نشده‌اند نباید با یک کلیک بی‌صدا از بین بروند، و پرسیدن جلوی یک درخواست بی‌جا را هم می‌گیرد.
  function writeTexts() {
    if (generating || saving) return;
    if (draft && base && textsDiffer(draft, base)) setConfirmOpen(true);
    else void generateTexts();
  }

  function edit(key: FieldKey, update: (texts: Texts) => Texts) {
    setDraft((current) => (current ? update(current) : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSave({ kind: "idle" });
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // New texts on their way replace this draft, so approving now would save the old one and
    // lose it a moment later.
    if (!draft || saving || generating) return;

    const checked = checkTexts(draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      const first = fieldOrder(draft).find((key) => checked.errors[key]);
      if (first) document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }

    setErrors({});
    setSave({ kind: "saving" });
    try {
      // Read again right before writing, so step statuses and a title chosen meanwhile are kept.
      const current = await getProject(project.id);
      if (!current) {
        setSave({ kind: "error", message: t.projectNotFound });
        return;
      }
      // چرا فقط متن تأییدشده ذخیره می‌شود؟ صفحه‌ی آماده‌ی انتشار و سازنده‌ی کاور هر چه در
      // project.publish باشد نشان می‌دهند و steps.writer را نمی‌سنجند. پس پیش‌نویس تا تأیید فقط در همین صفحه می‌ماند.
      // chosenTitle فقط یک شماره است: بعد از متن‌های تازه به عنوانی اشاره می‌کند که کاربر هرگز انتخابش
      // نکرده، پس کنار می‌رود و صفحه‌ی انتشار به عنوان اول برمی‌گردد؛ با ویرایش همان متن‌ها می‌ماند.
      // فصل‌ها همیشه می‌مانند: این دستیار فصل نمی‌نویسد و آن‌ها از زمان‌های ویدیو ساخته می‌شوند، نه از این متن‌ها.
      const previous = current.publish;
      const keptTitle = fresh ? undefined : previous?.chosenTitle;
      const publish: PublishKit = { ...checked.texts };
      if (keptTitle !== undefined) publish.chosenTitle = keptTitle;
      if (previous?.chapters) publish.chapters = previous.chapters;
      const steps: Project["steps"] = { ...current.steps, writer: "approved" };
      await updateProject(project.id, { publish, steps });
      setDraft(checked.texts);
      setBase(checked.texts);
      setFresh(false);
      setLoad({ kind: "ready", project: { ...current, publish, steps } });
      setSave({ kind: "saved", titleCleared: fresh && previous?.chosenTitle !== undefined });
    } catch {
      setSave({ kind: "error", message: t.errors.save });
    }
  }

  return (
    <>
      {header}

      <div className="flex flex-col items-start gap-3">
        {/* The only red button until there are texts; after that the red one is «متن‌ها رو تأیید کن». */}
        <Button
          variant={draft ? "secondary" : "primary"}
          size={draft ? "md" : "lg"}
          loading={generating}
          disabled={saving}
          onClick={writeTexts}
        >
          {draft ? t.regenerate : t.generate}
        </Button>
        <p role="status" className="text-muted">
          {generating ? t.generating : generate.kind === "done" ? t.generated : ""}
        </p>
        {generate.kind === "error" && <p role="alert">{generate.message}</p>}
        {fresh && project.steps.writer === "approved" && project.publish && <p className="text-muted">{t.previous}</p>}
      </div>

      {draft && (
        <form noValidate onSubmit={approve} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Locked while new texts are on their way: they replace this draft, so edits made meanwhile would be lost. */}
          <fieldset disabled={generating} className="min-w-0 disabled:opacity-60">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-h3">{t.editor.heading}</h2>
                  {demo && <Badge tone="outline">{t.demo.badge}</Badge>}
                </div>
                {demo && <p className="text-muted">{t.demo.note}</p>}
              </div>
              <TextsEditor idPrefix={formId} texts={draft} errors={errors} onEdit={edit} />
            </div>
          </fieldset>

          <Surface className="flex flex-col gap-5 lg:sticky lg:top-6">
            <p className="text-muted">{t.form.note}</p>
            <div className="flex flex-col items-start gap-3">
              <Button type="submit" variant="primary" loading={saving} disabled={generating}>
                {t.form.approve}
              </Button>
              <p role="status">
                {save.kind === "saved" ? (save.titleCleared ? t.form.savedNewTitles : t.form.saved) : ""}
              </p>
              {save.kind === "saved" && (
                <Button variant="ghost" size="sm" href={`/studio/${project.id}/publish`} className="-ms-4">
                  {t.publishPage}
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
          void generateTexts();
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        {t.confirm.text}
      </ConfirmDialog>
    </>
  );
}
