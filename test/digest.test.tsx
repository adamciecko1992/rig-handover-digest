import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// A temp runs dir: runs/ is read-only.
const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

const log = [
  '{"at":"2026-01-01T01:00:00+01:00","job":"b/job","status":"ok","owner":"rook"}',
  '{"at":"2026-01-01T02:00:00+01:00","job":"a/job","status":"fail","owner":null,"error":"boom"}',
  '{"at":"2026-01-01T03:00:00+01:00","job":"b/job","status":"retry","owner":"rook","error":"lock held"}',
  'this line is not json',
].join('\n');

beforeAll(() => {
  writeFileSync(join(runsDir, '2026-01-01.jsonl'), log);
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');
  writeFileSync(join(runsDir, '2026-01-03.jsonl'), `${log}\n`);
});

const app = createApp(config);

describe('GET /digest/:night', () => {
  it('renders the rows sorted by job, with the fail marked and a missing owner as —', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('a/job')).toBeLessThan(html.indexOf('b/job'));
    expect(html).toContain('fail (!)');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('boom');
  });

  it('is 404 for a night with no file', async () => {
    expect((await app.request('/digest/1999-01-01')).status).toBe(404);
  });

  it('is 404 for a night that is not a plain date', async () => {
    expect((await app.request('/digest/..%2Fpackage')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('renders the night and notes the bad line', async () => {
    const html = await (await app.request('/digest/2026-01-03')).text();
    expect(html).toContain('a/job');
    expect(html).toContain('1 unreadable line(s) skipped');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows as JSON', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    const body = (await res.json()) as { rows: { job: string; owner: string | null }[]; badLines: number };
    expect(res.status).toBe(200);
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
    expect(body.rows[0]?.owner).toBeNull();
    expect(body.badLines).toBe(1);
  });

  it('is 404 for a night with no file', async () => {
    expect((await app.request('/api/digest/1999-01-01')).status).toBe(404);
  });

  it('returns no rows for an empty night', async () => {
    const body = (await (await app.request('/api/digest/2026-01-02')).json()) as { rows: unknown[] };
    expect(body.rows).toEqual([]);
  });

  it('lists the same jobs in the same order as the page', async () => {
    const json = (await (await app.request('/api/digest/2026-01-03')).json()) as { rows: { job: string }[] };
    const html = await (await app.request('/digest/2026-01-03')).text();
    const inPage = [...html.matchAll(/<td>([a-z]\/job)<\/td>/g)].map((m) => m[1]);
    expect(json.rows.map((r) => r.job)).toEqual(inPage);
  });
});

describe('status board', () => {
  it('links the night to its digest with counts', async () => {
    const html = await (await app.request('/')).text();
    expect(html).toContain('href="/digest/2026-01-01"');
    expect(html).toContain('ok 1 · retry 1 · fail 1');
  });
});
