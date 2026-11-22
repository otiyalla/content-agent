import fs from 'fs';
import path from 'path';
import { renderPost } from '../instagram/renderer';
import { SAMPLE_POSTS } from '../instagram/fixtures/sample-week';
import { loadCalendar } from '../instagram/calendar';

// Renders a week to ./out/instagram/<week>/ for local review — no network, no
// LLM. With no argument it renders the built-in sample week; pass a week id
// (e.g. 2026-W48) to render a saved calendar.
//
//   npm run ig:preview
//   npm run ig:preview -- 2026-W48

async function main() {
  const week = process.argv[2];
  const posts = week
    ? (loadCalendar(week)?.posts ?? []).map((p) => ({ id: p.id, slides: p.slides }))
    : SAMPLE_POSTS.map((p, i) => ({ id: `sample-${i}-${p.pillar}`, slides: p.slides }));

  if (posts.length === 0) {
    console.error(`No posts found for ${week}`);
    process.exit(1);
  }

  const outDir = path.join('out', 'instagram', week ?? 'sample');
  fs.mkdirSync(outDir, { recursive: true });

  for (const post of posts) {
    const images = await renderPost(post.slides);
    images.forEach((img, i) => fs.writeFileSync(path.join(outDir, `${post.id}-${i + 1}.jpg`), img));
    console.log(`Rendered ${post.id} (${images.length} slide${images.length > 1 ? 's' : ''})`);
  }
  console.log(`\n✅ Images written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
