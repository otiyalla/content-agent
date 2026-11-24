import fs from 'fs';
import path from 'path';
import { CALENDAR_DIR } from './calendar';

// Which week the weekly report was last sent for, so a late duplicate run doesn't send it again.
// Committed with the calendar by the workflow.
const FILE = path.join(path.dirname(CALENDAR_DIR), 'report-state.json');

export function reportSent(week: string): boolean {
  if (!fs.existsSync(FILE)) return false;
  return (JSON.parse(fs.readFileSync(FILE, 'utf8')) as { week?: string }).week === week;
}

export function markReportSent(week: string, at: Date): void {
  fs.writeFileSync(FILE, `${JSON.stringify({ week, sentAt: at.toISOString() }, null, 2)}\n`);
}
