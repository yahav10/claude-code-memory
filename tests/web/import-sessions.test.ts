import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { FastifyInstance } from 'fastify';
import { initDatabase } from '../../src/database.js';
import { buildApp } from '../../src/web/server.js';

// Mock the decision extractor
vi.mock('../../src/import/decision-extractor.js', () => ({
  extractDecisions: vi.fn().mockResolvedValue({
    summary: 'Test session summary',
    decisions: [{
      title: 'Test decision',
      context: 'ctx', decision: 'dec', rationale: 'rat',
      alternatives: [], consequences: 'cons',
      tags: ['test'], files: [],
    }],
  }),
  resetClient: vi.fn(),
}));

describe('Import Sessions API', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let projectsDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-api-import-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);

    // Create fake projects dir with one session
    projectsDir = path.join(tmpDir, 'projects');
    const projDir = path.join(projectsDir, '-Users-tom-proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'sess-api-1.jsonl'), JSON.stringify({
      type: 'user', sessionId: 'sess-api-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      cwd: '/tmp/proj', gitBranch: 'main', version: '2.0.0',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    }));

    // Set env for the route to find projects dir
    process.env.CCM_PROJECTS_DIR = projectsDir;

    app = await buildApp({ db, dbPath });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.CCM_PROJECTS_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/import/scan returns scan results', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/import/scan' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totalFound).toBe(1);
    expect(body.newSessions).toBe(1);
    expect(body.projects).toHaveLength(1);
  });

  it('POST /api/import/run imports sessions and decisions', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/import/run' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.sessionsImported).toBeGreaterThanOrEqual(1);
    expect(body.decisionsExtracted).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/import/run is idempotent (no duplicates)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/import/run' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.sessionsImported).toBe(0);
  });
});
