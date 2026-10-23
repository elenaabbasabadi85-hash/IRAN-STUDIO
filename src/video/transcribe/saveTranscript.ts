// Stores a finished transcript (and optionally its extracted audio) in the project. Browser only.
import type { Transcript } from "@/core/types";
import { deleteBlob, getProject, saveBlob, updateProject } from "@/storage/db";

/**
 * The project is read again right before writing, so changes made meanwhile
 * (e.g. in another tab) are kept. A previous audio file is deleted only after
 * the new one is referenced by the project.
 */
export async function saveTranscript(projectId: string, transcript: Transcript, audio?: Blob): Promise<void> {
  const project = await getProject(projectId);
  if (!project?.media) {
    throw new Error(`Project ${projectId} has no media to attach a transcript to`);
  }
  const media = project.media;

  let audioKey: string | undefined;
  if (audio) {
    try {
      audioKey = await saveBlob(audio);
    } catch {
      // The audio is only a cache; the transcript still gets saved without it.
    }
  }

  try {
    await updateProject(projectId, {
      media: { ...media, transcript, ...(audioKey ? { audioKey } : {}) },
    });
  } catch (e) {
    if (audioKey) await deleteBlob(audioKey).catch(() => {});
    throw e;
  }

  if (audioKey && media.audioKey && media.audioKey !== audioKey) {
    await deleteBlob(media.audioKey).catch(() => {});
  }
}
