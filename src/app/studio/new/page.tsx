import type { Metadata } from 'next';
import fa from '@/i18n/fa.json';
import { NewProjectForm } from './NewProjectForm';

export const metadata: Metadata = {
  title: fa.studio.new.metaTitle,
};

// Starting point and channel profile of a new project. The project is saved in the browser.
export default function NewProjectPage() {
  return (
    <main className="mx-auto flex w-full text-pretty max-w-3xl flex-1 flex-col px-4 py-8 sm:px-8 sm:py-12">
      <NewProjectForm />
    </main>
  );
}
