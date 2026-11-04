// Draws the slides of a faceless video on the cover's canvas size, fonts and colors. Browser only.
import { COVER_HEIGHT, COVER_WIDTH, canvasToPng, drawCenteredText, loadCoverFont, readCoverStyle } from '@/video/cover/draw';
import type { PlannedSlide } from './timing';

// More than a cover allows, because a hook or a call to action is a whole sentence.
const MAX_LINES = 6;

export interface RenderedSlide extends PlannedSlide {
  image: Blob;
}

export async function renderSlides(slides: PlannedSlide[]): Promise<RenderedSlide[]> {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');

  const style = readCoverStyle();
  const rendered: RenderedSlide[] = [];
  for (const slide of slides) {
    // Without the font the slide is still drawn, in the next font of the brand stack.
    await loadCoverFont(slide.text, style).catch(() => {});
    ctx.fillStyle = style.overlayColor;
    ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
    drawCenteredText(ctx, slide.text, style, MAX_LINES);
    rendered.push({ ...slide, image: await canvasToPng(canvas) });
  }
  return rendered;
}
