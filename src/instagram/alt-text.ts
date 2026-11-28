import { SCREENS } from './screens';
import { slideAsk, type Ask } from './templates';
import type { Slide } from './types';

// ---------------------------------------------------------------------------
// Alt text for every image in a post. Slide 1 uses the alt text the planner
// wrote; the other slides are pure text on a plain background, so their alt
// text is the slide's own words. Screen slides describe the app screenshot.
// ---------------------------------------------------------------------------

const MAX_ALT = 300;

function shorten(text: string, max = MAX_ALT): string {
  const flat = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.66 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

/** Shortens the text but never loses the ask at the end. */
const withAsk = (text: string, ask: string) => (ask ? `${sentence(shorten(text, MAX_ALT - ask.length - 2))} ${ask}.` : shorten(text));

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
  ];
  return withAsk(prefix + parts.filter(Boolean).map(sentence).join(' '), slideAsk(slide, index, total, ask));
}

/** One alt text per image, in slide order. */
export function postAltTexts(post: { slides: Slide[]; altText?: string } & Ask): string[] {
  return post.slides.map((slide, i) =>
    i === 0 && post.altText?.trim() ? withAsk(post.altText, slideAsk(slide, 0, post.slides.length, post)) : slideAltText(slide, i, post.slides.length, post),
  );
}
