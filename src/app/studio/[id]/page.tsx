import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjectOverview } from '@/components/project/ProjectOverview';
import fa from '@/i18n/fa.json';

export const metadata: Metadata = {
  title: fa.studio.project.metaTitle,
};

// The project lives in the browser (IndexedDB), so the server renders only a shell.
export default function ProjectPage({ params }: PageProps<'/studio/[id]'>) {
  return (
    <main className="mx-auto flex w-full text-pretty max-w-5xl flex-1 flex-col gap-10 px-4 py-8 sm:px-8 sm:py-12">
      <Suspense fallback={<p>{fa.studio.project.loading}</p>}>
        {params.then(({ id }) => (
          <ProjectOverview projectId={id} />
        ))}
      </Suspense>
    </main>
  );
}
