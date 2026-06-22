import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { captureSession } from '../../src/import/capture.js';

// Mock the AI extractor so no network call happens.
vi.mock('../../src/import/decision-extractor.js', () => ({
  extractDecisions: vi.fn().mockResolvedValue({
    summary: 'Switched logging to pino',
    decisions: [{
      title: 'Use pino for logging',
      context: 'console.log was unstructured',
      decision: 'Adopt pino with JSON transport',
      rationale: 'Structured logs, low overhead',
      alternatives: ['winston'],
      consequences: 'Log shippers must parse JSON',
      tags: ['logging'],
      files: ['src/log.ts'],
    }],
  }),
  resetClient: vi.fn(),
}));

describe('captureSession', () => {
  let tmpDir: string;
  let db: Database.Database;
  let transcriptPath: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-capture-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));

    transcriptPath = path.join(tmpDir, 'sess-capture-1.jsonl');
    const records = [
      JSON.stringify({
        type: 'user', sessionId: 'sess-capture-1',
        timestamp: '2026-03-01T10:00:00.000Z',
        cwd: '/Users/tom/proj', gitBranch: 'feat/logging', version: '2.1.0',
        message: { role: 'user', content: [{ type: 'text', text: 'Replace console.log with a real logger' }] },
      }),
      JSON.stringify({
        type: 'assistant', sessionId: 'sess-capture-1',
        timestamp: '2026-03-01T10:05:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Switching to pino.' }] },
      }),
    ];
    fs.writeFileSync(transcriptPath, records.join('\n'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('captures a new session and extracts decisions', async () => {
    const result = await captureSession({ db, transcriptPath, apiKey: 'test-key' });

    expect(result.status).toBe('captured');
    expect(result.sessionId).toBe('sess-capture-1');
    expect(result.decisionsExtracted).toBe(1);

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('sess-capture-1') as any;
    expect(session.source).toBe('hook');
    expect(session.git_branch).toBe('feat/logging');
    expect(session.decision_count).toBe(1);

    const decision = db.prepare('SELECT * FROM decisions WHERE session_id = ?').get('sess-capture-1') as any;
    expect(decision.title).toBe('Use pino for logging');
    expect(decision.created_by).toBe('haiku-capture');
  });

  it('skips a session that is already captured', async () => {
    await captureSession({ db, transcriptPath, apiKey: 'test-key' });
    const second = await captureSession({ db, transcriptPath, apiKey: 'test-key' });

    expect(second.status).toBe('skipped');
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) as c FROM decisions').get() as any).toEqual({ c: 1 });
  });

  it('stores metadata only when extraction is skipped', async () => {
    const result = await captureSession({ db, transcriptPath, skipExtraction: true });

    expect(result.status).toBe('captured');
    expect(result.decisionsExtracted).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM decisions').get() as any).toEqual({ c: 0 });
  });
});
