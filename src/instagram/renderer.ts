import crypto from 'crypto';
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

/** The slide as an SVG: the full layout, text and embedded screenshots, before rasterising. */
export async function renderSlideSvg(slide: Slide, index: number, total: number): Promise<string> {
  // Swap symbols the font can't draw (e.g. "⁵", "≈") for plain text so they never render as boxes.
  return satori(slideElement(normalizeSlide(slide), index, total) as unknown as Parameters<typeof satori>[0], {
    width: CANVAS.width,
    height: CANVAS.height,
    fonts: loadFonts(),
  });
}

/**
 * Fingerprint of how a post's slides look. Built from the SVGs (satori is
 * pure JS, so the same on every machine) rather than the JPEG pixels, which
 * can differ slightly between platforms. Changes when the text, a template,
 * a font or an app screenshot changes.
 */
export async function renderHash(slides: Slide[]): Promise<string> {
  const h = crypto.createHash('sha256');
  for (let i = 0; i < slides.length; i++) h.update(await renderSlideSvg(slides[i], i, slides.length));
  return h.digest('hex').slice(0, 16);
}

export async function renderSlide(slide: Slide, index: number, total: number): Promise<Buffer> {
  const svg = await renderSlideSvg(slide, index, total);

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
