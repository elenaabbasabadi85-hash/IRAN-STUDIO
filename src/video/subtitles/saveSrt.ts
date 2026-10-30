// Stores a subtitle file in the project. Browser only.
import type { OutputFile } from "@/core/types";
import { deleteBlob, getProject, saveBlob, updateProject } from "@/storage/db";
import { ProjectNotFoundError } from "@/video/saveRawVideo";
import { srtBlob } from "@/video/subtitles/srt";

/**
 * Saves the SRT text and lists it in media.outputs. Older subtitles stay; the publish page
 * takes the newest. The project is read again right before writing, so changes made
 * meanwhile are kept.
 */
export async function saveSrt(projectId: string, text: string): Promise<OutputFile> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.media) throw new Error(`Project ${projectId} has no media to attach subtitles to`);

  const key = await saveBlob(srtBlob(text));
  const output: OutputFile = { kind: "srt", key, createdAt: new Date().toISOString() };
  try {
    await updateProject(projectId, {
      media: { ...project.media, outputs: [...project.media.outputs, output] },
    });
  } catch (e) {
    await deleteBlob(key).catch(() => {});
    throw e;
  }
  return output;
}
