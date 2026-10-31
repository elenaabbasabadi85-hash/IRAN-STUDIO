import { Suspense } from "react";
import type { Metadata } from "next";
import { IdeaClient } from "./IdeaClient";
import t from "./strings.fa.json";

export const metadata: Metadata = {
  title: t.metaTitle,
};

// The project lives in the browser (IndexedDB), so the server renders only a shell.
// The project id is only known at request time, so it is read inside Suspense (Cache Components).
export default function IdeaPage({ params }: PageProps<"/studio/[id]/idea">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-8 sm:px-8 sm:py-12">
      <Suspense fallback={<p>{t.loadingProject}</p>}>
        {params.then(({ id }) => (
          <IdeaClient projectId={id} />
        ))}
      </Suspense>
    </main>
  );
}
