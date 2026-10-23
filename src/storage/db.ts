// Browser storage for projects and their media files (IndexedDB through Dexie).
// Every function here runs only in the browser: call them from effects or event handlers,
// never while rendering on the server.

import Dexie, { type Table } from 'dexie';
import type { Project } from '@/core/types';

class StudioDB extends Dexie {
  projects!: Table<Project, string>;
  // Video, audio and image files. The key is out-of-line, so the Blob itself is the stored value.
  blobs!: Table<Blob, string>;

  constructor() {
    super('iran-studio');
    this.version(1).stores({
      projects: 'id, updatedAt',
      blobs: '',
    });
  }
}

let db: StudioDB | undefined;

function getDb(): StudioDB {
  if (typeof window === 'undefined') {
    throw new Error('src/storage/db.ts runs only in the browser, not during server rendering.');
  }
  db ??= new StudioDB();
  return db;
}

function now(): string {
  return new Date().toISOString();
}

export async function createProject(
  input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Project> {
  const time = now();
  const project: Project = { ...input, id: crypto.randomUUID(), createdAt: time, updatedAt: time };
  await getDb().projects.add(project);
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  return getDb().projects.get(id);
}

// Newest first: the most recently changed project comes first.
export async function listProjects(): Promise<Project[]> {
  return getDb().projects.orderBy('updatedAt').reverse().toArray();
}

// id and createdAt never change; updatedAt is always set to the current time.
export async function updateProject(id: string, changes: Partial<Project>): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.projects, async () => {
    const current = await db.projects.get(id);
    if (!current) {
      throw new Error(`Project not found: ${id}`);
    }
    await db.projects.put({
      ...current,
      ...changes,
      id,
      createdAt: current.createdAt,
      updatedAt: now(),
    });
  });
}

// Also deletes the project's media files, so large videos do not stay behind in the browser.
export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.projects, db.blobs, async () => {
    const project = await db.projects.get(id);
    if (!project) {
      return;
    }
    await db.blobs.bulkDelete(blobKeys(project));
    await db.projects.delete(id);
  });
}

function blobKeys(project: Project): string[] {
  const media = project.media;
  if (!media) {
    return [];
  }
  const keys = [
    media.rawVideoKey,
    media.audioKey,
    ...(media.slides ?? []).map((slide) => slide.imageKey),
    ...media.outputs.map((output) => output.key),
  ];
  return keys.filter((key): key is string => Boolean(key));
}

export async function saveBlob(blob: Blob): Promise<string> {
  const key = crypto.randomUUID();
  await getDb().blobs.add(blob, key);
  return key;
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return getDb().blobs.get(key);
}

export async function deleteBlob(key: string): Promise<void> {
  await getDb().blobs.delete(key);
}
