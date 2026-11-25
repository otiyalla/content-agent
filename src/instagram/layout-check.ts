import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { CANVAS, COLORS, loadFonts } from './brand';
import { FRAME, slideParts, type Ask, type El } from './templates';
import type { Slide } from './types';

// ---------------------------------------------------------------------------
// Layout check: does the text fit on the slide?
//
// Satori never reports overflow. Too much text just spills over the footer or
// off the canvas. So we draw each part of the slide (header, content, footer)
// on its own transparent canvas, find the lowest and right-most drawn pixel,
// and compare the content's real size with the space the frame gives it.
// ---------------------------------------------------------------------------

const CONTENT_WIDTH = CANVAS.width - FRAME.padX * 2;
const SLACK = 400; // extra room on the measuring canvas so overflow is visible
const MEASURE_HEIGHT = 3200;

// A screen slide's text sits above the phone. Keep at least this much of the
// phone visible, or the screenshot stops proving anything.
const MIN_PHONE_VISIBLE = 560;
const PHONE_GAP = 36;

interface Box {
  width: number;
  height: number;
}

async function measure(el: El): Promise<Box> {
  const W = CONTENT_WIDTH + SLACK;
  const root: El = {
    type: 'div',
    props: {
      style: { display: 'flex', width: W, height: MEASURE_HEIGHT, alignItems: 'flex-start', fontFamily: 'Jakarta', color: COLORS.text },
      children: [{ type: 'div', props: { style: { display: 'flex', flexDirection: 'column', width: CONTENT_WIDTH, flexShrink: 0 }, children: el } }],
    },
  };
  const svg = await satori(root as unknown as Parameters<typeof satori>[0], { width: W, height: MEASURE_HEIGHT, fonts: loadFonts() });
  const { pixels, width, height } = new Resvg(svg).render();
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (pixels[row + x * 4 + 3] > 8) {
        if (x > maxX) maxX = x;
        maxY = y;
      }
    }
  }
  return { width: maxX + 1, height: maxY + 1 };
}

const chromeCache = new Map<string, number>();

async function chromeHeight(key: string, el: El | null): Promise<number> {
  if (!el) return 0;
  const hit = chromeCache.get(key);
  if (hit !== undefined) return hit;
  const { height } = await measure(el);
  chromeCache.set(key, height);
  return height;
}

/** Problems with how one slide's text fits. Expects a slide already passed through normalizeSlide. */
export async function layoutIssues(slide: Slide, index: number, total: number, ask: Ask = {}): Promise<string[]> {
  const where = `slide ${index + 1}`;
  const parts = slideParts(slide, index, total, ask);
  const headerH = await chromeHeight(JSON.stringify(parts.header), parts.header);
  const footerH = await chromeHeight(JSON.stringify(parts.footer), parts.footer);
  const content = await measure(parts.content);
  const issues: string[] = [];

  if (content.width > CONTENT_WIDTH + 2) {
    issues.push(`${where}: text runs ${content.width - CONTENT_WIDTH}px past the right edge (a long word or number with no spaces?)`);
  }

  if (parts.bleed) {
    const space = CANVAS.height - FRAME.padTop - headerH - FRAME.bleedGap;
    const phoneVisible = space - content.height - PHONE_GAP;
    if (phoneVisible < MIN_PHONE_VISIBLE) {
      issues.push(`${where}: the text above the app screen is too long; only ${Math.max(0, phoneVisible)}px of the phone would show (need ${MIN_PHONE_VISIBLE}px)`);
    }
  } else {
    const space = CANVAS.height - FRAME.padTop - FRAME.padBottom - headerH - footerH - FRAME.contentPadY * 2;
    if (content.height > space) {
      issues.push(`${where}: text is ${content.height - space}px too tall for the slide and would overlap the header or footer; shorten it`);
    }
  }
  return issues;
}
