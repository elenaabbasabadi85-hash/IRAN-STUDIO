// Stores clip suggestions and finished clips in the project. Browser only.
import type { OutputFile, ShortSuggestion } from "@/core/types";
import { deleteBlob, getProject, saveBlob, updateProject } from "@/storage/db";
import { ProjectNotFoundError } from "@/video/saveRawVideo";

export async function saveShortSuggestions(projectId: string, shorts: ShortSuggestion[]): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.media) throw new Error(`Project ${projectId} has no media to attach clips to`);

  await updateProject(projectId, { media: { ...project.media, shorts } });
}

/**
 * Saves a clip and lists it in media.outputs. Storing a clip can take a while, so the project
 * is read after that, right before writing, and changes made meanwhile are kept.
 */
export async function saveShortOutput(projectId: string, video: Blob): Promise<OutputFile> {
  const key = await saveBlob(video);
  try {
    const project = await getProject(projectId);
    if (!project) throw new ProjectNotFoundError(projectId);
    if (!project.media) throw new Error(`Project ${projectId} has no media to attach a clip to`);

    const output: OutputFile = { kind: "short", key, createdAt: new Date().toISOString() };
    await updateProject(projectId, {
      media: { ...project.media, outputs: [...project.media.outputs, output] },
    });
    return output;
  } catch (e) {
    await deleteBlob(key).catch(() => {});
    throw e;
  }
}

/** Every clip goes into the publish ZIP, so this is how a user takes one out. */
export async function deleteShortOutput(projectId: string, key: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.media) return;

  const outputs = project.media.outputs.filter((o) => !(o.kind === "short" && o.key === key));
  if (outputs.length === project.media.outputs.length) return;
  await updateProject(projectId, { media: { ...project.media, outputs } });

  // A leftover blob only wastes space, so a failure here must not fail the removal.
  await deleteBlob(key).catch(() => {});
}
