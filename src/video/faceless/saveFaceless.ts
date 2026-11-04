import type { MediaState, Slide } from '@/core/types';
import { deleteBlob, getProject, saveBlob, updateProject } from '@/storage/db';
import { ProjectNotFoundError } from '../saveRawVideo';

// The recorded voice of a faceless project that has no video yet. Once a video exists, audioKey
// only holds the MP3 that transcription extracts from it (saveTranscript), so it is not the take.
export function savedFacelessAudioKey(media: MediaState | undefined): string | undefined {
  return media?.mode === 'faceless' && !media.rawVideoKey ? media.audioKey : undefined;
}

// Browser only. Stores the voice before any video is made from it, so a long take survives a
// reload. Like saveRawVideo, it drops everything derived from the old media, and deletes the old
// blobs only after the new one is safely saved. Outputs that were already exported are kept.
export async function saveFacelessAudio(projectId: string, blob: Blob): Promise<string> {
  const project = await getProject(projectId);
  if (!project) throw new ProjectNotFoundError(projectId);

  const previousKeys = [
    project.media?.rawVideoKey,
    project.media?.audioKey,
    ...(project.media?.slides ?? []).map((slide) => slide.imageKey),
  ];
  const key = await saveBlob(blob);
  const media: MediaState = { ...project.media, mode: 'faceless', audioKey: key, outputs: project.media?.outputs ?? [] };
  delete media.rawVideoKey;
  delete media.transcript;
  delete media.cuts;
  delete media.shorts;
  delete media.slides;
  try {
    await updateProject(projectId, { media });
  } catch (error) {
    await deleteBlob(key).catch(() => {});
    throw error;
  }

  // A leftover blob only wastes space, so a failure here must not fail the save.
  for (const oldKey of previousKeys) {
    if (oldKey) await deleteBlob(oldKey).catch(() => {});
  }
  return key;
}

export interface SlideToSave {
  sectionId: string;
  start: number;
  end: number;
  image: Blob;
}

// Browser only. Stores the finished video as the project's raw video, so the edit steps read it
// like any other. The voice now lives inside the video and audioKey goes back to meaning the
// extracted MP3, so the take is deleted. Storing can take a while, so the project is read after
// that, right before writing, and changes made meanwhile are kept.
export async function saveFacelessVideo(projectId: string, video: Blob, slidesToSave: SlideToSave[]): Promise<string> {
  const newKeys: string[] = [];
  const save = async (blob: Blob) => {
    const key = await saveBlob(blob);
    newKeys.push(key);
    return key;
  };

  let previousKeys: (string | undefined)[];
  let videoKey: string;
  try {
    videoKey = await save(video);
    const slides: Slide[] = [];
    for (const { sectionId, start, end, image } of slidesToSave) {
      slides.push({ sectionId, imageKey: await save(image), start, end });
    }

    const project = await getProject(projectId);
    if (!project) throw new ProjectNotFoundError(projectId);
    if (!project.media) throw new Error(`Project ${projectId} has no media to attach a video to`);

    previousKeys = [
      project.media.rawVideoKey,
      project.media.audioKey,
      ...(project.media.slides ?? []).map((slide) => slide.imageKey),
    ];
    const media: MediaState = { ...project.media, mode: 'faceless', rawVideoKey: videoKey, slides };
    delete media.audioKey;
    delete media.transcript;
    delete media.cuts;
    delete media.shorts;
    await updateProject(projectId, { media });
  } catch (error) {
    for (const key of newKeys) await deleteBlob(key).catch(() => {});
    throw error;
  }

  // A leftover blob only wastes space, so a failure here must not fail the save.
  for (const oldKey of previousKeys) {
    if (oldKey) await deleteBlob(oldKey).catch(() => {});
  }
  return videoKey;
}
