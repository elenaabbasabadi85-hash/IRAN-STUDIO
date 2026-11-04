import { Suspense } from 'react';
import FacelessScreen from '@/video/faceless/FacelessScreen';
import strings from '@/video/faceless/strings.fa.json';

// Same shell as the record page: the project lives in the browser (IndexedDB), so the
// server renders only a fallback.
export default function FacelessPage({ params }: PageProps<'/studio/[id]/record/faceless'>) {
  return (
    <Suspense fallback={<p className="p-6">{strings.loadingProject}</p>}>
      {params.then(({ id }) => (
        <FacelessScreen projectId={id} />
      ))}
    </Suspense>
  );
}
