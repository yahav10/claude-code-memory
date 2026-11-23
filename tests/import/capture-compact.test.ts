import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { captureFromSummary, captureSession } from '../../src/import/capture.js';

const extracted = {
  summary: 'Chose Redis',
  decisions: [{
    title: 'Use Redis for caching',
    context: 'Sessions must be shared across pods',
    decision: 'Use Redis as the shared cache',
    rationale: 'Pods are stateless',
    alternatives: ['In-memory cache'],
    consequences: 'Adds an infra dependency',
    tags: ['cache'],
    files: ['src/cache.ts'],
  }],
};

vi.mock('../../src/import/decision-extractor.js', () => ({
  extractDecisions: vi.fn(async () => extracted),
  resetClient: vi.fn(),
}));

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-compact-')));
  db = initDatabase(path.join(tmpDir, 'test.db'));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const decisionCount = () => (db.prepare('SELECT COUNT(*) AS n FROM decisions').get() as { n: number }).n;

describe('captureFromSummary', () => {
  it('stores decisions from a compaction summary and leaves the session open', async () => {
    const res = await captureFromSummary({ db, sessionId: 's1', summary: 'We chose Redis for the cache.', cwd: '/p', apiKey: 'k' });
    expect(res.decisionsExtracted).toBe(1);
    const row = db.prepare('SELECT ended_at, source, decision_count, project_path FROM sessions WHERE id = ?').get('s1') as any;
    expect(row).toEqual({ ended_at: null, source: 'hook', decision_count: 1, project_path: '/p' });
    expect(db.prepare('SELECT created_by FROM decisions').get()).toEqual({ created_by: 'haiku-compact' });
  });

  it('skips a decision that restates an existing active one', async () => {
    await captureFromSummary({ db, sessionId: 's1', summary: 'first', apiKey: 'k' });
    const again = await captureFromSummary({ db, sessionId: 's1', summary: 'second compaction, same decision', apiKey: 'k' });
    expect(again.decisionsExtracted).toBe(0);
    expect(decisionCount()).toBe(1);
  });

  it('does nothing without an API key or summary', async () => {
    expect((await captureFromSummary({ db, sessionId: 's1', summary: 'x' })).decisionsExtracted).toBe(0);
    expect((await captureFromSummary({ db, sessionId: 's1', summary: '  ', apiKey: 'k' })).decisionsExtracted).toBe(0);
    expect(decisionCount()).toBe(0);
  });
});

describe('SessionEnd capture after a compaction capture', () => {
  it('completes the open session instead of skipping it, without duplicating decisions', async () => {
    await captureFromSummary({ db, sessionId: 'sess-x', summary: 'We chose Redis.', apiKey: 'k' });

    const transcript = path.join(tmpDir, 'sess-x.jsonl');
    fs.writeFileSync(transcript, [
      { type: 'user', sessionId: 'sess-x', timestamp: '2026-11-01T10:00:00.000Z', cwd: '/p', gitBranch: 'main',
        message: { role: 'user', content: 'Add a cache' } },
      { type: 'assistant', sessionId: 'sess-x', timestamp: '2026-11-01T10:05:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Using Redis.' }] } },
    ].map(r => JSON.stringify(r)).join('\n'));

    const result = await captureSession({ db, transcriptPath: transcript, apiKey: 'k' });
    expect(result.status).toBe('captured');
    expect(result.decisionsExtracted).toBe(0); // same decision already stored at compaction
    expect(decisionCount()).toBe(1);

    const row = db.prepare('SELECT ended_at, summary, message_count FROM sessions WHERE id = ?').get('sess-x') as any;
    expect(row.ended_at).toBe('2026-11-01T10:05:00.000Z');
    expect(row.summary).toBe('Chose Redis'); // extractor summary, not overwritten by the first prompt
    expect(row.message_count).toBe(2);

    // And a second SessionEnd is a no-op.
    expect((await captureSession({ db, transcriptPath: transcript, apiKey: 'k' })).status).toBe('skipped');
  });
});
