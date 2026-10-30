import { Suspense } from 'react';
import { ProjectStepNav } from '@/components/project/ProjectStepNav';

// Every page of one project shares the step rail, so each step leads to the next.
// Not async: the project id is read inside Suspense (Cache Components), like the pages do.
export default function ProjectLayout({ children, params }: LayoutProps<'/studio/[id]'>) {
  return (
    <>
      <Suspense fallback={null}>
        {params.then(({ id }) => (
          <ProjectStepNav projectId={id} />
        ))}
      </Suspense>
      {children}
    </>
  );
}
