import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type Entry = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const statuses: readonly string[] = ['ok', 'retry', 'fail'];

// Parse one log line at the edge; anything off-shape is a bad line.
function parseLine(line: string): Entry | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (typeof o.status !== 'string' || !statuses.includes(o.status)) return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const e = parseLine(line);
    if (!e) {
      badLines++;
      continue;
    }
    const row = rows.get(e.job);
    if (!row) {
      rows.set(e.job, {
        job: e.job,
        owner: e.owner,
        runs: 1,
        retries: e.status === 'retry' ? 1 : 0,
        lastStatus: e.status,
        lastError: e.error,
        first: e.at,
        last: e.at,
      });
      continue;
    }
    row.runs++;
    if (e.status === 'retry') row.retries++;
    row.lastStatus = e.status;
    row.last = e.at;
    if (e.error !== null) row.lastError = e.error;
    if (e.owner !== null) row.owner = e.owner;
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines } satisfies Night;
};
