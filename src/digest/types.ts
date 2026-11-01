export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  first: string;
  last: string;
};

export type Night = {
  night: string;
  rows: DigestRow[];
  // Log lines per status, across all jobs.
  counts: Record<RunStatus, number>;
  badLines: number;
};

// Reads runs/<night>.jsonl. Rows are sorted by job. Lines that don't parse are counted in
// `badLines`, never thrown. Returns null when the night has no file.
export type ReadNight = (runsDir: string, night: string) => Night | null;
