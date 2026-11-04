// The length of a saved take, read by the browser without loading the whole file. Browser only.
const METADATA_TIMEOUT_MS = 30_000;

// WebM files saved by MediaRecorder have no duration; seeking past the end makes the browser
// compute it (same trick as readVideoInfo).
export function readAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    let timer = 0;
    const finish = (seconds: number | null) => {
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.ondurationchange = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      if (seconds !== null && seconds > 0) resolve(seconds);
      else reject(new Error('unreadable audio'));
    };

    audio.onloadedmetadata = () => {
      if (audio.duration === Infinity) {
        audio.ondurationchange = () => {
          if (Number.isFinite(audio.duration)) finish(audio.duration);
        };
        audio.currentTime = Number.MAX_SAFE_INTEGER;
        return;
      }
      finish(audio.duration);
    };
    audio.onerror = () => finish(null);
    timer = window.setTimeout(() => finish(null), METADATA_TIMEOUT_MS);
    audio.src = url;
  });
}
