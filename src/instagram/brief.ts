import { lintSaved } from '../content/claims-lint';
import type { Slot } from './calendar';

// ---------------------------------------------------------------------------
// A brief, pasted by the owner into the planner's notes (docs/RADAR-PILOT.md):
//
//   [brief:q07 slot:mon] Readers ask why risking 2% feels small but hurts. Angle: ...
//
// The id is opaque: the question itself lives in the owner's private log. Notes
// show up in public Action logs, so they are linted before anything runs.
// ---------------------------------------------------------------------------

export interface Brief {
  id: string;
  day: Slot['day'];
}

/** Throws if the notes must not be used. Returns null if they contain no brief. */
export function readBrief(notes: string | undefined, slots: Slot[]): Brief | null {
  if (!notes) return null;
  const problems = lintSaved(notes);
  if (problems.length) throw new Error(`The notes ${problems.join('; ')}. They are public: reword them in your own words and run again.`);
  const tags = notes.match(/\[brief:[^\]]*\]/gi) ?? [];
  if (!tags.length) return null;
  if (tags.length > 1) throw new Error('The notes have more than one brief. One a week, leading one post.');
  const m = /^\[brief:([a-z0-9-]{1,12})\s+slot:([a-z]{3})\]$/i.exec(tags[0]!);
  const day = m?.[2]?.toLowerCase();
  const slot = slots.find((s) => s.day === day);
  if (!m || !slot) throw new Error(`Write the brief as [brief:<id> slot:<${slots.map((s) => s.day).join('|')}>], with an id of up to 12 letters, digits or dashes.`);
  return { id: m[1]!.toLowerCase(), day: slot.day };
}

/** Replaces a saved planning field that would leak, and says why (without repeating the text). */
export function safeField(text: string, fallback: string): { text: string; problems: string[] } {
  const problems = lintSaved(text);
  return problems.length ? { text: fallback, problems } : { text, problems };
}
