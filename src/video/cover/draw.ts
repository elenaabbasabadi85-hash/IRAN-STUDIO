// Draws the cover. The preview and the saved PNG both go through drawCover, so they always match. Browser only.
import { fitText, usesDisplayFont } from "@/video/cover/wrap";

export const COVER_WIDTH = 1280;
export const COVER_HEIGHT = 720;

const OVERLAY_OPACITY = 0.55;
const TEXT_MARGIN = 80;
const MAX_LINES = 3;
const MAX_FONT_SIZE = 120;
const MIN_FONT_SIZE = 40;
const FONT_SIZE_STEP = 4;
const LINE_HEIGHT = 1.4;
// Lalezar has only this weight (src/styles/fonts.ts).
const DISPLAY_FONT_WEIGHT = "400";

export interface CoverFont {
  family: string;
  weight: string;
}

export interface CoverStyle {
  displayFont: CoverFont;
  headingFont: CoverFont;
  textColor: string;
  overlayColor: string;
}

export interface CoverFrame {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/** A canvas cannot read var(), so the brand values are read from tokens.css as computed strings. */
export function readCoverStyle(): CoverStyle {
  const root = getComputedStyle(document.documentElement);
  return {
    displayFont: { family: root.getPropertyValue("--family-display").trim(), weight: DISPLAY_FONT_WEIGHT },
    headingFont: {
      family: root.getPropertyValue("--family-heading").trim(),
      weight: root.getPropertyValue("--type-h1-weight").trim(),
    },
    textColor: root.getPropertyValue("--brand-cream").trim(),
    overlayColor: root.getPropertyValue("--brand-navy").trim(),
  };
}

function fontFor(size: number, font: CoverFont): string {
  return `${font.weight} ${size}px ${font.family}`;
}

/** Lalezar for short text; longer text stays readable in the heading font. */
function coverFont(text: string, style: CoverStyle): CoverFont {
  return usesDisplayFont(text) ? style.displayFont : style.headingFont;
}

/** Each font file serves a unicode-range, so the text decides which ones the browser has to load. */
export async function loadCoverFont(text: string, style: CoverStyle): Promise<void> {
  await document.fonts.load(fontFor(MAX_FONT_SIZE, coverFont(text, style)), text);
}

/** The middle part of the frame that fills the canvas without stretching it. */
function coverCrop(width: number, height: number) {
  const scale = Math.max(COVER_WIDTH / width, COVER_HEIGHT / height);
  const sw = COVER_WIDTH / scale;
  const sh = COVER_HEIGHT / scale;
  return { sx: (width - sw) / 2, sy: (height - sh) / 2, sw, sh };
}

export function drawCover(ctx: CanvasRenderingContext2D, frame: CoverFrame, text: string, style: CoverStyle): void {
  const { sx, sy, sw, sh } = coverCrop(frame.width, frame.height);
  ctx.drawImage(frame.source, sx, sy, sw, sh, 0, 0, COVER_WIDTH, COVER_HEIGHT);

  ctx.save();
  ctx.globalAlpha = OVERLAY_OPACITY;
  ctx.fillStyle = style.overlayColor;
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  ctx.restore();

  const font = coverFont(text, style);
  const maxWidth = COVER_WIDTH - TEXT_MARGIN * 2;
  const { size, lines } = fitText(
    text,
    (line, fontSize) => {
      ctx.font = fontFor(fontSize, font);
      return ctx.measureText(line).width;
    },
    { maxWidth, maxLines: MAX_LINES, maxSize: MAX_FONT_SIZE, minSize: MIN_FONT_SIZE, step: FONT_SIZE_STEP },
  );

  ctx.font = fontFor(size, font);
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.textColor;
  const lineHeight = size * LINE_HEIGHT;
  const firstY = COVER_HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    // maxWidth only matters for one word too wide even at the smallest size: the canvas narrows it.
    ctx.fillText(line, COVER_WIDTH / 2, firstY + i * lineHeight, maxWidth);
  });
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The canvas gave no PNG"))), "image/png");
  });
}
