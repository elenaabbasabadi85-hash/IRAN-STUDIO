import type { MediaState, RecordingMode } from '@/core/types';
import { deleteBlob, getProject, saveBlob, updateProject } from '@/storage/db';

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = 'ProjectNotFoundError';
  }
}

export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Dexie wraps the browser error and keeps the original in `inner`.
  const inner = (error as Error & { inner?: unknown }).inner;
  return error.name === 'QuotaExceededError' || (inner instanceof Error && inner.name === 'QuotaExceededError');
}

// Browser only. Stores the video and points the project at it. The transcript, cuts, shorts
// and extracted audio belong to the old video, so they are dropped. Old blobs are deleted only
// after the new video is safely saved.
export async function saveRawVideo(projectId: string, blob: Blob, mode: RecordingMode): Promise<string> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);

  const previousVideoKey = project.media?.rawVideoKey;
  const previousAudioKey = project.media?.audioKey;
  const key = await saveBlob(blob);
  const media: MediaState = { ...project.media, mode, rawVideoKey: key, outputs: project.media?.outputs ?? [] };
  delete media.transcript;
  delete media.cuts;
  delete media.shorts;
  delete media.audioKey;
  try {
    await updateProject(projectId, { media });
  } catch (error) {
    await deleteBlob(key).catch(() => {});
    throw error;
  }

  // A leftover blob only wastes space, so a failure here must not fail the save.
  for (const oldKey of [previousVideoKey, previousAudioKey]) {
    if (oldKey && oldKey !== key) await deleteBlob(oldKey).catch(() => {});
  }
  return key;
}
