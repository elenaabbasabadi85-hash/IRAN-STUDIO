'use client';

import { useEffect, useId, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StepRail, type StepId } from '@/components/ui/StepRail';
import { Surface } from '@/components/ui/Surface';
import type { Project, StepStatus } from '@/core/types';
import fa from '@/i18n/fa.json';
import { format } from '@/i18n/format';
import { getProject } from '@/storage/db';

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
  const statuses: Partial<Record<StepId, StepStatus>> = {
    ...project.steps,
    record: project.media?.rawVideoKey ? 'ready' : 'empty',
  };
  // Only steps whose pages exist get a link.
  const hrefs: Partial<Record<StepId, string>> = {
    record: `/studio/${project.id}/record`,
    video: `/studio/${project.id}/edit`,
  };
  const fromIdea = project.entry === 'idea';

  return (
    <>
      <header className="flex flex-col items-start gap-3">
        {back}
        <h1>{project.title}</h1>
        <p className="text-muted">{format(t.channelLine, { name: project.channel.name, niche: project.channel.niche })}</p>
        <Badge tone="outline">{t.entry[project.entry]}</Badge>
      </header>

      <StepRail statuses={statuses} hrefs={hrefs} current={fromIdea ? 'idea' : 'record'} />

      <Surface as="section" aria-labelledby={nextStepId} className="flex flex-col items-start gap-4">
        <h2 id={nextStepId}>{t.nextTitle}</h2>
        <p className="max-w-2xl text-muted">{fromIdea ? t.ideaNotReady : t.uploadText}</p>
        {!fromIdea && (
          <Button variant="primary" href={`/studio/${project.id}/record/upload`}>
            {t.upload}
          </Button>
        )}
      </Surface>
    </>
  );
}
