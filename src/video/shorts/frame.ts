// The 9:16 frame of a short clip. Pure, so the ffmpeg filter can be tested without a browser.

/** Change this one value to export larger clips; 1080x1920 takes about 2.25 times as long. */
export const SHORT_SIZE = { width: 720, height: 1280 } as const;

/** Measured against veryfast: about a third less time for about twice the file size. */
export const SHORT_PRESET = "ultrafast";

/**
 * Fixed rate first: a MediaRecorder WebM declares no frame rate, so ffmpeg assumes 1000 fps and
 * writes every frame many times, which turned a 5-second clip into 5000 frames. Filling the
 * frame keeps the proportions; `position` then picks which part of a wide video stays.
 */
const SHORT_FPS = 30;

/** Where the crop sits across a wide video: 0 is the left edge, 0.5 the middle, 1 the right edge. */
export const CENTER_POSITION = 0.5;

export function shortVideoFilter(position: number = CENTER_POSITION): string {
  const { width, height } = SHORT_SIZE;
  const x = Math.round(Math.min(1, Math.max(0, position)) * 1000) / 1000;
  return [
    `fps=${SHORT_FPS}`,
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}:(iw-ow)*${x}:(ih-oh)/2`,
    "setsar=1",
  ].join(",");
}

/** A video wider than 9:16 loses its sides, so only then does the position change anything. */
export function canMoveCrop(videoWidth: number, videoHeight: number): boolean {
  return videoWidth * SHORT_SIZE.height > videoHeight * SHORT_SIZE.width;
}
