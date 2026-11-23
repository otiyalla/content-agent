import zlib from 'zlib';
import { lintCopy } from '../content/brand-guard';
import { loadFonts } from './brand';
import type { Slide } from './types';

// ---------------------------------------------------------------------------
// Slide QA: runs before a post is planned, previewed or published.
//
// 1. Glyph check. Satori draws a character the font doesn't have as an empty
//    box (2026-W48-wed-3 shipped "0.6□ □ 7.8%"). We read the real character
//    table (cmap) out of the WOFF files the renderer loads, swap common maths
//    symbols for plain-text versions, and block anything still missing.
// 2. Brand check: the same rules X and Reddit use (src/content/brand-guard.ts).
// ---------------------------------------------------------------------------

/** Reads the set of code points a WOFF font can draw. */
function woffCodepoints(woff: Buffer): Set<number> {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') throw new Error('not a WOFF font');
  const numTables = woff.readUInt16BE(12);
  let cmap: Buffer | null = null;
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    if (woff.toString('ascii', e, e + 4) !== 'cmap') continue;
    const offset = woff.readUInt32BE(e + 4);
    const compLength = woff.readUInt32BE(e + 8);
    const origLength = woff.readUInt32BE(e + 12);
    const raw = woff.subarray(offset, offset + compLength);
    cmap = compLength < origLength ? zlib.inflateSync(raw) : raw;
  }
  if (!cmap) throw new Error('font has no cmap table');

  // Prefer the full-Unicode subtable (format 12), else the BMP one (format 4).
  const subtables: Array<{ format: number; at: number }> = [];
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const at = cmap.readUInt32BE(4 + i * 8 + 4);
    subtables.push({ format: cmap.readUInt16BE(at), at });
  }
  const pick = subtables.find((s) => s.format === 12) ?? subtables.find((s) => s.format === 4);
  if (!pick) throw new Error('font has no usable cmap subtable');

  const out = new Set<number>();
  const t = pick.at;
  if (pick.format === 12) {
    const groups = cmap.readUInt32BE(t + 12);
    for (let g = 0; g < groups; g++) {
      const start = cmap.readUInt32BE(t + 16 + g * 12);
      const end = cmap.readUInt32BE(t + 20 + g * 12);
      for (let c = start; c <= end; c++) out.add(c);
    }
    return out;
  }

  const segCount = cmap.readUInt16BE(t + 6) / 2;
  const endAt = t + 14;
  const startAt = endAt + segCount * 2 + 2;
  const deltaAt = startAt + segCount * 2;
  const rangeAt = deltaAt + segCount * 2;
  for (let s = 0; s < segCount; s++) {
    const end = cmap.readUInt16BE(endAt + s * 2);
    const start = cmap.readUInt16BE(startAt + s * 2);
    const delta = cmap.readInt16BE(deltaAt + s * 2);
    const rangeOffset = cmap.readUInt16BE(rangeAt + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        glyph = cmap.readUInt16BE(rangeAt + s * 2 + rangeOffset + (c - start) * 2);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
  return out;
}

let coverage: { body: Set<number>; mono: Set<number> } | null = null;

/** Characters every loaded weight can draw (body text), and the subset Mono can also draw (kickers). */
function fontCoverage() {
  if (coverage) return coverage;
  const sets = loadFonts().map((f) => ({ name: f.name, cps: woffCodepoints(f.data) }));
  const intersect = (list: Set<number>[]) => new Set([...list[0]].filter((c) => list.every((s) => s.has(c))));
  const body = intersect(sets.filter((s) => s.name !== 'Mono').map((s) => s.cps));
  const mono = intersect([body, ...sets.filter((s) => s.name === 'Mono').map((s) => s.cps)]);
  coverage = { body, mono };
  return coverage;
}

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
};

