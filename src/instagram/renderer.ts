import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { CANVAS, loadFonts } from './brand';
import { slideElement } from './templates';
import { normalizeSlide } from './qa';
import type { Slide } from './types';

// ---------------------------------------------------------------------------
// Renders slides to JPEG buffers. Instagram's publishing API accepts JPEG
// only, so we rasterise with resvg and encode with jpeg-js (pure JS, no
// native image libraries needed on the CI runner).
// ---------------------------------------------------------------------------

const JPEG_QUALITY = 92;

export async function renderSlide(slide: Slide, index: number, total: number): Promise<Buffer> {
  // Swap symbols the font can't draw (e.g. "⁵", "≈") for plain text so they never render as boxes.
  const svg = await satori(slideElement(normalizeSlide(slide), index, total) as unknown as Parameters<typeof satori>[0], {
    width: CANVAS.width,
    height: CANVAS.height,
    fonts: loadFonts(),
  });

  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: CANVAS.width } }).render();
  const encoded = jpeg.encode(
    { data: Buffer.from(rendered.pixels), width: rendered.width, height: rendered.height },
    JPEG_QUALITY,
  );
  return encoded.data;
}

export async function renderPost(slides: Slide[]): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (let i = 0; i < slides.length; i++) {
    out.push(await renderSlide(slides[i], i, slides.length));
  }
  return out;
}
