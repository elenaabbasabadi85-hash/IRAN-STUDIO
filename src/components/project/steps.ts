import type { StepId } from '@/components/ui/StepRail';
import type { Project, StepStatus } from '@/core/types';

// Shared by the project page and the project list, so both show a project's steps the same way.

/** Each step's status for the step rail. Recording has no status in the contract: it is ready once a raw video is stored. */
export function projectStepStatuses(project: Project): Partial<Record<StepId, StepStatus>> {
  return {
    ...project.steps,
    record: project.media?.rawVideoKey ? 'ready' : 'empty',
  };
}

/** The step the project starts from: the idea, or the recording for a project that starts from a raw video. */
export function projectStartStep(project: Project): StepId {
  return project.entry === 'idea' ? 'idea' : 'record';
}

// The steps that have a page so far, by path under /studio/<id>. A step gets a link only once its page exists.
const STEP_PAGES: Partial<Record<StepId, string>> = {
  idea: '/idea',
  record: '/record',
  video: '/edit',
  publish: '/publish',
};

/** Links for the steps that have a page. */
export function projectStepHrefs(projectId: string): Partial<Record<StepId, string>> {
  return Object.fromEntries(Object.entries(STEP_PAGES).map(([step, page]) => [step, `/studio/${projectId}${page}`]));
}

/** The step whose page (or one of its sub-pages, such as /record/upload) the path shows, if any. */
export function projectStepAt(pathname: string, projectId: string): StepId | undefined {
  const base = `/studio/${projectId}`;
  const entry = Object.entries(STEP_PAGES).find(([, page]) => {
    const path = base + page;
    return pathname === path || pathname.startsWith(`${path}/`);
  });
  return entry?.[0] as StepId | undefined;
}
