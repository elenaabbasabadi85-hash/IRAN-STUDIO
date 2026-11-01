// Stores a cover image in the project. Browser only.
import type { OutputFile } from "@/core/types";
import { deleteBlob, getProject, saveBlob, updateProject } from "@/storage/db";
import { ProjectNotFoundError } from "@/video/saveRawVideo";

/**
 * Saves the PNG and lists it in media.outputs. Older covers stay; the publish page
 * takes the newest. The project is read again right before writing, so changes made
 * meanwhile are kept.
 */
export async function saveCover(projectId: string, png: Blob): Promise<OutputFile> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.media) throw new Error(`Project ${projectId} has no media to attach a cover to`);

  const key = await saveBlob(png);
  const output: OutputFile = { kind: "cover", key, createdAt: new Date().toISOString() };
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
