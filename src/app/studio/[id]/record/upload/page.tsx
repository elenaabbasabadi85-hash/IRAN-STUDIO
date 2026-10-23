import { Suspense } from 'react';
import UploadScreen from '@/video/upload/UploadScreen';
import strings from '@/video/upload/strings.fa.json';

// Same shell as the record page: the project lives in the browser (IndexedDB), so the
// server renders only a fallback.
export default function UploadPage({ params }: PageProps<'/studio/[id]/record/upload'>) {
  return (
    <Suspense fallback={<p className="p-6">{strings.loading}</p>}>
      {params.then(({ id }) => (
        <UploadScreen projectId={id} />
      ))}
    </Suspense>
  );
}
