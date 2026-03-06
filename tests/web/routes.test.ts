import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/web/server.js';
import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../src/database.js';
import type Database from 'better-sqlite3';

function seedTestData(db: Database.Database) {
  db.prepare("INSERT INTO sessions (id, started_at, summary, decision_count) VALUES ('s1', '2026-01-10 10:00:00', 'Test session', 2)").run();
  db.prepare(`INSERT INTO decisions (title, decision, rationale, session_id, tags, status, created_at)
    VALUES ('Use JWT', 'JWT tokens', 'Stateless', 's1', '["auth"]', 'active', '2026-01-10 10:15:00')`).run();
  db.prepare(`INSERT INTO decisions (title, decision, rationale, session_id, tags, status, created_at)
    VALUES ('Use Postgres', 'PostgreSQL', 'ACID', 's1', '["db"]', 'deprecated', '2026-01-10 10:30:00')`).run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth.ts')").run();
}

describe('API routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-routes-')));
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);
    seedTestData(db);
    app = await buildApp({ db, dbPath });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Dashboard
  it('GET /api/dashboard returns stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totalDecisions).toBe(2);
    expect(body.topTags).toBeDefined();
    expect(body.recentDecisions).toBeDefined();
  });

  it('GET /api/dashboard/timeline returns array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/timeline?days=30' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload))).toBe(true);
  });

  // Decisions
  it('GET /api/decisions returns paginated list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/decisions?offset=0&limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.decisions).toBeDefined();
    expect(body.total).toBe(2);
  });

  it('GET /api/decisions/:id returns detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/decisions/1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe('Use JWT');
    expect(body.files).toContain('src/auth.ts');
  });

  it('GET /api/decisions/:id returns 404 for missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/decisions/999' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/decisions/:id updates status', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/decisions/2',
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });

  // Sessions
  it('GET /api/sessions returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions?offset=0&limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.sessions.length).toBe(1);
  });

  it('GET /api/sessions/:id returns detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.decisions.length).toBe(2);
  });

  // Settings
  it('GET /api/settings/database returns info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/database' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.decisionCount).toBe(2);
    expect(body.walEnabled).toBe(true);
  });

  // Export
  it('GET /api/export?format=json returns JSON', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=json' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.version).toBe('1.0');
    expect(body.decisions.length).toBe(2);
  });

  // Analytics
  it('GET /api/analytics/quality returns decision quality metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/quality' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totalDecisions).toBe(2);
    expect(typeof body.alternativesCoverage).toBe('number');
    expect(typeof body.consequencesTracking).toBe('number');
    expect(typeof body.revisitRate).toBe('number');
  });

  it('GET /api/analytics/patterns returns work pattern metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totalSessions).toBe(1);
    expect(typeof body.avgDecisionsPerSession).toBe('number');
    expect(Array.isArray(body.tagTrends)).toBe(true);
  });

  it('GET /api/analytics/codebase returns codebase metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/codebase' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.hotspots)).toBe(true);
    expect(Array.isArray(body.topTags)).toBe(true);
    expect(typeof body.totalFiles).toBe('number');
  });
});
