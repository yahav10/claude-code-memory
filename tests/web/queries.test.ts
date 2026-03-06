import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../src/database.js';
import {
  getDashboardStats,
  getActivityTimeline,
  getDecisionsList,
  getDecisionDetail,
  getSessionsList,
  getSessionDetail,
  getDatabaseInfo,
} from '../../src/web/queries.js';
import type Database from 'better-sqlite3';

function seedTestData(db: Database.Database) {
  db.prepare("INSERT INTO sessions (id, started_at, summary, decision_count) VALUES ('s1', '2026-01-10 10:00:00', 'Session 1', 3)").run();
  db.prepare("INSERT INTO sessions (id, started_at, summary, decision_count) VALUES ('s2', '2026-01-12 14:00:00', 'Session 2', 1)").run();
  db.prepare(`INSERT INTO decisions (title, decision, rationale, session_id, tags, status, created_at)
    VALUES ('Use JWT', 'JWT tokens', 'Stateless auth', 's1', '["auth","security"]', 'active', '2026-01-10 10:15:00')`).run();
  db.prepare(`INSERT INTO decisions (title, decision, rationale, session_id, tags, status, created_at)
    VALUES ('Use Postgres', 'PostgreSQL 16', 'ACID compliance', 's1', '["database"]', 'active', '2026-01-10 10:30:00')`).run();
  db.prepare(`INSERT INTO decisions (title, decision, rationale, session_id, tags, status, created_at, context, alternatives, consequences)
    VALUES ('Use Redis', 'Redis cache', 'Low latency', 's1', '["cache","performance"]', 'deprecated', '2026-01-10 11:00:00', 'Need caching', '["Memcached","In-memory"]', 'Requires Redis server')`).run();
  db.prepare(`INSERT INTO decisions (title, decision, rationale, session_id, tags, status, created_at)
    VALUES ('Use React', 'React 19', 'Component model', 's2', '["frontend"]', 'active', '2026-01-12 14:15:00')`).run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth.ts')").run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/middleware.ts')").run();
}

describe('getDashboardStats', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-q-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns correct totals', () => {
    const stats = getDashboardStats(db);
    expect(stats.totalDecisions).toBe(4);
    expect(stats.activeDecisions).toBe(3);
    expect(stats.deprecatedDecisions).toBe(1);
    expect(stats.totalSessions).toBe(2);
  });

  it('returns top tags', () => {
    const stats = getDashboardStats(db);
    expect(stats.topTags.length).toBeGreaterThan(0);
    expect(stats.topTags[0]).toHaveProperty('tag');
    expect(stats.topTags[0]).toHaveProperty('count');
  });

  it('returns recent decisions', () => {
    const stats = getDashboardStats(db);
    expect(stats.recentDecisions.length).toBeLessThanOrEqual(10);
    expect(stats.recentDecisions[0].title).toBeDefined();
  });
});

describe('getActivityTimeline', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-q-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns date-count pairs', () => {
    const timeline = getActivityTimeline(db, 30);
    expect(Array.isArray(timeline)).toBe(true);
    if (timeline.length > 0) {
      expect(timeline[0]).toHaveProperty('date');
      expect(timeline[0]).toHaveProperty('count');
    }
  });
});

describe('getDecisionsList', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-q-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns paginated results', () => {
    const result = getDecisionsList(db, { offset: 0, limit: 2 });
    expect(result.decisions.length).toBe(2);
    expect(result.total).toBe(4);
  });

  it('filters by status', () => {
    const result = getDecisionsList(db, { offset: 0, limit: 10, status: ['deprecated'] });
    expect(result.decisions.length).toBe(1);
    expect(result.decisions[0].title).toBe('Use Redis');
  });

  it('searches by term', () => {
    const result = getDecisionsList(db, { offset: 0, limit: 10, search: 'JWT' });
    expect(result.decisions.length).toBeGreaterThanOrEqual(1);
  });

  it('sorts by created_at desc by default', () => {
    const result = getDecisionsList(db, { offset: 0, limit: 10 });
    const dates = result.decisions.map(d => d.created_at);
    expect(dates[0] >= dates[1]).toBe(true);
  });
});

describe('getDecisionDetail', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-q-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns full decision with files', () => {
    const detail = getDecisionDetail(db, 1);
    expect(detail).not.toBeNull();
    expect(detail!.title).toBe('Use JWT');
    expect(detail!.files).toContain('src/auth.ts');
    expect(detail!.files).toContain('src/middleware.ts');
  });

  it('returns null for non-existent ID', () => {
    const detail = getDecisionDetail(db, 999);
    expect(detail).toBeNull();
  });
});

describe('getSessionsList', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-q-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns sessions with decision counts', () => {
    const result = getSessionsList(db, { offset: 0, limit: 10 });
    expect(result.sessions.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.sessions[0]).toHaveProperty('decision_count');
  });
});

describe('getSessionDetail', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-q-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns session with its decisions', () => {
    const detail = getSessionDetail(db, 's1');
    expect(detail).not.toBeNull();
    expect(detail!.decisions.length).toBe(3);
  });

  it('returns null for non-existent session', () => {
    const detail = getSessionDetail(db, 'nope');
    expect(detail).toBeNull();
  });
});

describe('getDatabaseInfo', () => {
  let db: Database.Database;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-q-')));
    dbPath = path.join(tmpDir, 'test.db');
    db = initDatabase(dbPath);
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns database file info', () => {
    const info = getDatabaseInfo(db, dbPath);
    expect(info.path).toBe(dbPath);
    expect(info.sizeBytes).toBeGreaterThan(0);
    expect(info.decisionCount).toBe(4);
    expect(info.sessionCount).toBe(2);
    expect(info.walEnabled).toBe(true);
  });
});
