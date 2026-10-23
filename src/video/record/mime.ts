// Order matters: the first type the browser can record wins.
// Chrome and Firefox record WebM; Safari (desktop and iOS) records MP4.
const CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
];

export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

// Chrome writes WebM files from MediaRecorder without a duration, so <video> reports Infinity
// and the seek bar does not work. Seeking far past the end makes the browser compute it.
export function fixInfiniteDuration(video: HTMLVideoElement): void {
  if (video.duration !== Infinity) return;
  const onTimeUpdate = () => {
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.currentTime = 0;
  };
  video.addEventListener('timeupdate', onTimeUpdate);
  video.currentTime = Number.MAX_SAFE_INTEGER;
}
