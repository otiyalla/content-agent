// ---------------------------------------------------------------------------
// Reading JSON out of a model's reply.
//
// Models wrap JSON in prose or code fences, and OpenAI's and Grok's JSON mode
// can only return an object, never a bare list. So prompts that want a list ask
// for {"key": [...]}, and extractList() also accepts a bare list or one item.
// ---------------------------------------------------------------------------

/** The end (exclusive) of the bracketed value starting at `start`, or -1. Ignores brackets inside strings. */
function endOfValue(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i + 1;
    }
  }
  return -1;
}

const tryParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/** The first JSON object or list in the text that satisfies `accept`, or undefined. */
export function extractJson(text: string, accept: (v: unknown) => boolean = () => true): unknown {
  const whole = tryParse(text.trim());
  if (typeof whole === 'object' && whole !== null && accept(whole)) return whole;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{' && text[i] !== '[') continue;
    const end = endOfValue(text, i);
    if (end < 0) continue;
    const value = tryParse(text.slice(i, end));
    if (value === undefined) continue;
    if (accept(value)) return value;
    i = end - 1; // never pick pieces out of a value that was rejected whole
  }
  return undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An object, or `fallback` if the text has none. */
export function extractObject<T>(text: string, fallback: T): T {
  const v = extractJson(text, isObject);
  return v === undefined ? fallback : (v as T);
}

/** The items of a list reply: {"key": [...]}, a bare [...], or a single item object. Invalid items are dropped. */
export function extractList<T>(text: string, key: string, isItem: (v: unknown) => v is T): T[] {
  const v = extractJson(text, (c) => Array.isArray(c) ? c.length === 0 || c.some(isItem) : isObject(c) && (Array.isArray(c[key]) || isItem(c)));
  if (v === undefined) return [];
  const items = Array.isArray(v) ? v : isObject(v) && Array.isArray(v[key]) ? (v[key] as unknown[]) : [v];
  return items.filter(isItem);
}
