"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { IDEA_LIMITS, ideaDraftSchema, type AgentErrorResponse, type AgentResponse } from "@/agents/schemas";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { focusRing } from "@/components/ui/focus";
import type { ChannelProfile, IdeaCard, Project } from "@/core/types";
import { getProject, updateProject } from "@/storage/db";
import t from "./strings.fa.json";

type Load =
  | { kind: "loading" | "notFound" | "error" }
  | { kind: "ready"; project: Project };

// Generating ideas and saving the chosen one each show their own message, next to their own button.
type Generate = { kind: "idle" | "loading" | "done" } | { kind: "error"; message: string };
type Save = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };

type Field = keyof typeof IDEA_LIMITS;
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly { key: Field; multiline: boolean }[] = [
  { key: "workingTitle", multiline: false },
  { key: "angle", multiline: true },
  { key: "whyItWorks", multiline: true },
  { key: "audience", multiline: true },
];

const DETAILS = ["angle", "whyItWorks", "audience"] as const satisfies readonly Field[];

// Mirrors inputClasses in src/app/studio/new/NewProjectForm.tsx (Platform lane).
const inputClasses = `w-full bg-navy px-3 py-2.5 text-cream ring-1 ring-concrete ring-inset aria-invalid:ring-2 aria-invalid:ring-live-red ${focusRing}`;

const digits = new Intl.NumberFormat("fa-IR");

// The server already checked the ideas (output guardrail). This check only keeps the page from
// breaking on a response it does not expect, such as an error page from the host.
const ideaResponseSchema = z.object({
  data: z.object({ ideas: z.array(ideaDraftSchema.extend({ id: z.string().min(1) })).min(1) }),
  demo: z.boolean(),
}) satisfies z.ZodType<Pick<AgentResponse<"idea">, "data" | "demo">>;

const errorResponseSchema = z.object({ error: z.string().trim().min(1) }) satisfies z.ZodType<AgentErrorResponse>;

type IdeasResult = { ok: true; ideas: IdeaCard[]; demo: boolean } | { ok: false; message: string };

/** Throws only when the network fails or the request is aborted; every server answer becomes a result. */
async function requestIdeas(channel: ChannelProfile, signal: AbortSignal): Promise<IdeasResult> {
  const response = await fetch("/api/agents/idea", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorResponseSchema.safeParse(body);
    return { ok: false, message: failure.success ? failure.data.error : t.errors.unreadable };
  }
  const parsed = ideaResponseSchema.safeParse(body);
  return parsed.success
    ? { ok: true, ideas: parsed.data.data.ideas, demo: parsed.data.demo }
    : { ok: false, message: t.errors.unreadable };
}

function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as Field;
    errors[field] ??= issue.code === "too_big" ? t.form.tooLong : t.form.required;
  }
  return errors;
}

