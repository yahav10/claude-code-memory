import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { classifyQuery, executeQuery } from '../src/queries.js';
import { initDatabase } from '../src/database.js';
import type Database from 'better-sqlite3';

describe('classifyQuery', () => {
  it('classifies "why did we choose JWT?" as WHY_DECISION', () => {
    const result = classifyQuery('why did we choose JWT?');
    expect(result.type).toBe('WHY_DECISION');
    expect(result.extracted).toBe('JWT');
  });

  it('classifies "why are we using Pinia?" as WHY_DECISION', () => {
    const result = classifyQuery('why are we using Pinia?');
    expect(result.type).toBe('WHY_DECISION');
    expect(result.extracted).toBe('Pinia');
  });

  it('classifies "what decisions affect src/auth.ts?" as FILE_IMPACT', () => {
    const result = classifyQuery('what decisions affect src/auth.ts?');
    expect(result.type).toBe('FILE_IMPACT');
    expect(result.extracted).toBe('src/auth.ts');
  });

  it('classifies "show decisions about authentication" as TAG_SEARCH', () => {
    const result = classifyQuery('show decisions about authentication');
    expect(result.type).toBe('TAG_SEARCH');
    expect(result.extracted).toBe('authentication');
  });

  it('classifies "show recent decisions" as RECENT', () => {
    const result = classifyQuery('show recent decisions');
    expect(result.type).toBe('RECENT');
  });

  it('classifies "compare Pinia vs Vuex" as COMPARISON', () => {
    const result = classifyQuery('compare Pinia vs Vuex');
    expect(result.type).toBe('COMPARISON');
    expect(result.extracted).toBe('Pinia|Vuex');
  });

  it('classifies "show deprecated decisions" as DEPRECATED', () => {
    const result = classifyQuery('show deprecated decisions');
    expect(result.type).toBe('DEPRECATED');
  });

  it('classifies "what decisions in this session" as CURRENT_SESSION', () => {
    const result = classifyQuery('what decisions in this session');
    expect(result.type).toBe('CURRENT_SESSION');
  });

  it('classifies "show alternatives for JWT" as ALTERNATIVES', () => {
    const result = classifyQuery('show alternatives for JWT');
    expect(result.type).toBe('ALTERNATIVES');
    expect(result.extracted).toBe('JWT');
  });

  it('classifies "what are the consequences of using Redis" as CONSEQUENCES', () => {
    const result = classifyQuery('what are the consequences of using Redis');
    expect(result.type).toBe('CONSEQUENCES');
    expect(result.extracted).toBe('using Redis');
  });

  it('falls back to HYBRID_SEARCH for unmatched queries', () => {
    const result = classifyQuery('tell me about authentication');
    expect(result.type).toBe('HYBRID_SEARCH');
  });

  it('falls back to HYBRID_SEARCH for empty string', () => {
    const result = classifyQuery('');
    expect(result.type).toBe('HYBRID_SEARCH');
  });
});

describe('executeQuery', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-query-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));

    // Seed test data
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
    db.prepare("INSERT INTO sessions (id) VALUES ('s2')").run();

    db.prepare(`
      INSERT INTO decisions (title, context, decision, rationale, alternatives, consequences, session_id, tags, status)
      VALUES ('Use JWT for auth', 'Need stateless auth', 'JWT tokens', 'Scalability and stateless', '["sessions", "OAuth"]', 'Need refresh token rotation', 's1', '["auth", "security"]', 'active')
    `).run();

    db.prepare(`
      INSERT INTO decisions (title, context, decision, rationale, alternatives, session_id, tags, status)
      VALUES ('Use Pinia over Vuex', 'State management', 'Pinia', 'Better TypeScript support', '["Vuex", "Redux"]', 's1', '["state", "frontend"]', 'active')
    `).run();

    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id, tags, status)
      VALUES ('Drop Vuex', 'Remove Vuex dependency', 'Replaced by Pinia', 's2', '["state"]', 'deprecated')
    `).run();

    // Add file links
    db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth/middleware.ts')").run();
    db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth/jwt.ts')").run();
    db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (2, 'src/stores/index.ts')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('WHY_DECISION: finds decisions about JWT', () => {
    const results = executeQuery(db, 'why did we choose JWT?', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('JWT');
  });

  it('FILE_IMPACT: finds decisions for src/auth/jwt.ts', () => {
    const results = executeQuery(db, 'what decisions affect src/auth/jwt.ts?', 5);
    expect(results.length).toBe(1);
    expect(results[0].title).toContain('JWT');
  });

  it('TAG_SEARCH: finds decisions tagged auth', () => {
    const results = executeQuery(db, 'show decisions about auth', 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it('RECENT: returns decisions ordered by date', () => {
    const results = executeQuery(db, 'show recent decisions', 5);
    expect(results.length).toBe(3);
  });

  it('COMPARISON: merges results for Pinia vs Vuex', () => {
    const results = executeQuery(db, 'compare Pinia vs Vuex', 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it('DEPRECATED: returns deprecated decisions', () => {
    const results = executeQuery(db, 'show deprecated decisions', 5);
    expect(results.length).toBe(1);
    expect(results[0].status).toBe('deprecated');
  });

  it('CURRENT_SESSION: filters by session', () => {
    const results = executeQuery(db, 'what decisions in this session', 5, 's1');
    expect(results.length).toBe(2);
  });

  it('ALTERNATIVES: finds decisions with alternatives', () => {
    const results = executeQuery(db, 'show alternatives for JWT', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].alternatives).toBeTruthy();
  });

  it('CONSEQUENCES: finds decisions with consequences', () => {
    const results = executeQuery(db, 'what are the consequences of JWT', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].consequences).toBeTruthy();
  });

  it('HYBRID_SEARCH: falls back to FTS5 for unmatched queries', () => {
    const results = executeQuery(db, 'stateless auth', 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty array for no matches', () => {
    const results = executeQuery(db, 'quantum computing', 5);
    expect(results).toEqual([]);
  });
});
