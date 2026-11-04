// The ffmpeg filter of a silence cut. Pure, so it can be tested without a browser.
import type { TimeRange } from "@/video/cuts";

/**
 * Fixed rate first: a MediaRecorder WebM declares no frame rate, so ffmpeg assumes 1000 fps and
 * writes every frame many times, which turned a 5-second take into 4046 frames and 289 seconds of
 * work instead of 19. Other files keep their own rate: a fixed one would halve a 60 fps video.
 */
const WEBM_FPS = 30;

function fixedRate(sourceType: string): string {
  return sourceType.startsWith("video/webm") ? `fps=${WEBM_FPS},` : "";
}

export function cutFilterGraph(kept: TimeRange[], sourceType: string): string {
  const rate = fixedRate(sourceType);
  const parts = kept.map(
    ({ start, end }, i) =>
      `[0:v:0]${rate}trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}];` +
      `[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`,
  );
  const inputs = kept.map((_, i) => `[v${i}][a${i}]`).join("");
  // H.264 with yuv420p needs even dimensions; phone recordings are sometimes odd-sized.
  return [
    ...parts,
    `${inputs}concat=n=${kept.length}:v=1:a=1[vc][a]`,
    "[vc]scale=trunc(iw/2)*2:trunc(ih/2)*2[v]",
  ].join(";");
}
