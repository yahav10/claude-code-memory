import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanForSessions, type ScanResult } from '../../src/import/scanner.js';

describe('Session Scanner', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-scan-'));

    // Simulate ~/.claude/projects/ structure
    const proj1 = path.join(tmpDir, '-Users-tom-project-alpha');
    const proj2 = path.join(tmpDir, '-Users-tom-project-beta');
    fs.mkdirSync(proj1, { recursive: true });
    fs.mkdirSync(proj2, { recursive: true });

    // Create sample JSONL files
    const userRecord = (sessionId: string) => JSON.stringify({
      type: 'user',
      sessionId,
      timestamp: '2026-01-01T00:00:00.000Z',
      cwd: '/tmp',
      gitBranch: 'main',
      version: '2.0.0',
      message: { role: 'user', content: [{ type: 'text', text: 'test' }] },
    });

    fs.writeFileSync(path.join(proj1, 'sess-1.jsonl'), userRecord('sess-1'));
    fs.writeFileSync(path.join(proj1, 'sess-2.jsonl'), userRecord('sess-2'));
    fs.writeFileSync(path.join(proj2, 'sess-3.jsonl'), userRecord('sess-3'));

    // Non-JSONL file should be ignored
    fs.writeFileSync(path.join(proj1, 'notes.txt'), 'not a session');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers all JSONL files across projects', async () => {
    const result = await scanForSessions(tmpDir, new Set());
    expect(result.totalFound).toBe(3);
    expect(result.newSessions).toBe(3);
    expect(result.alreadyImported).toBe(0);
    expect(result.files.length).toBe(3);
  });

  it('excludes already-imported session IDs', async () => {
    const imported = new Set(['sess-1', 'sess-3']);
    const result = await scanForSessions(tmpDir, imported);
    expect(result.totalFound).toBe(3);
    expect(result.newSessions).toBe(1);
    expect(result.alreadyImported).toBe(2);
    expect(result.files.length).toBe(1);
    expect(result.files[0].sessionId).toBe('sess-2');
  });

  it('returns project breakdown', async () => {
    const result = await scanForSessions(tmpDir, new Set());
    expect(result.projects.length).toBe(2);
    const p1 = result.projects.find(p => p.dirName.includes('alpha'));
    expect(p1!.sessionCount).toBe(2);
  });
});