// Plain-text stand-ins for symbols the model likes to use in maths.
const REPLACEMENTS: Record<string, string> = {
  '≈': '~', '≃': '~', '∼': '~', '→': '->', '←': '<-', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=',
  '…': '...', '✓': '', '✔': '', '✗': 'x', '✘': 'x', '•': '-', '·': '-', '√': 'sqrt ', '∞': 'infinity',
};

/** Swaps characters the font can't draw for plain-text versions. Returns the new text and what changed. */
export function plainText(text: string, supported: Set<number>): { text: string; changes: string[] } {
  const changes: string[] = [];
  let out = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run) => {
    if ([...run].every((ch) => supported.has(ch.codePointAt(0)!))) return run;
    const plain = `^${[...run].map((ch) => SUPERSCRIPTS[ch]).join('')}`;
    changes.push(`"${run}" -> "${plain}"`);
    return plain;
  });
  out = [...out]
    .map((ch) => {
      const rep = REPLACEMENTS[ch];
      if (rep === undefined || supported.has(ch.codePointAt(0)!)) return ch;
      changes.push(`"${ch}" -> "${rep}"`);
      return rep;
    })
    .join('');
  return { text: out, changes };
}

function missingGlyphs(text: string, supported: Set<number>): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (ch === '\n') continue;
    if (!supported.has(ch.codePointAt(0)!)) missing.add(ch);
  }
  return [...missing];
}

type TextField = 'kicker' | 'title' | 'body' | 'stat';
const TEXT_FIELDS: TextField[] = ['kicker', 'title', 'body', 'stat'];

/** Returns a copy of the slide with unsupported symbols replaced. Used by the renderer. */
export function normalizeSlide(slide: Slide): Slide {
  const { body, mono } = fontCoverage();
  const copy: Slide = { ...slide, items: slide.items.map((i) => plainText(i, body).text) };
  for (const f of TEXT_FIELDS) copy[f] = plainText(slide[f], f === 'kicker' ? mono : body).text;
  return copy;
}

export interface PostQa {
  fixes: string[]; // symbols swapped for plain text (fine to publish)
  blocking: string[]; // must be fixed before publishing
}

/**
 * Checks a post. With fix=true the slides are edited in place (planning time),
 * otherwise fixes are only reported (the renderer applies them on the fly).
 */
export function qaPost(
  post: { slides: Slide[]; caption: string; altText?: string },
  opts: { fix?: boolean } = {},
): PostQa {
  const { body, mono } = fontCoverage();
  const fixes: string[] = [];
  const blocking: string[] = [];

  post.slides.forEach((slide, i) => {
    const where = `slide ${i + 1}`;
    const fields: Array<{ name: string; text: string; set: (v: string) => void; supported: Set<number> }> = [
      ...TEXT_FIELDS.map((f) => ({ name: f, text: slide[f], set: (v: string) => (slide[f] = v), supported: f === 'kicker' ? mono : body })),
      ...slide.items.map((text, j) => ({ name: `item ${j + 1}`, text, set: (v: string) => (slide.items[j] = v), supported: body })),
    ];
    for (const field of fields) {
      if (!field.text) continue;
      const { text, changes } = plainText(field.text, field.supported);
      if (changes.length) fixes.push(`${where} ${field.name}: ${changes.join(', ')}`);
      if (opts.fix) field.set(text);
      const missing = missingGlyphs(text, field.supported);
      if (missing.length) {
        blocking.push(`${where} ${field.name}: font can't draw ${missing.map((m) => `"${m}" (U+${m.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(', ')}`);
      }
    }
    const lint = lintCopy([slide.kicker, slide.title, slide.body, slide.stat, ...slide.items].join('\n'));
    for (const issue of lint) blocking.push(`${where}: ${issue}`);
  });

  for (const issue of lintCopy(post.caption)) blocking.push(`caption: ${issue}`);
  if (!/not financial advice/i.test(post.caption)) blocking.push('caption: missing "not financial advice" line');
  if (!post.altText?.trim()) blocking.push('missing alt text');

  return { fixes, blocking };
}
