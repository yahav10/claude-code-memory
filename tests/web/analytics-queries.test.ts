import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../src/database.js';
import { getDecisionQualityMetrics } from '../../src/web/queries.js';
import type Database from 'better-sqlite3';

function seedAnalyticsData(db: Database.Database) {
  // Session
  db.prepare("INSERT INTO sessions (id, started_at, ended_at, summary, decision_count) VALUES ('s1', '2026-01-10 10:00:00', '2026-01-10 11:00:00', 'Auth work', 3)").run();
  db.prepare("INSERT INTO sessions (id, started_at, ended_at, summary, decision_count) VALUES ('s2', '2026-01-15 09:00:00', '2026-01-15 10:30:00', 'DB setup', 2)").run();
  db.prepare("INSERT INTO sessions (id, started_at, ended_at, summary, decision_count) VALUES ('s3', '2026-02-01 14:00:00', '2026-02-01 15:00:00', 'Quick fix', 0)").run();

  // Decisions with varying quality
  // Good: has alternatives, long rationale, has consequences
  db.prepare(`INSERT INTO decisions (title, decision, rationale, alternatives, consequences, status, session_id, tags, created_at, context)
    VALUES ('Use JWT', 'JWT tokens for auth', 'JWT is stateless and scalable for microservices architecture. It allows us to avoid server-side session storage.', '["session cookies","OAuth2 only"]', 'Need token refresh logic', 'active', 's1', '["auth","security"]', '2026-01-10 10:15:00', 'Need scalable auth')`).run();
  // Medium: has alternatives, short rationale, no consequences
  db.prepare(`INSERT INTO decisions (title, decision, rationale, alternatives, consequences, status, session_id, tags, created_at, context)
    VALUES ('Use Postgres', 'PostgreSQL for data', 'ACID compliance', '["MySQL","SQLite"]', NULL, 'deprecated', 's1', '["database"]', '2026-01-10 10:30:00', 'Choosing a DB')`).run();
  // Poor: no alternatives, short rationale, no consequences
  db.prepare(`INSERT INTO decisions (title, decision, rationale, status, session_id, tags, created_at)
    VALUES ('Add ESLint', 'Use ESLint', 'Good practice', 'active', 's1', '["tooling"]', '2026-01-10 10:45:00')`).run();
  // Superseded decision
  db.prepare(`INSERT INTO decisions (title, decision, rationale, alternatives, consequences, status, superseded_by, session_id, tags, created_at, context)
    VALUES ('Use REST', 'REST API', 'Industry standard', '["GraphQL"]', 'May need versioning', 'superseded', 1, 's2', '["api","architecture"]', '2026-01-15 09:15:00', 'API design')`).run();
  // Another active decision
  db.prepare(`INSERT INTO decisions (title, decision, rationale, alternatives, consequences, status, session_id, tags, created_at, context)
    VALUES ('Use Redis cache', 'Redis for caching', 'Fast in-memory store with persistence options. Supports pub/sub for real-time updates.', '["Memcached","in-memory Map"]', 'Extra infra to manage', 'active', 's2', '["performance","infrastructure"]', '2026-01-15 09:30:00', 'Caching strategy')`).run();

  // Files
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth.ts')").run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/middleware.ts')").run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (2, 'src/database.ts')").run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (4, 'src/api/routes.ts')").run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (5, 'src/cache.ts')").run();
  db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (5, 'src/auth.ts')").run();
}

describe('Analytics: Decision Quality Metrics', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-analytics-')));
    const dbPath = path.join(tmpDir, 'test.db');
    db = initDatabase(dbPath);
    seedAnalyticsData(db);
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns alternatives coverage percentage', () => {
    const metrics = getDecisionQualityMetrics(db);
    // 3 out of 5 have alternatives (JWT, Postgres, REST, Redis = 4 have alts, ESLint does not)
    // Actually: JWT has alts, Postgres has alts, ESLint has none, REST has alts, Redis has alts = 4/5 = 80%
    expect(metrics.alternativesCoverage).toBe(80);
  });

  it('returns average rationale length', () => {
    const metrics = getDecisionQualityMetrics(db);
    expect(metrics.avgRationaleLength).toBeGreaterThan(0);
    expect(typeof metrics.avgRationaleLength).toBe('number');
  });

  it('returns consequences tracking percentage', () => {
    const metrics = getDecisionQualityMetrics(db);
    // JWT, REST, Redis have consequences = 3/5 = 60%
    expect(metrics.consequencesTracking).toBe(60);
  });

  it('returns decision revisit rate', () => {
    const metrics = getDecisionQualityMetrics(db);
    // 1 deprecated + 1 superseded out of 5 = 40%
    expect(metrics.revisitRate).toBe(40);
  });

  it('returns total decision count', () => {
    const metrics = getDecisionQualityMetrics(db);
    expect(metrics.totalDecisions).toBe(5);
  });
});
