import crypto from 'crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { CANVAS, loadFonts } from './brand';
import { slideElement } from './templates';
import { normalizeSlide } from './qa';
import { postAltTexts } from './alt-text';
import type { CalendarPost, Slide } from './types';

// ---------------------------------------------------------------------------
// Renders slides to JPEG buffers. Instagram's publishing API accepts JPEG
// only, so we rasterise with resvg and encode with jpeg-js (pure JS, no
// native image libraries needed on the CI runner).
// ---------------------------------------------------------------------------

const JPEG_QUALITY = 92;

// What turns the SVG into the published JPEG. Part of the fingerprint, so upgrading either shows up as a change.
const { version: RESVG_VERSION } = require('@resvg/resvg-js/package.json') as { version: string };
const { version: JPEG_VERSION } = require('jpeg-js/package.json') as { version: string };
const RASTERISER = `resvg ${RESVG_VERSION}, jpeg-js ${JPEG_VERSION}, q${JPEG_QUALITY}, ${CANVAS.width}x${CANVAS.height}`;

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
 * Fingerprint of a post's images and their alt text. Built from the SVGs
 * (satori is pure JS, so the same on every machine) rather than the JPEG
 * pixels, which can differ slightly between platforms, plus the rasteriser's
 * versions and settings. Changes when the text, a template, a font, an app
 * screenshot, the image conversion or any slide's alt text changes.
 * Throws if a slide can't be rendered.
 */
export async function renderHash(post: Pick<CalendarPost, 'slides' | 'altText'>): Promise<string> {
  const { slides } = post;
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify([RASTERISER, postAltTexts(post)]));
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