// The idea page: the idea agent suggests ideas, the user picks one, edits it and approves it.
// Only the approved idea is stored in the project.
export function IdeaClient({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [cards, setCards] = useState<IdeaCard[]>([]);
  const [demo, setDemo] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // چرا برای هر کارت یک پیش‌نویس جدا؟ در گروه رادیویی، کلیدهای جهت‌نما انتخاب را فوراً عوض می‌کنند.
  // با یک پیش‌نویس، کسی که با صفحه‌کلید از روی کارت‌ها رد می‌شود ویرایشش را گم می‌کرد.
  const [drafts, setDrafts] = useState<Record<string, IdeaCard>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generate, setGenerate] = useState<Generate>({ kind: "idle" });
  const [save, setSave] = useState<Save>({ kind: "idle" });
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
        // This runs again each time the page is shown (Activity), so the saved idea only fills an
        // empty form and never replaces edits that are not saved yet.
        const saved = project.idea;
        if (saved) {
          setSelectedId((current) => current ?? saved.id);
          setDrafts((current) => (current[saved.id] ? current : { ...current, [saved.id]: saved }));
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
  // چرا لغو؟ جوابی که کسی منتظرش نیست فقط سهمیه‌ی مدل را مصرف می‌کند. پیام‌های گذرا هم پاک می‌شوند
  // تا با برگشتن به صفحه پیام کهنه‌ای نبینی؛ کارت‌ها و ویرایش‌ها می‌مانند.
  useLayoutEffect(() => {
    const abort = abortRef;
    return () => {
      abort.current?.abort();
      setGenerate({ kind: "idle" });
      setSave({ kind: "idle" });
    };
  }, []);

  if (load.kind === "loading") return <p>{t.loadingProject}</p>;

  if (load.kind !== "ready") {
    return (
      <div className="flex flex-col items-start gap-4">
        <Button variant="ghost" size="sm" href="/studio" className="-ms-4">
          {t.backToStudio}
        </Button>
        <p role="alert">{load.kind === "notFound" ? t.projectNotFound : t.projectLoadError}</p>
      </div>
    );
  }

  const { project } = load;
  const draft = selectedId ? drafts[selectedId] : undefined;
  const generating = generate.kind === "loading";
  const saving = save.kind === "saving";
  const hasWork = cards.length > 0 || draft !== undefined;
  const previous = cards.length > 0 && draft !== undefined && !cards.some((card) => card.id === draft.id);

  // چرا با دکمه و نه خودکار هنگام باز شدن صفحه؟ هر درخواست از سهمیه‌ی مدل کم می‌کند و ممکن است تا
  // یک دقیقه طول بکشد؛ کسی که فقط برای دیدن ایده‌ی قبلی‌اش آمده نباید هزینه‌ای بدهد.
  async function generateIdeas() {
    // One request at a time: a second click while one is running does nothing.
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerate({ kind: "loading" });
    try {
      const result = await requestIdeas(project.channel, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setGenerate({ kind: "error", message: result.message });
        return;
      }
      setCards(result.ideas);
      setDemo(result.demo);
      setGenerate({ kind: "done" });
    } catch {
      // چرا خطا چیزی را پاک نمی‌کند؟ کارت‌ها، انتخاب و ویرایش‌ها فقط با جواب موفق عوض می‌شوند. یک
      // درخواست ناموفق نباید کار قبلی کاربر را از بین ببرد؛ فقط پیام می‌دهد تا دوباره امتحان کند.
      if (!controller.signal.aborted) setGenerate({ kind: "error", message: t.errors.network });
    } finally {
      // A request aborted by leaving the page may finish after a new one started; it must not
      // unlock that new request.
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function select(card: IdeaCard) {
    setSelectedId(card.id);
    setDrafts((current) => (current[card.id] ? current : { ...current, [card.id]: card }));
    setErrors({});
    setSave({ kind: "idle" });
  }

  function change(field: Field, value: string) {
    if (!draft) return;
    const id = draft.id;
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSave({ kind: "idle" });
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving || generating) return;

    // چرا همان اسکیمای Zod دستیار؟ ایده‌ی ویرایش‌شده باید همان قاعده‌هایی را داشته باشد که ایده‌ی
    // مدل داشت (محافظ ورودی). اگر روزی حدی در src/agents/schemas.ts عوض شود، اینجا هم خودبه‌خود عوض می‌شود.
    const parsed = ideaDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      setErrors(found);
      const first = FIELDS.find(({ key }) => found[key]);
      if (first) document.getElementById(`${formId}-${first.key}`)?.focus();
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
      // چرا فقط ایده‌ی تأییدشده ذخیره می‌شود؟ کارت‌ها پیشنهادند، نه تصمیم. مرحله‌ی بعد (سناریو) فقط باید
      // روی ایده‌ای کار کند که انسان دیده و تأیید کرده است؛ شناسه‌ی ایده هم همان می‌ماند.
      const idea: IdeaCard = { ...draft, ...parsed.data };
      await updateProject(project.id, { idea, steps: { ...current.steps, idea: "approved" } });
      setDrafts((all) => ({ ...all, [idea.id]: idea }));
      setSave({ kind: "saved" });
    } catch {
      setSave({ kind: "error", message: t.errors.save });
    }
  }

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

      <div className="flex flex-col items-start gap-3">
        {/* The only red button until there are ideas; after that the red one is «تأیید ایده». */}
        <Button
          variant={hasWork ? "secondary" : "primary"}
          size={hasWork ? "md" : "lg"}
          loading={generating}
          disabled={saving}
          onClick={generateIdeas}
        >
          {hasWork ? t.regenerate : t.generate}
        </Button>
        <p role="status" className="text-muted">
          {generating ? t.generating : generate.kind === "done" ? t.generated : ""}
        </p>
        {generate.kind === "error" && <p role="alert">{generate.message}</p>}
      </div>

      {hasWork && (
        <div className={cards.length > 0 ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]" : "max-w-2xl"}>
          {cards.length > 0 && <IdeaCards cards={cards} demo={demo} selectedId={selectedId} onSelect={select} />}

          <Surface
            as="section"
            aria-labelledby={`${formId}-heading`}
            className="flex flex-col gap-5 lg:sticky lg:top-6"
          >
            <h2 id={`${formId}-heading`} className="text-h3">
              {t.form.heading}
            </h2>
            {draft ? (
              <form noValidate onSubmit={approve} className="flex flex-col gap-5">
                {previous && <p className="text-muted">{t.form.previous}</p>}
                {FIELDS.map(({ key, multiline }) => (
                  <TextField
                    key={key}
                    id={`${formId}-${key}`}
                    field={key}
                    multiline={multiline}
                    value={draft[key]}
                    error={errors[key]}
                    onChange={(value) => change(key, value)}
                  />
                ))}
                <div className="flex flex-col items-start gap-3">
                  <Button type="submit" variant="primary" loading={saving} disabled={generating}>
                    {t.form.approve}
                  </Button>
                  <p role="status">{save.kind === "saved" ? t.form.saved : ""}</p>
                  {save.kind === "saved" && (
                    <Button variant="ghost" size="sm" href={`/studio/${project.id}`} className="-ms-4">
                      {t.form.backToProject}
                    </Button>
                  )}
                  {save.kind === "error" && <p role="alert">{save.message}</p>}
                </div>
              </form>
            ) : (
              // Brand rule: exactly one red button. Until a card is chosen it is here, but disabled.
              <>
                <p className="text-muted">{t.form.pick}</p>
                <Button variant="primary" disabled className="self-start">
                  {t.form.approve}
                </Button>
              </>
            )}
          </Surface>
        </div>
      )}
    </>
  );
}

