import { COLORS, CANVAS, HANDLE, Z_MARK_DATA_URI } from './brand';
import type { Slide } from './types';
import { screenDataUri } from './screens';

// ---------------------------------------------------------------------------
// Slide templates, expressed as satori element trees (React-element-shaped
// plain objects — no React runtime needed).
//
// Text conventions the LLM can use inside title/body:
//   **word**  → highlighted in teal
// ---------------------------------------------------------------------------

type Style = Record<string, string | number>;
export interface El {
  type: string;
  props: { style?: Style; children?: Child; src?: string; width?: number; height?: number };
}
type Child = El | string | Array<El | string> | undefined;

function h(type: string, style: Style, children?: Child, extra: Partial<El['props']> = {}): El {
  return { type, props: { style, children, ...extra } };
}

const div = (style: Style, children?: Child) => h('div', { display: 'flex', ...style }, children);

// Icons as inline SVG — the brand fonts don't include ✓ / → glyphs.
const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const ICONS = {
  check: (c: string) =>
    svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  arrow: (c: string) =>
    svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  share: (c: string) =>
    svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  bookmark: (c: string) =>
    svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21z" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/></svg>`),
  plus: (c: string) =>
    svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round"/></svg>`),
};
const icon = (src: string, size: number) => h('img', { width: size, height: size }, undefined, { src, width: size, height: size });

/**
 * Splits "**x**" markers into teal-highlighted runs. satori has no inline text
 * layout for mixed runs, so highlighted text becomes word-level flex items in
 * a wrapping row; plain text stays a single string so it wraps natively.
 */
function rich(text: string, base: string = COLORS.text, accent: string = COLORS.teal): Child {
  if (!text.includes('**')) return text;
  // Tokenise into words, remembering whether whitespace follows each one so
  // "(**2.5%**)" stays tight while "buy **now**" keeps its space.
  const tokens: Array<{ text: string; hl: boolean; space: boolean }> = [];
  for (const part of text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)) {
    const hl = part.startsWith('**') && part.endsWith('**');
    const raw = hl ? part.slice(2, -2) : part;
    if (/^\s/.test(raw) && tokens.length) tokens[tokens.length - 1].space = true;
    const words = raw.split(/\s+/).filter(Boolean);
    words.forEach((w, i) => tokens.push({ text: w, hl, space: i < words.length - 1 || /\s$/.test(raw) }));
  }
  return tokens.map((t) => h('span', { color: t.hl ? accent : base, marginRight: t.space ? '0.22em' : 0 }, t.text));
}

/** Rough auto-fit: shrink type as the text gets longer. */
function fit(text: string, sizes: Array<[number, number]>): number {
  const len = text.replace(/\*\*/g, '').length;
  for (const [maxChars, size] of sizes) if (len <= maxChars) return size;
  return sizes[sizes.length - 1][1];
}

const TITLE_SIZES: Array<[number, number]> = [
  [24, 104],
  [40, 88],
  [60, 76],
  [90, 64],
  [9999, 54],
];

const BODY_SIZES: Array<[number, number]> = [
  [90, 40],
  [160, 36],
  [9999, 32],
];

// ---------------------------------------------------------------------------
// Shared chrome: background, header, footer
// ---------------------------------------------------------------------------

interface FrameOpts {
  index: number; // 0-based slide index
  total: number;
  kicker: string;
  /** Content runs off the bottom edge (phone mockups); hides the footer. */
  bleed?: boolean;
  /** Slide quotes money amounts: label it as an illustrative example. */
  illustrative?: boolean;
}

// Money amounts on a slide ("$5,000", "CAD 2,064", "50 USD") are made-up
// examples, so those slides carry an "Illustrative example" label. Screen
// slides already say "Example data".
const CURRENCY_RE = /[$€£]\s?\d|\b(?:USD|CAD|EUR|GBP|AUD|NZD|JPY|CHF)\s?\d|\d\s?(?:USD|CAD|EUR|GBP|AUD|NZD|JPY|CHF)\b/;

export function isIllustrative(slide: Slide): boolean {
  if (slide.layout === 'screen') return false;
  return CURRENCY_RE.test([slide.kicker, slide.title, slide.body, slide.stat, ...slide.items].join(' '));
}

