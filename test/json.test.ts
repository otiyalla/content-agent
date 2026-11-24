import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractList, extractObject } from '../src/services/json';

type A = { a: number };
const isA = (v: unknown): v is A => typeof (v as A | null)?.a === 'number';
const list = (t: string) => extractList(t, 'items', isA);

test('lists of 0, 1 and 2 objects, bare or wrapped', () => {
  for (const items of [[], [{ a: 1 }], [{ a: 1 }, { a: 2 }]]) {
    assert.deepEqual(list(JSON.stringify(items)), items);
    assert.deepEqual(list(JSON.stringify({ items })), items);
    assert.deepEqual(list(`Here you go:\n\`\`\`json\n${JSON.stringify({ items }, null, 2)}\n\`\`\`\nDone.`), items);
  }
});

test('a single item object counts as a list of one', () => assert.deepEqual(list('{"a": 1}'), [{ a: 1 }]));

test('prose brackets before the JSON are skipped', () => {
  assert.deepEqual(list('Sure [see below] {not json} [{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
});

test('brackets and escaped quotes inside strings', () => {
  const s = (v: unknown): v is string => typeof v === 'string';
  assert.deepEqual(extractList('["a ] \\" }", "b"] trailing', 'q', s), ['a ] " }', 'b']);
});

test('truncated or missing JSON gives the fallback, and bad items are dropped', () => {
  assert.deepEqual(list('[{"a":1},{"a":'), [{ a: 1 }]); // the complete item survives
  assert.deepEqual(list('no json'), []);
  assert.deepEqual(list('[{"a":1},{"b":2}]'), [{ a: 1 }]);
  assert.deepEqual(extractObject('[1,2]', { x: 1 }), { x: 1 });
  assert.deepEqual(extractObject('ok {"x": {"y": 2}} bye', {}), { x: { y: 2 } });
});