interface IdeaCardsProps {
  cards: IdeaCard[];
  demo: boolean;
  selectedId: string | null;
  onSelect: (card: IdeaCard) => void;
}

// Native radios (keyboard: Tab into the group, arrows to move) drawn as cards, like the cards in
// src/app/studio/new/NewProjectForm.tsx. Each radio is named by its title and described by the rest.
function IdeaCards({ cards, demo, selectedId, onSelect }: IdeaCardsProps) {
  // Unique per instance: Next keeps pages it navigated away from hidden in the document.
  const groupId = useId();

  return (
    <section aria-labelledby={`${groupId}-heading`} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`${groupId}-heading`} className="text-h3">
          {t.cards.heading}
        </h2>
        {demo && <Badge tone="outline">{t.demo.badge}</Badge>}
      </div>
      {demo && <p className="text-muted">{t.demo.note}</p>}

      <fieldset>
        <legend className="mb-3 text-muted">{t.cards.legend}</legend>
        <div className="flex flex-col gap-3">
          {cards.map((card) => {
            const titleId = `${groupId}-${card.id}-title`;
            const detailsId = `${groupId}-${card.id}-details`;
            return (
              <label
                key={card.id}
                className="group flex cursor-pointer gap-4 p-5 ring-1 ring-concrete ring-inset has-checked:bg-surface has-checked:ring-2 has-checked:ring-cream has-checked:[--ui-text-muted:var(--ui-surface-text-muted)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cream"
              >
                <input
                  type="radio"
                  name={groupId}
                  value={card.id}
                  checked={card.id === selectedId}
                  onChange={() => onSelect(card)}
                  aria-labelledby={titleId}
                  aria-describedby={detailsId}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-2 ring-concrete ring-inset group-has-checked:ring-cream"
                >
                  <span className="size-2.5 rounded-full bg-cream opacity-0 group-has-checked:opacity-100" />
                </span>
                <span className="flex min-w-0 flex-col gap-3">
                  <span id={titleId} className="font-heading text-h3">
                    {card.workingTitle}
                  </span>
                  <span id={detailsId} className="flex flex-col gap-2">
                    {DETAILS.map((key) => (
                      <span key={key} className="flex flex-col">
                        <span className="text-caption text-muted">{t.fields[key]}</span>
                        <span>{card[key]}</span>
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}

interface TextFieldProps {
  id: string;
  field: Field;
  multiline: boolean;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

// maxLength comes from the agent's own limits, so the form never accepts what the schema rejects.
function TextField({ id, field, multiline, value, error, onChange }: TextFieldProps) {
  const shared = {
    id,
    value,
    maxLength: IDEA_LIMITS[field],
    "aria-required": true,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-limit ${id}-error` : `${id}-limit`,
    className: inputClasses,
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-caption">
        {t.fields[field]}
      </label>
      {multiline ? (
        <textarea rows={4} onChange={(event) => onChange(event.target.value)} {...shared} />
      ) : (
        <input type="text" autoComplete="off" onChange={(event) => onChange(event.target.value)} {...shared} />
      )}
      <p id={`${id}-limit`} className="text-caption font-normal text-muted">
        {t.form.limit.replace("{max}", digits.format(IDEA_LIMITS[field]))}
      </p>
      {/* Cream, not red: live red fails contrast on the denim Surface. */}
      {error && (
        <p id={`${id}-error`} className="text-caption">
          {error}
        </p>
      )}
    </div>
  );
}
