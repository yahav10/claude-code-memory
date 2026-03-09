import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { logQuery, getTokenSavings } from '../../src/utils/token-savings.js';

describe('Token Savings', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-ts-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('logQuery', () => {
    it('inserts a row with estimated_tokens_saved=300 when results > 0', () => {
      logQuery(db, 's1', 'why JWT?', 3);

      const row = db.prepare('SELECT * FROM query_log WHERE id = 1').get() as any;
      expect(row.session_id).toBe('s1');
      expect(row.query).toBe('why JWT?');
      expect(row.result_count).toBe(3);
      expect(row.estimated_tokens_saved).toBe(300);
    });

    it('inserts a row with estimated_tokens_saved=0 when no results', () => {
      logQuery(db, 's1', 'nonexistent query', 0);

      const row = db.prepare('SELECT * FROM query_log WHERE id = 1').get() as any;
      expect(row.result_count).toBe(0);
      expect(row.estimated_tokens_saved).toBe(0);
    });
  });

  describe('getTokenSavings', () => {
    it('returns correct totals for 30-day window', () => {
      logQuery(db, 's1', 'auth query', 2);
      logQuery(db, 's1', 'database query', 1);
      logQuery(db, 's1', 'empty query', 0);

      const savings = getTokenSavings(db, 30);
      expect(savings.totalQueries).toBe(3);
      expect(savings.successfulQueries).toBe(2);
      expect(savings.estimatedTokensSaved).toBe(600);
      expect(savings.estimatedMinutesSaved).toBe(4);
      expect(savings.estimatedCostSaved).toBeGreaterThan(0);
    });

    it('excludes queries outside the time window', () => {
      // Insert an old query directly
      db.prepare(`
        INSERT INTO query_log (session_id, query, result_count, estimated_tokens_saved, created_at)
        VALUES ('s1', 'old query', 2, 300, datetime('now', '-60 days'))
      `).run();
      logQuery(db, 's1', 'recent query', 1);

      const savings = getTokenSavings(db, 30);
      expect(savings.totalQueries).toBe(1);
      expect(savings.successfulQueries).toBe(1);
      expect(savings.estimatedTokensSaved).toBe(300);
    });

    it('returns zeros when no queries exist', () => {
      const savings = getTokenSavings(db, 30);
      expect(savings.totalQueries).toBe(0);
      expect(savings.successfulQueries).toBe(0);
      expect(savings.estimatedTokensSaved).toBe(0);
      expect(savings.estimatedMinutesSaved).toBe(0);
      expect(savings.estimatedCostSaved).toBe(0);
    });
  });
});
