import { execFileSync } from 'child_process';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Commits what a run recorded under content/instagram and pushes it.
//
// The record that a post went out must never be lost: without it the next run
// could publish the post again. If someone pushed an edit to the same lines
// while the run was going, git can't rebase, so the JSON is merged field by
// field instead: the run wins on what it recorded, the person on everything else.
//
//   npx ts-node src/workflows/commit-state.ts <job type> <branch>
// ---------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

const RUN_FIELDS = new Set([
  'attempts',
  'lastError',
  'published',
  'previewHash',
  'previewRenderHash',
  'previewedAt',
  'insights',
  'insightSnapshots',
]);
const MAX_TRIES = 5;

const isObj = (v: Json | undefined): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** "id" or "date" if every entry of every list has one, so the lists can be merged entry by entry. */
function listKey(...lists: Array<Json | undefined>): string | null {
  const items = lists.flatMap((l) => (Array.isArray(l) ? l : []));
  for (const k of ['id', 'date']) if (items.length && items.every((i) => isObj(i) && typeof i[k] === 'string')) return k;
  return null;
}

/** Three-way merge. `run` is what this run wrote, `remote` is what someone else pushed meanwhile. */
export function mergeJson(base: Json | undefined, run: Json | undefined, remote: Json | undefined, field = ''): Json | undefined {
  if (same(run, remote) || same(base, remote)) return run;
  if (same(base, run)) return remote;
  // Both changed. A post that went out is published whatever anyone else wrote.
  if (field === 'status') return run === 'published' ? run : remote;
  if (RUN_FIELDS.has(field)) return run;
  if (isObj(run) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Obj = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(run)])) {
      const v = mergeJson(b[k], run[k], remote[k], k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(run) && Array.isArray(remote)) {
    const key = listKey(base, run, remote);
    if (!key) return remote;
    const find = (l: Json | undefined, id: Json) => (Array.isArray(l) ? (l as Obj[]).find((i) => i[key] === id) : undefined);
    const ids = new Set([...(remote as Obj[]), ...(run as Obj[])].map((i) => i[key]));
    return [...ids].flatMap((id) => {
      const merged = mergeJson(find(base, id), find(run, id), find(remote, id), key);
      return merged === undefined ? [] : [merged];
    });
  }
  // One side deleted it: keep whichever still exists.
  return remote ?? run;
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const tryGit = (...args: string[]): boolean => {
  try {
    git(...args);
    return true;
  } catch (err) {
    console.log(`git ${args[0]}: ${String((err as { stderr?: string }).stderr ?? err).trim()}`);
    return false;
  }
};
const show = (rev: string, file: string): Json | undefined => {
  if (!git('ls-tree', '--name-only', rev, '--', file).trim()) return undefined;
  return JSON.parse(git('show', `${rev}:${file}`)) as Json;
};

function main() {
  const [job = 'update', branch = 'main'] = process.argv.slice(2);
  git('add', 'content/instagram');
  if (!git('diff', '--cached', '--name-only').trim()) return console.log('No calendar changes');
  const message = `chore(instagram): ${job} ${new Date().toISOString().slice(0, 16)}Z`;
  git('commit', '-m', message);

  for (let i = 1; i <= MAX_TRIES; i++) {
    git('fetch', 'origin', branch);
    if (!tryGit('rebase', 'FETCH_HEAD')) {
      tryGit('rebase', '--abort');
      console.log('Someone edited the same lines; merging field by field.');
      const remote = git('rev-parse', 'FETCH_HEAD').trim();
      const run = git('rev-parse', 'HEAD').trim();
      const merged = git('diff', '--name-only', `${run}~1`, run)
        .trim()
        .split('\n')
        .map((file) => ({ file, value: mergeJson(show(`${run}~1`, file), show(run, file), show(remote, file)) }));
      git('reset', '--hard', remote);
      for (const { file, value } of merged) if (value !== undefined) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
      git('add', 'content/instagram');
      if (!git('diff', '--cached', '--name-only').trim()) return console.log('Already up to date');
      git('commit', '-m', message);
    }
    if (tryGit('push', 'origin', `HEAD:${branch}`)) return console.log('Calendar saved');
  }
  throw new Error(`Could not push the calendar after ${MAX_TRIES} tries. Check what was published before the next run.`);
}

if (require.main === module) main();
