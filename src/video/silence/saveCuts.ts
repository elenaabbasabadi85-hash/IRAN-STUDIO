// Stores silence cuts and the shortened video in the project. Browser only.
import type { CutSegment, MediaState, OutputFile } from "@/core/types";
import { deleteBlob, getProject, saveBlob, updateProject } from "@/storage/db";
import { ProjectNotFoundError } from "@/video/saveRawVideo";

/**
 * Replaces the project's silence cuts. Cuts with another reason (retake, manual)
 * come from other tools and are kept. The project is read again right before
 * writing, so changes made meanwhile are kept.
 */
export async function saveSilenceCuts(projectId: string, silenceCuts: CutSegment[]): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.media) throw new Error(`Project ${projectId} has no media to attach cuts to`);

  const others = (project.media.cuts ?? []).filter((c) => c.reason !== "silence");
  const cuts = [...others, ...silenceCuts].sort((a, b) => a.start - b.start);
  await updateProject(projectId, { media: { ...project.media, cuts } });
}

/**
 * Saves an exported video and lists it in media.outputs. Short clips are cut from the newest
 * exported video, so saved clip times no longer fit and are dropped, to be suggested again.
 */
export async function saveCutOutput(projectId: string, video: Blob): Promise<OutputFile> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);
  if (!project.media) throw new Error(`Project ${projectId} has no media to attach an output to`);

  const key = await saveBlob(video);
  const output: OutputFile = { kind: "video", key, createdAt: new Date().toISOString() };
  const media: MediaState = { ...project.media, outputs: [...project.media.outputs, output] };
  delete media.shorts;
  try {
    await updateProject(projectId, { media });
  } catch (e) {
    await deleteBlob(key).catch(() => {});
    throw e;
  }
  return output;
}
