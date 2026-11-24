import fs from 'fs';
import { env } from '../config/env';
import { tokenKind } from '../services/social/instagram.service';

// ---------------------------------------------------------------------------
// What business_discovery returns for a list of accounts (TRD section 4.3).
// Read-only. Prints counts only, never handles or captions.
//
//   npm run ig:fields -- ../handles.txt      # one handle per line; keep the file outside the repo
// ---------------------------------------------------------------------------

const FIELDS = ['caption', 'permalink', 'media_type', 'media_product_type', 'like_count', 'comments_count', 'view_count', 'reposts_count', 'total_like_count', 'total_comments_count', 'children'];
const USAGE_STOP = 40;

async function get(fields: string): Promise<{ body: Record<string, any>; usage: number }> {
  const u = new URL(`https://${tokenKind() === 'facebook' ? 'graph.facebook.com' : 'graph.instagram.com'}/${env.IG_GRAPH_VERSION}/${env.IG_USER_ID}`);
  u.searchParams.set('fields', fields);
  u.searchParams.set('access_token', env.IG_ACCESS_TOKEN!);
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  const headers = [res.headers.get('x-app-usage') ?? '', res.headers.get('x-business-use-case-usage') ?? ''].join(' ');
  const usage = Math.max(0, ...[...headers.matchAll(/"(?:call_count|total_time|total_cputime)":(\d+)/g)].map((m) => Number(m[1])));
  return { body: (await res.json()) as Record<string, any>, usage };
}

async function main() {
  const file = process.argv[2];
  if (!file || !env.IG_USER_ID || !env.IG_ACCESS_TOKEN) throw new Error('usage: npm run ig:fields -- <file with one handle per line> (needs IG_USER_ID and IG_ACCESS_TOKEN)');
  const handles = fs.readFileSync(file, 'utf8').split('\n').map((h) => h.trim().replace(/^@/, '')).filter((h) => /^[a-z0-9._]+$/i.test(h));
  const count: Record<string, number> = {};
  const bump = (k: string, by = 1) => (count[k] = (count[k] ?? 0) + by);
  let posts = 0;
  let usage = 0;
  let read = 0;
  const hidden: number[] = [];
  for (const h of handles) {
    if (usage >= USAGE_STOP) {
      console.warn(`Stopped at ${usage}% API usage after ${read} account(s)`);
      break;
    }
    const r = await get(`business_discovery.username(${h}){biography,website,followers_count,media.limit(50){id,timestamp,${FIELDS.map((f) => (f === 'children' ? 'children{media_type}' : f)).join(',')}}}`);
    usage = r.usage;
    const bd = r.body.business_discovery;
    if (!bd) {
      bump(`unavailable (error ${r.body.error?.code ?? '?'})`);
      continue;
    }
    read++;
    if (bd.biography !== undefined) bump('accounts with biography');
    if (bd.website !== undefined) bump('accounts with website');
    const media: Array<Record<string, any>> = bd.media?.data ?? [];
    posts += media.length;
    for (const m of media) {
      for (const f of FIELDS) if (m[f] !== undefined) bump(`posts with ${f}`);
      if (/@\w/.test(m.caption ?? '')) bump('captions with an @mention');
      if (m.media_product_type === 'REELS') {
        bump('reels');
        if (m.view_count !== undefined) bump('reels with view_count');
      }
      if ((m.total_like_count ?? m.like_count) !== m.like_count) bump('posts where total_like_count differs');
    }
    if (media.length) hidden.push(media.filter((m) => m.like_count === undefined).length / media.length);
    // Media comes newest first unless pinned posts lead.
    if (media.some((m, i) => i > 0 && Date.parse(m.timestamp) > Date.parse(media[i - 1].timestamp))) bump('accounts with posts out of date order');
  }
  console.log(`${handles.length} handle(s), ${read} readable, ${posts} posts, API usage now ${usage}%`);
  for (const k of Object.keys(count).sort()) console.log(`  ${k}: ${count[k]}`);
  console.log(`  accounts hiding over 20% of likes: ${hidden.filter((x) => x > 0.2).length} of ${hidden.length}`);
}

main().catch((err) => {
  // Never print the request: its URL holds the token.
  console.error(`❌ ${err instanceof Error ? err.message.replace(/access_token=[^&\s]+/g, 'access_token=***') : 'failed'}`);
  process.exit(1);
});
