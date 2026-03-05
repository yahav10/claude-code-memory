import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../src/database.js';
import { handleSaveDecision } from '../src/tools/save-decision.js';
import { handleQueryMemory } from '../src/tools/query-memory.js';
import { handleListRecent } from '../src/tools/list-recent.js';
import { handleUpdateDecision } from '../src/tools/update-decision.js';
import { handleGetStats } from '../src/tools/get-stats.js';

describe('MCP Tool Handlers', () => {
  let db: Database.Database;
  let tmpDir: string;
  const sessionId = 'test-session-1';

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-tools-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES (?)").run(sessionId);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('save_decision', () => {
    it('saves a decision and returns ID', () => {
      const result = handleSaveDecision(db, sessionId, {
        title: 'Use JWT',
        decision: 'JWT tokens for auth',
        rationale: 'Stateless and scalable',
      });
      expect(result.id).toBe(1);
      expect(result.title).toBe('Use JWT');
    });

    it('saves file links', () => {
      handleSaveDecision(db, sessionId, {
        title: 'Use JWT',
        decision: 'JWT tokens',
        rationale: 'Stateless',
        files: ['src/auth.ts', 'src/middleware.ts'],
      });

      const files = db.prepare(
        'SELECT file_path FROM decision_files WHERE decision_id = 1'
      ).all() as { file_path: string }[];
      expect(files.map(f => f.file_path)).toEqual(['src/auth.ts', 'src/middleware.ts']);
    });

    it('increments session decision_count', () => {
      handleSaveDecision(db, sessionId, {
        title: 'D1', decision: 'X', rationale: 'Y',
      });
      handleSaveDecision(db, sessionId, {
        title: 'D2', decision: 'X', rationale: 'Y',
      });

      const session = db.prepare(
        'SELECT decision_count FROM sessions WHERE id = ?'
      ).get(sessionId) as { decision_count: number };
      expect(session.decision_count).toBe(2);
    });

    it('stores tags as JSON', () => {
      handleSaveDecision(db, sessionId, {
        title: 'Use JWT',
        decision: 'JWT',
        rationale: 'Stateless',
        tags: ['auth', 'security'],
      });

      const row = db.prepare('SELECT tags FROM decisions WHERE id = 1').get() as { tags: string };
      expect(JSON.parse(row.tags)).toEqual(['auth', 'security']);
    });

    it('stores alternatives as JSON', () => {
      handleSaveDecision(db, sessionId, {
        title: 'Use JWT',
        decision: 'JWT',
        rationale: 'Stateless',
        alternatives: ['sessions', 'OAuth'],
      });

      const row = db.prepare('SELECT alternatives FROM decisions WHERE id = 1').get() as { alternatives: string };
      expect(JSON.parse(row.alternatives)).toEqual(['sessions', 'OAuth']);
    });
  });

  describe('query_memory', () => {
    beforeEach(() => {
      handleSaveDecision(db, sessionId, {
        title: 'Use JWT for auth',
        decision: 'JWT tokens',
        rationale: 'Stateless and scalable',
        tags: ['auth'],
        files: ['src/auth.ts'],
      });
      handleSaveDecision(db, sessionId, {
        title: 'Use Pinia',
        decision: 'Pinia store',
        rationale: 'Better TypeScript',
        tags: ['state'],
      });
    });

    it('finds decisions by keyword', () => {
      const result = handleQueryMemory(db, sessionId, { query: 'why did we choose JWT?' });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].title).toContain('JWT');
    });

    it('returns empty results for no match', () => {
      const result = handleQueryMemory(db, sessionId, { query: 'quantum computing' });
      expect(result.results).toEqual([]);
    });

    it('respects limit parameter', () => {
      const result = handleQueryMemory(db, sessionId, { query: 'show recent decisions', limit: 1 });
      expect(result.results.length).toBe(1);
    });
  });

  describe('list_recent', () => {
    beforeEach(() => {
      handleSaveDecision(db, sessionId, {
        title: 'D1', decision: 'X', rationale: 'Y',
      });
      handleSaveDecision(db, sessionId, {
        title: 'D2', decision: 'X', rationale: 'Y',
      });
    });

    it('lists decisions across all sessions when no session filter', () => {
      const result = handleListRecent(db, sessionId, {});
      expect(result.results.length).toBe(2);
    });

    it('filters by session when provided', () => {
      db.prepare("INSERT INTO sessions (id) VALUES ('other')").run();
      handleSaveDecision(db, 'other', {
        title: 'D3', decision: 'X', rationale: 'Y',
      });

      const result = handleListRecent(db, sessionId, { session: sessionId });
      expect(result.results.length).toBe(2);
    });

    it('respects limit', () => {
      const result = handleListRecent(db, sessionId, { limit: 1 });
      expect(result.results.length).toBe(1);
    });
  });

  describe('update_decision', () => {
    beforeEach(() => {
      handleSaveDecision(db, sessionId, {
        title: 'Use JWT', decision: 'JWT', rationale: 'Stateless',
      });
    });

    it('updates status to deprecated', () => {
      const result = handleUpdateDecision(db, { id: 1, status: 'deprecated' });
      expect(result.success).toBe(true);

      const row = db.prepare('SELECT status FROM decisions WHERE id = 1').get() as { status: string };
      expect(row.status).toBe('deprecated');
    });

    it('sets superseded_by', () => {
      handleSaveDecision(db, sessionId, {
        title: 'Use OAuth', decision: 'OAuth2', rationale: 'Better security',
      });

      handleUpdateDecision(db, { id: 1, status: 'superseded', superseded_by: 2 });

      const row = db.prepare('SELECT superseded_by FROM decisions WHERE id = 1').get() as { superseded_by: number };
      expect(row.superseded_by).toBe(2);
    });

    it('throws for non-existent decision', () => {
      expect(() => handleUpdateDecision(db, { id: 999 })).toThrow('Decision 999 not found');
    });
  });

  describe('get_stats', () => {
    it('returns zero stats for empty database', () => {
      const stats = handleGetStats(db);
      expect(stats.totalDecisions).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.totalSessions).toBe(1); // We created one in beforeEach
    });

    it('returns correct counts', () => {
      handleSaveDecision(db, sessionId, {
        title: 'D1', decision: 'X', rationale: 'Y', tags: ['auth', 'security'],
      });
      handleSaveDecision(db, sessionId, {
        title: 'D2', decision: 'X', rationale: 'Y', tags: ['auth'],
      });
      handleUpdateDecision(db, { id: 2, status: 'deprecated' });

      const stats = handleGetStats(db);
      expect(stats.totalDecisions).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.deprecated).toBe(1);
      expect(stats.superseded).toBe(0);
      expect(stats.topTags.length).toBeGreaterThan(0);
      expect(stats.topTags[0].tag).toBe('auth');
      expect(stats.topTags[0].count).toBe(2);
    });
  });
});
