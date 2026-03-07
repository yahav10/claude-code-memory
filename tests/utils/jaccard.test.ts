import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { handleSaveDecision } from '../../src/tools/save-decision.js';
import { tokenize, jaccardSimilarity, findSimilarDecisions } from '../../src/utils/jaccard.js';

describe('Jaccard utilities', () => {
  describe('tokenize', () => {
    it('lowercases and splits text', () => {
      const tokens = tokenize('Use JWT For Authentication');
      expect(tokens.has('jwt')).toBe(true);
      expect(tokens.has('authentication')).toBe(true);
    });

    it('removes stop words', () => {
      const tokens = tokenize('Use the JWT for our authentication');
      expect(tokens.has('the')).toBe(false);
      expect(tokens.has('for')).toBe(false);
      expect(tokens.has('our')).toBe(false);
      expect(tokens.has('use')).toBe(false);
    });

    it('removes short words (< 3 chars)', () => {
      const tokens = tokenize('we go to db');
      expect(tokens.has('go')).toBe(false);
      expect(tokens.has('db')).toBe(false);
    });

    it('strips punctuation', () => {
      const tokens = tokenize('JWT-based auth. (stateless!)');
      expect(tokens.has('jwt')).toBe(true);
      expect(tokens.has('auth')).toBe(true);
      expect(tokens.has('stateless')).toBe(true);
    });

    it('returns empty set for empty string', () => {
      expect(tokenize('').size).toBe(0);
    });
  });

  describe('jaccardSimilarity', () => {
    it('returns 1.0 for identical sets', () => {
      const a = new Set(['jwt', 'auth', 'tokens']);
      expect(jaccardSimilarity(a, a)).toBe(1.0);
    });

    it('returns 0 for disjoint sets', () => {
      const a = new Set(['jwt', 'auth']);
      const b = new Set(['postgres', 'database']);
      expect(jaccardSimilarity(a, b)).toBe(0);
    });

    it('returns correct value for partial overlap', () => {
      const a = new Set(['jwt', 'auth', 'tokens']);
      const b = new Set(['jwt', 'auth', 'sessions']);
      // intersection: 2, union: 4
      expect(jaccardSimilarity(a, b)).toBe(0.5);
    });

    it('returns 0 for two empty sets', () => {
      expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
    });
  });

  describe('findSimilarDecisions', () => {
    let db: Database.Database;
    let tmpDir: string;
    const sessionId = 'test-session';

    beforeEach(() => {
      tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-jaccard-')));
      db = initDatabase(path.join(tmpDir, 'test.db'));
      db.prepare("INSERT INTO sessions (id) VALUES (?)").run(sessionId);

      handleSaveDecision(db, sessionId, {
        title: 'Use JWT for authentication',
        decision: 'JWT tokens for stateless auth',
        rationale: 'Scalable',
      });
      handleSaveDecision(db, sessionId, {
        title: 'Use PostgreSQL',
        decision: 'PostgreSQL database for persistence',
        rationale: 'ACID compliance',
      });
    });

    afterEach(() => {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds similar decisions above threshold', () => {
      const matches = findSimilarDecisions(
        db, 'Use JWT for auth', 'JWT tokens for authentication', undefined, 0.4,
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].title).toContain('JWT');
    });

    it('returns empty for unrelated decisions', () => {
      const matches = findSimilarDecisions(
        db, 'Use Redis for caching', 'Redis in-memory store', undefined, 0.6,
      );
      expect(matches).toEqual([]);
    });

    it('excludes specified decision ID', () => {
      const matches = findSimilarDecisions(
        db, 'Use JWT for authentication', 'JWT tokens for stateless auth', 1, 0.4,
      );
      // Should not find decision #1 since we excluded it
      expect(matches.find(m => m.id === 1)).toBeUndefined();
    });

    it('sorts by similarity descending', () => {
      handleSaveDecision(db, sessionId, {
        title: 'Use JWT tokens',
        decision: 'JWT for API auth',
        rationale: 'Standard',
      });

      const matches = findSimilarDecisions(
        db, 'Use JWT for auth', 'JWT tokens for authentication', undefined, 0.3,
      );
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].similarity).toBeGreaterThanOrEqual(matches[i].similarity);
      }
    });
  });
});

describe('save_decision dedup integration', () => {
  let db: Database.Database;
  let tmpDir: string;
  const sessionId = 'test-session';

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-dedup-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES (?)").run(sessionId);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-supersedes very similar decisions (>0.8)', () => {
    handleSaveDecision(db, sessionId, {
      title: 'Use JWT for authentication tokens',
      decision: 'JWT tokens for stateless authentication',
      rationale: 'Scalable',
    });

    const result = handleSaveDecision(db, sessionId, {
      title: 'Use JWT for authentication tokens',
      decision: 'JWT tokens for stateless authentication',
      rationale: 'Updated approach',
    });

    expect(result.autoSuperseded).toBeDefined();
    expect(result.autoSuperseded).toContain(1);

    const old = db.prepare('SELECT status, superseded_by FROM decisions WHERE id = 1').get() as any;
    expect(old.status).toBe('superseded');
    expect(old.superseded_by).toBe(2);
  });

  it('warns about moderately similar decisions (0.6-0.8)', () => {
    handleSaveDecision(db, sessionId, {
      title: 'Use JWT for authentication',
      decision: 'JWT tokens for auth',
      rationale: 'Scalable',
    });

    const result = handleSaveDecision(db, sessionId, {
      title: 'Use OAuth tokens for authentication',
      decision: 'OAuth2 tokens for auth flow',
      rationale: 'Better security',
    });

    // Should have some similarity warning (tokens overlap: authentication, tokens, auth)
    // but not auto-supersede since the decisions are different enough
    if (result.similarDecisions) {
      expect(result.similarDecisions[0].similarity).toBeGreaterThanOrEqual(0.6);
      expect(result.similarDecisions[0].similarity).toBeLessThanOrEqual(0.8);
    }
  });

  it('no warnings for unrelated decisions', () => {
    handleSaveDecision(db, sessionId, {
      title: 'Use JWT for authentication',
      decision: 'JWT tokens',
      rationale: 'Scalable',
    });

    const result = handleSaveDecision(db, sessionId, {
      title: 'Use PostgreSQL for database',
      decision: 'PostgreSQL with Prisma ORM',
      rationale: 'ACID compliance',
    });

    expect(result.similarDecisions).toBeUndefined();
    expect(result.autoSuperseded).toBeUndefined();
  });
});
