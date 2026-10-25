'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Project } from '@/core/types';
import fa from '@/i18n/fa.json';
import { createProject, listProjects } from '@/storage/db';
import { sampleChannel } from './new/sampleChannel';

const t = fa.studio;

const dateFormat = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t.title}</h1>
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
