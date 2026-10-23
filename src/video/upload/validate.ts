// Checks for an uploaded raw video. Everything runs in the browser and never reads the whole
// file into memory: the type comes from the name, and the metadata from a <video> element.

// Later steps edit the video with ffmpeg.wasm, which cannot address more than about 2 GB.
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_DURATION_SEC = 2 * 60 * 60;
const METADATA_TIMEOUT_MS = 30_000;

const EXTENSIONS: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

// For the file picker; both forms are listed because some phones only match one of them.
export const ACCEPT = [...new Set(Object.values(EXTENSIONS)), ...Object.keys(EXTENSIONS).map((ext) => `.${ext}`)].join(',');

export type UploadErrorKind = 'format' | 'tooLarge' | 'tooLong' | 'noVideo' | 'corrupt';

export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
}

export class UploadError extends Error {
  constructor(readonly kind: UploadErrorKind) {
    super(`Upload rejected: ${kind}`);
    this.name = 'UploadError';
  }
}

// Windows and some phones leave File.type empty for .mov, so the extension decides as well.
export function checkFile(file: File): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const known = Object.values(EXTENSIONS);
  if (!(ext in EXTENSIONS) && !known.includes(file.type)) throw new UploadError('format');
  if (file.size > MAX_BYTES) throw new UploadError('tooLarge');
}

// Rejects with UploadError when the browser cannot read the file as a video.
export function readVideoInfo(url: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    let timer = 0;
    const finish = (result: VideoInfo | UploadError) => {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.ondurationchange = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      if (result instanceof UploadError) reject(result);
      else resolve(result);
    };

    const report = () => {
      const { duration, videoWidth: width, videoHeight: height } = video;
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(new UploadError('corrupt'));
      } else if (width === 0 || height === 0) {
        finish(new UploadError('noVideo'));
      } else if (duration > MAX_DURATION_SEC) {
        finish(new UploadError('tooLong'));
      } else {
        finish({ durationSec: duration, width, height });
      }
    };

    video.onloadedmetadata = () => {
      // WebM files saved by MediaRecorder have no duration; seeking past the end makes the
      // browser compute it (same trick as fixInfiniteDuration in the record page).
      if (video.duration === Infinity) {
        video.ondurationchange = () => {
          if (Number.isFinite(video.duration)) report();
        };
        video.currentTime = Number.MAX_SAFE_INTEGER;
        return;
      }
      report();
    };
    video.onerror = () => finish(new UploadError('corrupt'));
    timer = window.setTimeout(() => finish(new UploadError('corrupt')), METADATA_TIMEOUT_MS);
    video.src = url;
  });
}
