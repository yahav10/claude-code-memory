import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { runImportPipeline, type ImportProgress } from '../../src/import/pipeline.js';

// Mock the AI extractor
vi.mock('../../src/import/decision-extractor.js', () => ({
  extractDecisions: vi.fn().mockResolvedValue({
    summary: 'User refactored authentication',
    decisions: [{
      title: 'Use JWT for auth',
      context: 'Need stateless auth',
      decision: 'Implement JWT with RS256',
      rationale: 'Scales better than sessions',
      alternatives: ['Session cookies'],
      consequences: 'Must handle token refresh',
      tags: ['auth', 'jwt'],
      files: ['src/auth.ts'],
    }],
  }),
  resetClient: vi.fn(),
}));

describe('Import Pipeline', () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;
  let projectsDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-pipeline-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = initDatabase(dbPath);

    // Create fake ~/.claude/projects/ structure
    projectsDir = path.join(tmpDir, 'projects');
    const projDir = path.join(projectsDir, '-Users-tom-my-project');
    fs.mkdirSync(projDir, { recursive: true });

    const records = [
      JSON.stringify({
        type: 'user', sessionId: 'sess-pipe-1',
        timestamp: '2026-02-01T10:00:00.000Z',
        cwd: '/Users/tom/my-project', gitBranch: 'main', version: '2.1.0',
        message: { role: 'user', content: [{ type: 'text', text: 'Refactor auth module' }] },
      }),
      JSON.stringify({
        type: 'assistant', sessionId: 'sess-pipe-1',
        timestamp: '2026-02-01T10:05:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'I will switch to JWT.' }] },
      }),
    ];
    fs.writeFileSync(path.join(projDir, 'sess-pipe-1.jsonl'), records.join('\n'));
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports sessions and extracts decisions end-to-end', async () => {
    const progress: ImportProgress[] = [];

    await runImportPipeline({
      db,
      projectsDir,
      onProgress: (p) => progress.push(p),
    });

    // Check session was inserted
    const sessions = db.prepare('SELECT * FROM sessions').all() as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('sess-pipe-1');
    expect(sessions[0].project_path).toBe('/Users/tom/my-project');
    expect(sessions[0].source).toBe('imported');
    expect(sessions[0].summary).toBe('User refactored authentication');

    // Check decision was inserted
    const decisions = db.prepare('SELECT * FROM decisions').all() as any[];
    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toBe('Use JWT for auth');
    expect(decisions[0].session_id).toBe('sess-pipe-1');

    // Check progress events were emitted
    expect(progress.some(p => p.phase === 'scan')).toBe(true);
    expect(progress.some(p => p.phase === 'metadata')).toBe(true);
    expect(progress.some(p => p.phase === 'extraction')).toBe(true);
    expect(progress.some(p => p.phase === 'done')).toBe(true);
  });

  it('skips already-imported sessions on re-run', async () => {
    const progress: ImportProgress[] = [];

    await runImportPipeline({
      db,
      projectsDir,
      onProgress: (p) => progress.push(p),
    });

    // Should still have just 1 session and 1 decision
    const sessions = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any;
    expect(sessions.c).toBe(1);

    const doneEvent = progress.find(p => p.phase === 'done');
    expect(doneEvent!.sessionsImported).toBe(0);
  });
});
