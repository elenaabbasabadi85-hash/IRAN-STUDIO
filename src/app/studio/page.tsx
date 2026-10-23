'use client';

import { useEffect, useState } from 'react';
import type { Project } from '@/core/types';
import fa from '@/i18n/fa.json';
import { createProject, listProjects } from '@/storage/db';

const t = fa.studio;

const dateFormat = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

function demoProject(): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: t.demo.title,
    entry: 'idea',
    channel: {
      name: t.demo.channelName,
      niche: t.demo.niche,
      audience: t.demo.audience,
      tone: 'casual',
      avgLengthMin: 8,
    },
    steps: { idea: 'empty', script: 'empty', editor: 'empty', writer: 'empty', video: 'empty' },
  };
}

export default function StudioPage() {
  // null until the list has been read from the browser.
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <button
          type="button"
          onClick={handleCreateDemo}
          disabled={creating}
          className="rounded border px-4 py-2 disabled:opacity-50"
        >
          {creating ? t.creating : t.createDemo}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {projects === null && !error && <p>{t.loading}</p>}

      {projects?.length === 0 && <p>{t.empty}</p>}

      {projects && projects.length > 0 && (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id} className="rounded border p-4">
              <p className="font-bold">{project.title}</p>
              <p className="text-sm opacity-75">
                {t.updatedAt}:{' '}
                <time dateTime={project.updatedAt}>
                  {dateFormat.format(new Date(project.updatedAt))}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
