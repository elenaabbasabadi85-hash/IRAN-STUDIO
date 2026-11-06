"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { changesNumberWords, usableSuggestions, type EditSuggestion } from "@/agents/editorRules";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import type { Project, Script } from "@/core/types";
import { getProject, updateProject } from "@/storage/db";
import { fill } from "../scriptDraft";
import {
  finalScript,
  foreignWords,
  normalizeScript,
  requestSuggestions,
  sameScript,
  spellingFixes,
} from "./editorDraft";
import { SpellingReport } from "./SpellingReport";
import { SuggestionCard } from "./SuggestionCard";
import t from "./strings.fa.json";

const digits = new Intl.NumberFormat("fa-IR");

// Getting suggestions and saving each show their own message, next to their own button.
type RequestState = { kind: "idle" | "loading" } | { kind: "error"; message: string };
/** stale: the stored script changed elsewhere, so nothing was saved. */
type Save = { kind: "idle" | "saving" | "saved" | "stale" } | { kind: "error"; message: string };

interface EditorReviewProps {
  project: Project;
  /** The approved script as stored when this review started. */
  original: Script;
  onSaved: (project: Project) => void;
}

// One review of one stored script. The page gives it a new key when the stored script changes, so all
// of this state starts over together.
export function EditorReview({ project, original, onSaved }: EditorReviewProps) {
  const { fixed, fixes, foreign } = useMemo(() => {
    const normalized = normalizeScript(original);
    return { fixed: normalized, fixes: spellingFixes(original, normalized), foreign: foreignWords(normalized) };
  }, [original]);
  const [suggestions, setSuggestions] = useState<{ list: EditSuggestion[]; demo: boolean } | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [request, setRequest] = useState<RequestState>({ kind: "idle" });
  const [save, setSave] = useState<Save>({ kind: "idle" });
  // The stored script approval expects to find: the one this review started from, then the one it saved.
  const [expected, setExpected] = useState(original);
  const abortRef = useRef<AbortController | null>(null);
  // Unique per instance: Next keeps pages it navigated away from hidden in the document.
  const idPrefix = useId();

  // Next keeps this page hidden after the user leaves (Activity) and runs this cleanup.
  // چرا لغو؟ جوابی که کسی منتظرش نیست فقط سهمیه‌ی مدل را مصرف می‌کند. ref همین‌جا خالی می‌شود تا با
  // برگشتن به صفحه هیچ دکمه‌ای قفل نمانده باشد، حتی اگر finally درخواست لغوشده هنوز اجرا نشده باشد.
  // اصلاح‌ها، کارت‌ها و تیک‌ها می‌مانند؛ فقط پیام‌های گذرا پاک می‌شوند.
  useLayoutEffect(() => {
    const abort = abortRef;
    return () => {
      abort.current?.abort();
      abort.current = null;
      setRequest({ kind: "idle" });
      setSave({ kind: "idle" });
    };
  }, []);

  const requesting = request.kind === "loading";
  const saving = save.kind === "saving";
  const fetched = suggestions !== null;
  const count = suggestions?.list.length ?? 0;

  // چرا با دکمه و نه خودکار هنگام باز شدن صفحه؟ هر درخواست از سهمیه‌ی مدل کم می‌کند و ممکن است تا دو
  // دقیقه طول بکشد؛ اصلاح‌های درست‌نویسی بدون مدل هم آماده‌اند.
  async function getSuggestions() {
    // One request at a time, and none while the script is being saved.
    if (abortRef.current || saving) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRequest({ kind: "loading" });
    try {
      const result = await requestSuggestions(project.channel, fixed, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setRequest({ kind: "error", message: result.message });
        return;
      }
      // چرا فقط پیشنهادهای قابل‌استفاده؟ کارتی که کد نتواند دقیقاً اعمالش کند (from پیدا نشد یا دو بار
      // پیدا شد، رقمی عوض می‌شد، با پیشنهاد قبلی هم‌پوشانی داشت) قولی می‌دهد که عملی نمی‌شود.
      const list = usableSuggestions(fixed, result.suggestions);
      setSuggestions({ list, demo: result.demo });
      // چرا کارت هشداردار تیک‌نخورده شروع می‌شود؟ عدد یا واحد زمانِ غلط راحت از چشم می‌افتد و اعتبار ویدیو
      // را می‌برد؛ پیش‌فرض باید امن باشد، پس کاربر باید نگاه کند و خودش تیک بزند.
      setTicked(new Set(list.filter(({ from, to }) => !changesNumberWords(from, to)).map(({ id }) => id)));
      setSave({ kind: "idle" });
      setRequest({ kind: "idle" });
    } catch {
      // چرا خطا چیزی را پاک نمی‌کند؟ اصلاح‌ها، کارت‌های قبلی و تیک‌ها فقط با جواب موفق عوض می‌شوند.
      if (!controller.signal.aborted) setRequest({ kind: "error", message: t.errors.network });
    } finally {
      // A request aborted by leaving the page may finish after a new one started; it must not
      // unlock that new request.
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function toggle(id: string, on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setSave({ kind: "idle" });
  }

  // چرا تأیید بدون پیشنهاد هم کار می‌کند؟ مدل رایگان ممکن است شلوغ یا خراب باشد؛ نباید یوتیوبر را معطل
  // کند. اصلاح‌های درست‌نویسی کار کد هستند و به‌تنهایی ارزش ذخیره شدن دارند.
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // New suggestions on their way replace these cards, so approving now would save ticks about to go.
    if (saving || requesting) return;

    setSave({ kind: "saving" });
    try {
      // Read again right before writing, so step statuses changed meanwhile are kept.
      const current = await getProject(project.id);
      if (!current) {
        setSave({ kind: "error", message: t.projectNotFound });
        return;
      }
      // The fixes and suggestions were made for one script. If it changed elsewhere (approved again,
      // maybe in another tab), applying them to it could write over someone's work, so nothing is saved.
      if (current.steps.script !== "approved" || !current.script || !sameScript(current.script, expected)) {
        setSave({ kind: "stale" });
        return;
      }
      const accepted = suggestions?.list.filter(({ id }) => ticked.has(id)) ?? [];
      const script = finalScript(current.script, fixed, accepted);
      if (!script) {
        setSave({ kind: "error", message: t.approve.tooLong });
        return;
      }
      // چرا تا تأیید چیزی ذخیره نمی‌شود؟ تله‌پرامپتر (src/video/record) و اسلایدهای حالت بدون چهره هر چه در
      // project.script باشد نشان می‌دهند و steps را نمی‌سنجند؛ متن نیمه‌بازبینی‌شده نباید به آن‌ها برسد.
      const steps: Project["steps"] = { ...current.steps, editor: "approved" };
      await updateProject(project.id, { script, steps });
      setExpected(script);
      onSaved({ ...current, script, steps });
      setSave({ kind: "saved" });
    } catch {
      setSave({ kind: "error", message: t.errors.save });
    }
  }

  const headingId = `${idPrefix}-suggestions`;

  return (
    <form noValidate onSubmit={approve} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-10">
        {project.steps.editor === "approved" && save.kind !== "saved" && (
          <p className="text-muted">{t.approvedBefore}</p>
        )}
        <SpellingReport fixes={fixes} foreign={foreign} scriptHref={`/studio/${project.id}/script`} />

        <section aria-labelledby={headingId} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={headingId} className="text-h3">
                {t.suggestions.heading}
              </h2>
              {suggestions?.demo && <Badge tone="outline">{t.demo.badge}</Badge>}
            </div>
            <p className="max-w-2xl text-muted">{t.suggestions.intro}</p>
            {suggestions?.demo && <p className="text-muted">{t.demo.note}</p>}
          </div>

          <div className="flex flex-col items-start gap-3">
            {/* The only red button until suggestions came; after that the red one is «ویراستاری رو تأیید کن». */}
            <Button
              variant={fetched ? "secondary" : "primary"}
              size={fetched ? "md" : "lg"}
              loading={requesting}
              disabled={saving}
              onClick={getSuggestions}
            >
              {fetched ? t.suggestions.again : t.suggestions.get}
            </Button>
            <p role="status" className="text-muted">
              {requesting
                ? t.suggestions.loading
                : fetched
                  ? count > 0
                    ? fill(t.suggestions.ready, { n: count })
                    : t.suggestions.none
                  : ""}
            </p>
            {request.kind === "error" && <p role="alert">{request.message}</p>}
          </div>

          {suggestions && count > 0 && (
            // Locked while new suggestions are on their way: they replace these cards and their ticks.
            <fieldset aria-labelledby={headingId} disabled={requesting || saving} className="min-w-0 disabled:opacity-60">
              <ul className="flex flex-col gap-3">
                {suggestions.list.map((suggestion, i) => (
                  <li key={suggestion.id}>
                    <SuggestionCard
                      id={`${idPrefix}-card-${i}`}
                      n={i + 1}
                      suggestion={suggestion}
                      checked={ticked.has(suggestion.id)}
                      onChange={(on) => toggle(suggestion.id, on)}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </section>
      </div>

      <Surface className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-h3">{t.approve.heading}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">{t.approve.fixes}</dt>
            <dd>{digits.format(fixes.length)}</dd>
            <dt className="text-muted">{t.approve.picked}</dt>
            <dd>{fetched ? fill(t.approve.pickedValue, { n: ticked.size, m: count }) : t.approve.notFetched}</dd>
          </dl>
          <p className="text-caption font-normal text-muted">{t.approve.note}</p>
        </div>
        <div className="flex flex-col items-start gap-3">
          <Button type="submit" variant={fetched ? "primary" : "secondary"} loading={saving} disabled={requesting}>
            {t.approve.button}
          </Button>
          <p role="status">{save.kind === "saved" ? t.approve.saved : ""}</p>
          {save.kind === "saved" && (
            <Button variant="ghost" size="sm" href={`/studio/${project.id}/record`} className="-ms-4">
              {t.recordPage}
            </Button>
          )}
          {save.kind === "stale" && <p role="alert">{t.approve.stale}</p>}
          {save.kind === "error" && <p role="alert">{save.message}</p>}
        </div>
      </Surface>
    </form>
  );
}
