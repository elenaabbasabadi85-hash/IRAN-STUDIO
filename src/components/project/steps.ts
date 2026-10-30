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
