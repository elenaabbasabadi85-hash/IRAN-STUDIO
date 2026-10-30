'use client';

import { liveQuery } from 'dexie';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StepRail } from '@/components/ui/StepRail';
import type { Project } from '@/core/types';
import { getProject } from '@/storage/db';
import { projectStepAt, projectStepHrefs, projectStepStatuses } from './steps';

// The step rail on every page of one project, from the project's layout, so each step leads to the next.
// It follows the stored project live: a saved recording or video shows here without a reload.
export function ProjectStepNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    const subscription = liveQuery(() => getProject(projectId)).subscribe({
      next: (found) => setProject(found ?? null),
      // The page itself reports a missing or unreadable project; the rail just stays away.
      error: () => setProject(null),
    });
    return () => subscription.unsubscribe();
  }, [projectId]);

  // The project page shows its own rail, next to the project's details.
  if (!project || pathname === `/studio/${projectId}`) return null;

  return (
    <div className="mb-4 border-b border-concrete/30 sm:mb-6">
      <StepRail
        statuses={projectStepStatuses(project)}
        hrefs={projectStepHrefs(projectId)}
        current={projectStepAt(pathname, projectId)}
        className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-8"
      />
    </div>
  );
}
