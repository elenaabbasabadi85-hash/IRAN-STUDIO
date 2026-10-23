import type { MediaState } from '@/core/types';
import { deleteBlob, getProject, updateProject } from '@/storage/db';
import { ProjectNotFoundError } from './saveRawVideo';

// Browser only. The counterpart of saveRawVideo: unlinks the video and everything derived
// from it, then deletes the blobs. Outputs that were already exported are kept.
export async function removeRawVideo(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.media) return;

  const { rawVideoKey, audioKey } = project.media;
  const media: MediaState = { ...project.media };
  delete media.rawVideoKey;
  delete media.audioKey;
  delete media.transcript;
  delete media.cuts;
  delete media.shorts;
  await updateProject(projectId, { media });

  // A leftover blob only wastes space, so a failure here must not fail the removal.
  for (const key of [rawVideoKey, audioKey]) {
    if (key) await deleteBlob(key).catch(() => {});
  }
}
