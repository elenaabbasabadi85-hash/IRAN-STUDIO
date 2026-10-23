import { Suspense } from 'react';
import RecordScreen from '@/video/record/RecordScreen';
import strings from '@/video/record/strings.fa.json';

// The project id is only known at request time and the project itself lives in the
// browser (IndexedDB), so the server renders just a shell with a fallback.
export default function RecordPage({ params }: PageProps<'/studio/[id]/record'>) {
  return (
    <Suspense fallback={<p className="p-6">{strings.loading}</p>}>
      {params.then(({ id }) => (
        <RecordScreen projectId={id} />
      ))}
    </Suspense>
  );
}
