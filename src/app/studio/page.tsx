'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { projectStartStep, projectStepStatuses } from '@/components/project/steps';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StepRail } from '@/components/ui/StepRail';
import { focusRing } from '@/components/ui/focus';
import type { Project } from '@/core/types';
import fa from '@/i18n/fa.json';
import { format } from '@/i18n/format';
import { createProject, deleteProject, listProjects } from '@/storage/db';
import { sampleChannel } from './new/sampleChannel';

const t = fa.studio;

const dateFormat = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

const MESSAGE_MS = 2500;
const HEADING = 'heading';

function demoProject(): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: t.demo.title,
    entry: 'idea',
    channel: sampleChannel,
    steps: { idea: 'empty', script: 'empty', editor: 'empty', writer: 'empty', video: 'empty' },
  };
}

export default function StudioPage() {
  // null until the list has been read from the browser.
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // The project waiting for the delete confirmation.
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const messageTimer = useRef<number | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const projectList = useRef<HTMLUListElement>(null);
  // After a delete, focus moves to the next project, else the previous one, else the heading.
  const focusAfterDelete = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    listProjects()
      .then((list) => {
        if (active) setProjects(list);
      })
      .catch(() => {
        if (active) setError(t.loadError);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const target = focusAfterDelete.current;
    if (!target) return;
    focusAfterDelete.current = null;
    const element =
      target === HEADING ? heading.current : projectList.current?.querySelector<HTMLElement>(`[data-project-link="${target}"]`);
    element?.focus();
  }, [projects]);

  // Next keeps this page hidden after navigating away (Activity): it comes back with no dialog or message.
  useLayoutEffect(
    () => () => {
      window.clearTimeout(messageTimer.current);
      setToDelete(null);
      setDeleteError(null);
      setMessage('');
    },
    [],
  );

  async function handleCreateDemo() {
    setCreating(true);
    setError(null);
    try {
      const project = await createProject(demoProject());
      setProjects((list) => [project, ...(list ?? [])]);
    } catch {
      setError(t.createError);
    } finally {
      setCreating(false);
    }
  }

  function askToDelete(project: Project) {
    setDeleteError(null);
    setToDelete(project);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const project = toDelete;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Also deletes the project's video and audio files.
      await deleteProject(project.id);
      const current = projects ?? [];
      const index = current.findIndex((item) => item.id === project.id);
      const rest = current.filter((item) => item.id !== project.id);
      focusAfterDelete.current = rest[index]?.id ?? rest[index - 1]?.id ?? HEADING;
      setProjects(rest);
      setToDelete(null);
      window.clearTimeout(messageTimer.current);
      setMessage(format(t.list.deleted, { title: project.title }));
      messageTimer.current = window.setTimeout(() => setMessage(''), MESSAGE_MS);
    } catch {
      setDeleteError(t.list.deleteError);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 ref={heading} tabIndex={-1} className={focusRing}>
          {t.title}
        </h1>
        <div className="flex flex-wrap gap-3">
          {/* Creating a project is the main job of this page, so it is the one primary button. */}
          <Button variant="primary" href="/studio/new">
            {t.newProject}
          </Button>
          <Button onClick={handleCreateDemo} loading={creating}>
            {t.createDemo}
          </Button>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}

      {projects === null && !error && <p>{t.loading}</p>}

      {projects?.length === 0 && <p className="text-muted">{t.empty}</p>}

      {projects && projects.length > 0 && (
        <ul ref={projectList} className="flex flex-col gap-4">
          {projects.map((project) => (
            <li
              key={project.id}
              className="relative flex flex-col gap-5 bg-navy p-5 ring-1 ring-denim ring-inset transition-colors hover:bg-denim/20 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-h3">
                    {/* The link covers the whole card; the delete button sits above it. */}
                    <Link
                      href={`/studio/${project.id}`}
                      data-project-link={project.id}
                      className={`after:absolute after:inset-0 after:z-20 hover:underline ${focusRing}`}
                    >
                      {project.title}
                    </Link>
                  </h2>
                  <p className="text-caption font-normal text-muted">
                    {t.updatedAt}:{' '}
                    <time dateTime={project.updatedAt}>{dateFormat.format(new Date(project.updatedAt))}</time>
                  </p>
                </div>
                <div className="relative z-30 flex flex-wrap items-center gap-3">
                  <Badge tone="outline">{t.project.entry[project.entry]}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => askToDelete(project)}>
                    {t.list.delete}
                    <span className="sr-only"> {project.title}</span>
                  </Button>
                </div>
              </div>
              <StepRail
                statuses={projectStepStatuses(project)}
                current={projectStartStep(project)}
                label={format(t.list.steps, { title: project.title })}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={format(t.list.confirmTitle, { title: toDelete?.title ?? '' })}
        confirmLabel={t.list.confirm}
        cancelLabel={t.list.cancel}
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {t.list.confirmText}
      </ConfirmDialog>

      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center">
        {message && (
          <p className="flex w-full max-w-md justify-center bg-navy p-4 text-center font-bold ring-2 ring-cream ring-inset">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
