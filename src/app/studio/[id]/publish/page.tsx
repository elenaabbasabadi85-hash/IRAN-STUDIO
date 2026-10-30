import type { Metadata } from 'next';
import { Suspense } from 'react';
import fa from '@/i18n/fa.json';
import { PublishClient } from './PublishClient';

export const metadata: Metadata = {
  title: fa.publish.metaTitle,
};

// The project and its files live in the browser (IndexedDB), so the server renders only a shell.
export default function PublishPage({ params }: PageProps<'/studio/[id]/publish'>) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-8 sm:px-8 sm:py-12">
      <Suspense fallback={<p>{fa.publish.loading}</p>}>
        {params.then(({ id }) => (
          <PublishClient projectId={id} />
        ))}
      </Suspense>
    </main>
  );
}
