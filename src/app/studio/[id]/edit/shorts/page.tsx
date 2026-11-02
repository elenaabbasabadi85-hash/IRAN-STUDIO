import { Suspense } from "react";
import type { Metadata } from "next";
import t from "@/video/shorts/strings.fa.json";
import ShortsClient from "./ShortsClient";

export const metadata: Metadata = {
  title: t.title,
};

// The project id is only known at request time, so it is read inside Suspense (Cache Components).
export default function ShortsPage({ params }: PageProps<"/studio/[id]/edit/shorts">) {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-4xl px-4 py-10">{t.loadingProject}</p>}>
      {params.then(({ id }) => (
        <ShortsClient projectId={id} />
      ))}
    </Suspense>
  );
}
