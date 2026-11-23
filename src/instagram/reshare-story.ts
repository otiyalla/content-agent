import fs from 'fs';
import path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { COLORS, HANDLE, Z_MARK_DATA_URI, loadFonts } from './brand';

// ---------------------------------------------------------------------------
// Renders a 1080x1920 Story that points at a feed post, from the post's cover
// slide. The API can't do the app's "Add post to story" reshare, so this is the
// stand-in for the Start here / Risk maths Highlights.
//
//   npm run ig:reshare -- <cover.jpg> <out.jpg> [kicker]
//   then: npm run ig:story -- <out.jpg> --now
// ---------------------------------------------------------------------------

const STORY = { width: 1080, height: 1920 } as const;
const SLIDE = { width: 936, height: 1170 } as const; // 4:5 feed slide, scaled to fit with margins

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El => ({
  type,
  props: { style: type === 'img' ? style : { display: 'flex', ...style }, children, ...extra },
});

export async function renderReshareStory(coverJpg: Buffer, kicker: string): Promise<Buffer> {
  const src = `data:image/jpeg;base64,${coverJpg.toString('base64')}`;
  const el = h(
    'div',
    {
      width: STORY.width,
      height: STORY.height,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 56,
      fontFamily: 'Jakarta',
      color: COLORS.text,
      backgroundImage: `linear-gradient(165deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
    },
    [
      h('div', { width: SLIDE.width, justifyContent: 'space-between', alignItems: 'center' }, [
        h('div', { alignItems: 'center', gap: 16 }, [
          h('img', { width: 56, height: 56 }, undefined, { src: Z_MARK_DATA_URI, width: 56, height: 56 }),
          h('div', { fontSize: 38, fontWeight: 800 }, 'zenlot'),
        ]),
        h('div', { fontSize: 30, fontWeight: 800, letterSpacing: 4, color: COLORS.orange }, kicker.toUpperCase()),
      ]),
      h('img', { width: SLIDE.width, height: SLIDE.height, borderRadius: 28, border: '2px solid rgba(255,255,255,0.08)' }, undefined, {
        src,
        width: SLIDE.width,
        height: SLIDE.height,
      }),
      h('div', { fontSize: 38, fontWeight: 700, color: COLORS.muted }, [
        h('div', {}, 'Full post on our profile · '),
        h('div', { color: COLORS.teal }, HANDLE),
      ]),
    ],
  );
  const svg = await satori(el as unknown as Parameters<typeof satori>[0], { ...STORY, fonts: loadFonts() });
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: STORY.width } }).render();
  return Buffer.from(jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, 92).data);
}

if (require.main === module) {
  const [cover, out, kicker = 'New post'] = process.argv.slice(2);
  if (!cover || !out) {
    console.error('Usage: npm run ig:reshare -- <cover.jpg> <out.jpg> [kicker]');
    process.exit(1);
  }
  renderReshareStory(fs.readFileSync(cover), kicker)
    .then((buf) => {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      console.log(`Rendered ${out}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