function header({ index, total, kicker }: FrameOpts): El {
  return div({ justifyContent: 'space-between', alignItems: 'center', width: '100%' }, [
    div({ alignItems: 'center', gap: 18 }, [
      h('img', { width: 56, height: 56 }, undefined, { src: Z_MARK_DATA_URI, width: 56, height: 56 }),
      h('div', { fontSize: 34, fontWeight: 800, color: COLORS.text, letterSpacing: -0.5 }, 'zenlot'),
    ]),
    total > 1
      ? h(
          'div',
          {
            fontFamily: 'Mono',
            fontSize: 26,
            color: COLORS.muted,
            padding: '10px 20px',
            borderRadius: 999,
            border: `2px solid ${COLORS.surfaceBorder}`,
          },
          `${index + 1}/${total}`,
        )
      : kicker
        ? kickerPill(kicker)
        : h('div', {}, ''),
  ]);
}

function kickerPill(text: string, color: string = COLORS.teal): El {
  return h(
    'div',
    {
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color,
      padding: '12px 24px',
      borderRadius: 999,
      backgroundColor: 'rgba(45,212,191,0.10)',
      border: `2px solid rgba(45,212,191,0.35)`,
    },
    text,
  );
}

function footer({ index, total, illustrative }: FrameOpts): El {
  const isLast = index === total - 1;
  return div({ justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }, [
    div({ flexDirection: 'column', gap: 6 }, [
      illustrative
        ? h('div', { fontSize: 20, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: COLORS.orange }, 'Illustrative example')
        : '',
      h('div', { fontSize: 28, fontWeight: 700, color: COLORS.muted }, HANDLE),
    ]),
    total > 1 && !isLast
      ? div({ alignItems: 'center', gap: 12, fontSize: 28, fontWeight: 700, color: COLORS.teal }, [
          'Swipe',
          icon(ICONS.arrow(COLORS.teal), 36),
        ])
      : h('div', { fontSize: 24, color: COLORS.muted }, 'Education, not financial advice'),
  ]);
}

