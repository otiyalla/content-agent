import { SCREENS } from './screens';
import { slideAsk, type Ask } from './templates';
import type { Slide } from './types';

// ---------------------------------------------------------------------------
// Alt text for every image in a post. Slide 1 uses the alt text the planner
// wrote; the other slides are pure text on a plain background, so their alt
// text is the slide's own words. Screen slides describe the app screenshot.
// ---------------------------------------------------------------------------

const MAX_ALT = 300;

function shorten(text: string): string {
  const flat = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_ALT) return flat;
  const cut = flat.slice(0, MAX_ALT - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 200 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

const sentence = (s: string) => (s && !/[.!?:]$/.test(s.trim()) ? `${s.trim()}.` : s.trim());

export function slideAltText(slide: Slide, index: number, total: number, ask: Ask = {}): string {
  const prefix = total > 1 ? `Slide ${index + 1} of ${total}. ` : '';
  if (slide.layout === 'screen' && slide.screen) {
    return shorten(`${prefix}${sentence(slide.title)} ${sentence(slide.body)} ${SCREENS[slide.screen].alt}`);
  }
  const parts = [
    slide.kicker,
    slide.layout === 'mythfact' ? `Myth: ${slide.title}` : slide.title,
    slide.stat,
    slide.layout === 'mythfact' ? `Fact: ${slide.body}` : slide.body,
    slide.items.length ? slide.items.join('; ') : '',
    slideAsk(slide, index, total, ask),
  ];
  return shorten(prefix + parts.filter(Boolean).map(sentence).join(' '));
}

/** One alt text per image, in slide order. */
export function postAltTexts(post: { slides: Slide[]; altText?: string } & Ask): string[] {
  return post.slides.map((slide, i) =>
    i === 0 && post.altText?.trim() ? shorten(post.altText) : slideAltText(slide, i, post.slides.length, post),
  );
}
