import fs from 'fs';
import path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { COLORS, HANDLE, Z_MARK_DATA_URI, loadFonts } from './brand';
import { ZENLOT_LINKS } from '../config/zenlot';

// ---------------------------------------------------------------------------
// One-off images for the Instagram profile (docs/PROFILE.md): the "Stay safe"
// Story that goes in the Safety Highlight, and three Highlight covers.
// Instagram's API can't edit the profile or Highlights, so these are added by
// hand in the app.
//
//   npm run ig:profile-assets   → out/instagram/profile/*.jpg
// ---------------------------------------------------------------------------

const STORY = { width: 1080, height: 1920 } as const;
type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El => ({
  type,
  props: { style: type === 'img' ? style : { display: 'flex', ...style }, children, ...extra },
});
const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const ICONS = {
  shield: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" fill="none" stroke="${COLORS.teal}" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6" fill="none" stroke="${COLORS.teal}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  start: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 21V4M6 4h10l-2 3.5 2 3.5H6" fill="none" stroke="${COLORS.teal}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  maths: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 20h16M6 16l4-5 3 3 5-7" fill="none" stroke="${COLORS.teal}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="7" r="1.4" fill="${COLORS.teal}"/></svg>`),
};

function background(children: unknown): El {
  return h(
    'div',
    {
      width: STORY.width,
      height: STORY.height,
      flexDirection: 'column',
      fontFamily: 'Jakarta',
      color: COLORS.text,
      backgroundImage: `linear-gradient(165deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
    },
    children,
  );
}

function safetyStory(): El {
  const line = (text: string) => h('div', { fontSize: 44, fontWeight: 500, lineHeight: 1.4, color: COLORS.muted }, text);
  return background([
    h('div', { flexDirection: 'column', padding: '200px 96px 0', gap: 56, flexGrow: 1 }, [
      h('div', { alignItems: 'center', gap: 20 }, [
        h('img', { width: 72, height: 72 }, undefined, { src: Z_MARK_DATA_URI, width: 72, height: 72 }),
        h('div', { fontSize: 44, fontWeight: 800 }, 'zenlot'),
      ]),
      h('div', { fontSize: 34, fontWeight: 800, letterSpacing: 5, color: COLORS.orange }, 'STAY SAFE'),
      h('div', { fontSize: 112, fontWeight: 800, lineHeight: 1.05, letterSpacing: -3 }, 'We never DM you for money.'),
      h('div', { flexDirection: 'column', gap: 28 }, [
        line('Zenlot will never message you asking for deposits, passwords, account access, or to sell trading "signals".'),
        line(`Our only Instagram account is ${HANDLE}.`),
        line('If an account copies us, report it and block it.'),
      ]),
    ]),
    h('div', { justifyContent: 'space-between', padding: '0 96px 160px', fontSize: 36, fontWeight: 700, color: COLORS.muted }, [
      h('div', {}, HANDLE),
      h('div', { color: COLORS.teal }, ZENLOT_LINKS.instagramBio.replace(/^https:\/\//, '')),
    ]),
  ]);
}

/** Highlight covers are shown cropped to a circle from the centre, so everything sits in the middle. */
function cover(icon: string): El {
  return background(
    h('div', { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }, [
      h('div', { width: 520, height: 520, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(45,212,191,0.08)', border: '4px solid rgba(45,212,191,0.35)' }, [
        h('img', { width: 300, height: 300 }, undefined, { src: icon, width: 300, height: 300 }),
      ]),
    ]),
  );
}

async function render(el: El): Promise<Buffer> {
  const svg = await satori(el as unknown as Parameters<typeof satori>[0], { ...STORY, fonts: loadFonts() });
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: STORY.width } }).render();
  return jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, 92).data;
}

async function main() {
  const dir = path.join('out', 'instagram', 'profile');
  fs.mkdirSync(dir, { recursive: true });
  const files: Array<[string, El]> = [
    ['story-stay-safe.jpg', safetyStory()],
    ['cover-start-here.jpg', cover(ICONS.start)],
    ['cover-risk-maths.jpg', cover(ICONS.maths)],
    ['cover-safety.jpg', cover(ICONS.shield)],
  ];
  for (const [name, el] of files) {
    fs.writeFileSync(path.join(dir, name), await render(el));
    console.log(`Rendered ${path.join(dir, name)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