function frame(opts: FrameOpts, content: El): El {
  return div(
    {
      width: CANVAS.width,
      height: CANVAS.height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: opts.bleed ? '72px 80px 0' : '72px 80px 64px',
      fontFamily: 'Jakarta',
      color: COLORS.text,
      backgroundImage: `linear-gradient(165deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
      position: 'relative',
    },
    [
      // soft teal glow, top-right
      h('div', {
        position: 'absolute',
        top: -260,
        right: -260,
        width: 760,
        height: 760,
        borderRadius: 9999,
        backgroundImage: 'radial-gradient(circle, rgba(45,212,191,0.22) 0%, rgba(45,212,191,0) 70%)',
      }),
      // blue glow, bottom-left
      h('div', {
        position: 'absolute',
        bottom: -320,
        left: -280,
        width: 820,
        height: 820,
        borderRadius: 9999,
        backgroundImage: 'radial-gradient(circle, rgba(31,111,184,0.22) 0%, rgba(31,111,184,0) 70%)',
      }),
      header(opts),
      opts.bleed
        ? div({ flexDirection: 'column', flexGrow: 1, width: '100%', paddingTop: 44, overflow: 'hidden' }, content)
        : div({ flexDirection: 'column', flexGrow: 1, justifyContent: 'center', width: '100%', padding: '40px 0' }, content),
      opts.bleed ? '' : footer(opts),
    ],
  );
}

// ---------------------------------------------------------------------------
// Text blocks
// ---------------------------------------------------------------------------

function title(text: string, extra: Style = {}): El {
  return h(
    'div',
    {
      display: 'flex', flexWrap: 'wrap',
      fontSize: fit(text, TITLE_SIZES),
      fontWeight: 800,
      lineHeight: 1.08,
      letterSpacing: -2,
      color: COLORS.text,
      ...extra,
    },
    rich(text),
  );
}

function body(text: string, extra: Style = {}): El | string {
  if (!text) return '';
  return h(
    'div',
    { display: 'flex', flexWrap: 'wrap', fontSize: fit(text, BODY_SIZES), fontWeight: 500, lineHeight: 1.45, color: COLORS.muted, ...extra },
    rich(text, (extra.color as string) ?? COLORS.muted),
  );
}

const accentBar = () =>
  h('div', {
    width: 120,
    height: 10,
    borderRadius: 999,
    backgroundImage: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.blue})`,
  });

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

function cover(s: Slide): El {
  return div({ flexDirection: 'column', gap: 44 }, [
    s.kicker ? div({}, kickerPill(s.kicker)) : '',
    title(s.title, { fontSize: fit(s.title, TITLE_SIZES) + 8 }),
    accentBar(),
    body(s.body, { color: COLORS.text, opacity: 0.85 }),
  ]);
}

function point(s: Slide): El {
  return div({ flexDirection: 'column', gap: 40 }, [
    s.kicker
      ? /^[\d\s/.#-]+$/.test(s.kicker)
        ? h('div', { fontFamily: 'Mono', fontSize: 36, color: COLORS.orange }, s.kicker)
        : h('div', { fontSize: 28, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: COLORS.orange }, s.kicker)
      : '',
    title(s.title),
    body(s.body),
  ]);
}

function stat(s: Slide): El {
  const negative = s.stat.trim().startsWith('-');
  const color = negative ? COLORS.loss : COLORS.teal;
  const len = s.stat.length;
  const size = len <= 4 ? 260 : len <= 7 ? 200 : 150;
  return div({ flexDirection: 'column', gap: 28 }, [
    s.kicker ? div({}, kickerPill(s.kicker)) : '',
    h('div', { fontSize: size, fontWeight: 800, color, letterSpacing: -10, lineHeight: 1 }, s.stat),
    title(s.title, { fontSize: Math.min(fit(s.title, TITLE_SIZES), 72) }),
    body(s.body),
  ]);
}

function list(s: Slide): El {
  return div({ flexDirection: 'column', gap: 40 }, [
    s.kicker ? div({}, kickerPill(s.kicker)) : '',
    title(s.title, { fontSize: Math.min(fit(s.title, TITLE_SIZES), 76) }),
    div(
      { flexDirection: 'column', gap: 22 },
      s.items.map((item) =>
        div(
          {
            alignItems: 'center',
            gap: 28,
            padding: '26px 30px',
            borderRadius: 24,
            backgroundColor: COLORS.surface,
            border: `2px solid ${COLORS.surfaceBorder}`,
          },
          [
            div(
              {
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundImage: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.blue})`,
              },
              icon(ICONS.check(COLORS.bgBottom), 30),
            ),
            h('div', { display: 'flex', flexWrap: 'wrap', fontSize: item.length > 60 ? 30 : 34, fontWeight: 700, lineHeight: 1.3 }, rich(item)),
          ],
        ),
      ),
    ),
  ]);
}

function mythFact(s: Slide): El {
  const card = (label: string, text: string, color: string, bg: string) =>
    div({ flexDirection: 'column', gap: 20, padding: '40px 44px', borderRadius: 32, backgroundColor: bg, border: `2px solid ${color}55` }, [
      h('div', { fontSize: 28, fontWeight: 800, letterSpacing: 4, color }, label),
      h('div', { display: 'flex', flexWrap: 'wrap', fontSize: fit(text, [[60, 52], [110, 44], [9999, 38]]), fontWeight: 700, lineHeight: 1.25 }, rich(text)),
    ]);
  return div({ flexDirection: 'column', gap: 32 }, [
    s.kicker ? div({}, kickerPill(s.kicker)) : '',
    card('MYTH', s.title, COLORS.loss, 'rgba(242,107,107,0.08)'),
    card('FACT', s.body, COLORS.gain, 'rgba(52,211,153,0.08)'),
  ]);
}

function quote(s: Slide): El {
  return div({ flexDirection: 'column', gap: 36 }, [
    h('div', { fontSize: 220, lineHeight: 0.6, color: COLORS.teal, fontWeight: 800, height: 120 }, '“'),
    title(s.title, { letterSpacing: -1.5 }),
    s.body ? div({ alignItems: 'center', gap: 20 }, [accentBar(), body(s.body, { fontSize: 32 })]) : '',
  ]);
}

function question(s: Slide): El {
  const letters = ['A', 'B', 'C', 'D'];
  return div({ flexDirection: 'column', gap: 44 }, [
    div({}, kickerPill(s.kicker || 'Your turn', COLORS.orange)),
    title(s.title),
    div(
      { flexDirection: 'column', gap: 20 },
      s.items.slice(0, 4).map((opt, i) =>
        div(
          { alignItems: 'center', gap: 26, padding: '24px 30px', borderRadius: 24, border: `2px solid ${COLORS.surfaceBorder}`, backgroundColor: COLORS.surface },
          [
            h('div', { fontFamily: 'Mono', fontSize: 32, color: COLORS.orange }, letters[i]),
            h('div', { fontSize: 34, fontWeight: 700 }, opt),
          ],
        ),
      ),
    ),
    body(s.body || 'Comment your answer below'),
  ]);
}

function cta(s: Slide): El {
  return div({ flexDirection: 'column', gap: 44, alignItems: 'flex-start' }, [
    h('img', { width: 140, height: 140 }, undefined, { src: Z_MARK_DATA_URI, width: 140, height: 140 }),
    title(s.title || 'Save this for your next session'),
    body(s.body || 'Plan, record and review every trade against your rules with Zenlot. Free on iOS and Android, link in bio.'),
    div({ gap: 18 }, [
      ['Save', ICONS.bookmark(COLORS.teal)],
      ['Share', ICONS.share(COLORS.teal)],
      ['Follow', ICONS.plus(COLORS.teal)],
    ].map(([label, src]) =>
      div(
        { alignItems: 'center', gap: 12, padding: '16px 28px', borderRadius: 999, border: `2px solid ${COLORS.surfaceBorder}`, fontSize: 30, fontWeight: 700 },
        [icon(src, 30), label],
      ),
    )),
  ]);
}

/**
 * Real app screenshot in a phone frame that bleeds off the bottom edge.
 * The UI itself is never altered; explanation sits above it, and the screen is
 * labelled as example data.
 */
function screen(s: Slide): El {
  const PHONE_W = 600;
  const BEZEL = 14;
  const screenW = PHONE_W - BEZEL * 2;
  const screenH = Math.round((screenW * 1600) / 738);
  return div({ flexDirection: 'column', gap: 36, width: '100%', height: '100%' }, [
    // Text block never shrinks; the phone takes whatever height is left and bleeds off the edge.
    screenText(s),
    div({ flexGrow: 1, justifyContent: 'center', alignItems: 'flex-start', width: '100%' }, [
      div(
        {
          flexShrink: 0,
          padding: BEZEL,
          borderRadius: 72,
          backgroundColor: '#1A2533',
          border: '2px solid rgba(255,255,255,0.14)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
        },
        h('img', { width: screenW, height: screenH, borderRadius: 58 }, undefined, {
          src: screenDataUri(s.screen || 'insights'),
          width: screenW,
          height: screenH,
        }),
      ),
    ]),
  ]);
}

function screenText(s: Slide): El {
  const exampleLabel = h(
    'div',
    { fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: COLORS.muted },
    'App screen · Example data',
  );
  return div({ flexDirection: 'column', gap: 24, flexShrink: 0 }, [
    div({ alignItems: 'center', gap: 24 }, [s.kicker ? kickerPill(s.kicker) : '', exampleLabel]),
    title(s.title, { fontSize: Math.min(fit(s.title, TITLE_SIZES), 68) }),
    s.body ? body(s.body, { fontSize: 32 }) : '',
  ]);
}

const LAYOUTS: Record<Slide['layout'], (s: Slide) => El> = {
  cover,
  point,
  stat,
  list,
  mythfact: mythFact,
  quote,
  question,
  cta,
  screen,
};

export function slideElement(slide: Slide, index: number, total: number): El {
  const content = LAYOUTS[slide.layout](slide);
  // Single images show the kicker in the header pill — but only for layouts
  // that don't already draw it in the body. Carousels show the slide counter.
  const kicker = total === 1 && slide.layout === 'quote' ? slide.kicker : '';
  return frame({ index, total, kicker, bleed: slide.layout === 'screen', illustrative: isIllustrative(slide) }, content);
}

/**
 * The pieces of a slide the layout check measures: the header and footer as
 * drawn, and the content block (for screen slides, only the text above the
 * phone, since the phone is meant to run off the bottom edge).
 */
export function slideParts(slide: Slide, index: number, total: number) {
  const kicker = total === 1 && slide.layout === 'quote' ? slide.kicker : '';
  const opts: FrameOpts = { index, total, kicker, bleed: slide.layout === 'screen', illustrative: isIllustrative(slide) };
  return {
    header: header(opts),
    footer: opts.bleed ? null : footer(opts),
    content: slide.layout === 'screen' ? screenText(slide) : LAYOUTS[slide.layout](slide),
    bleed: Boolean(opts.bleed),
  };
}

/** Frame geometry the layout check needs (kept next to frame() so they change together). */
export const FRAME = {
  padTop: 72,
  padBottom: 64,
  padX: 80,
  contentPadY: 40, // top and bottom padding around centred content
  bleedGap: 44, // space between header and content on screen slides
} as const;
