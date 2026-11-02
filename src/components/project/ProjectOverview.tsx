'use client';

import { useEffect, useId, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StepRail } from '@/components/ui/StepRail';
import { Surface } from '@/components/ui/Surface';
import type { Project } from '@/core/types';
import fa from '@/i18n/fa.json';
import { format } from '@/i18n/format';
import { getProject } from '@/storage/db';
import { projectStartStep, projectStepHrefs, projectStepStatuses } from './steps';

const t = fa.studio.project;

type Load = { status: 'loading' } | { status: 'ready'; project: Project } | { status: 'notFound' } | { status: 'error' };

// Overview of one project: its channel, the step rail and the next step. Kept simple on purpose;
// the full project page grows from here.
export function ProjectOverview({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  // Unique per instance: Next keeps earlier project pages hidden in the document.
  const nextStepId = useId();

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((project) => {
        if (active) setLoad(project ? { status: 'ready', project } : { status: 'notFound' });
      })
      .catch(() => {
        if (active) setLoad({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const back = (
    <Button variant="ghost" size="sm" href="/studio" className="-ms-4 self-start">
      {t.back}
    </Button>
  );

  if (load.status === 'loading') return <p>{t.loading}</p>;

  if (load.status !== 'ready') {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p role="alert">{load.status === 'notFound' ? t.notFound : t.loadError}</p>
      </div>
    );
  }

  const { project } = load;
  const statuses = projectStepStatuses(project);
  const next = nextStep(project);

  return (
    <>
      <header className="flex flex-col items-start gap-3">
        {back}
        <h1>{project.title}</h1>
        <p className="text-muted">{format(t.channelLine, { name: project.channel.name, niche: project.channel.niche })}</p>
        <Badge tone="outline">{t.entry[project.entry]}</Badge>
      </header>

      <StepRail statuses={statuses} hrefs={projectStepHrefs(project.id)} current={projectStartStep(project)} />

      <Surface as="section" aria-labelledby={nextStepId} className="flex flex-col items-start gap-4">
        <h2 id={nextStepId}>{t.nextTitle}</h2>
        <p className="max-w-2xl text-muted">{next.text}</p>
        <Button variant="primary" href={`/studio/${project.id}${next.page}`}>
          {next.label}
        </Button>
      </Surface>
    </>
  );
}

// The next step's text, button label and page under /studio/<id>. A raw-video project starts with its
// upload; an idea project starts with the idea, goes on to the script once the idea is approved, and to
// the recording, whose teleprompter shows the script, once the script is approved.
function nextStep(project: Project): { text: string; label: string; page: string } {
  if (project.entry === 'raw-video') return { text: t.uploadText, label: t.upload, page: '/record/upload' };
  if (project.steps.idea !== 'approved') return { text: t.ideaText, label: t.idea, page: '/idea' };
  if (project.steps.script !== 'approved') return { text: t.scriptText, label: t.script, page: '/script' };
  return { text: t.recordText, label: t.record, page: '/record' };
}
