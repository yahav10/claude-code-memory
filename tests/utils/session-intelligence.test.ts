import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { getLastSessionContext, detectCurrentWork, getRelevantDecisions } from '../../src/utils/session-intelligence.js';

describe('getLastSessionContext', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-si-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no completed sessions', () => {
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
    const result = getLastSessionContext(db);
    expect(result).toBeNull();
  });

  it('returns most recent completed session with decisions and files', () => {
    db.prepare("INSERT INTO sessions (id, ended_at, git_branch, decision_count) VALUES ('s1', datetime('now', '-2 hours'), 'feature/auth', 2)").run();
    db.prepare("INSERT INTO sessions (id, ended_at, decision_count) VALUES ('s2', datetime('now', '-1 hour'), 1)").run();

    db.prepare("INSERT INTO decisions (title, decision, rationale, tags, session_id) VALUES ('Use JWT', 'JWT auth', 'Scalable', '[\"auth\"]', 's2')").run();
    db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth.ts')").run();

    const result = getLastSessionContext(db);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('s2');
    expect(result!.decisions).toHaveLength(1);
    expect(result!.decisions[0].title).toBe('Use JWT');
    expect(result!.affectedFiles).toContain('src/auth.ts');
  });

  it('ignores sessions without ended_at', () => {
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
    db.prepare("INSERT INTO sessions (id, ended_at) VALUES ('s2', datetime('now'))").run();

    const result = getLastSessionContext(db);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('s2');
  });
});

describe('detectCurrentWork', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-git-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns branch name from git repo', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git checkout -b test-branch', { cwd: tmpDir, stdio: 'pipe' });
    // Need at least one commit for branch to exist
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

    const result = detectCurrentWork(tmpDir);
    expect(result.branch).toBe('test-branch');
  });

  it('returns null branch for non-git directory', () => {
    const result = detectCurrentWork(tmpDir);
    expect(result.branch).toBeNull();
    expect(result.modifiedFiles).toEqual([]);
    expect(result.stagedFiles).toEqual([]);
  });

  it('returns modified files', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'modified');

    const result = detectCurrentWork(tmpDir);
    expect(result.modifiedFiles).toContain('file.txt');
    expect(result.uncommittedChangeCount).toBeGreaterThan(0);
  });
});

describe('getRelevantDecisions', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-rel-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('matches decisions by file path', () => {
    db.prepare("INSERT INTO decisions (title, decision, rationale, tags, session_id) VALUES ('Use JWT', 'JWT auth', 'Scalable', '[\"auth\"]', 's1')").run();
    db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth.ts')").run();

    const results = getRelevantDecisions(db, { modifiedFiles: ['src/auth.ts'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Use JWT');
    expect(results[0].matchReason).toContain('file:');
  });

  it('matches branch keyword to tag', () => {
    db.prepare("INSERT INTO decisions (title, decision, rationale, tags, session_id) VALUES ('Use JWT', 'JWT auth', 'Scalable', '[\"auth\"]', 's1')").run();

    const results = getRelevantDecisions(db, { branch: 'feature/auth-improvements' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toBe('Use JWT');
    expect(results[0].matchReason).toContain('branch:');
  });

  it('falls back to recent decisions when no file/branch matches', () => {
    db.prepare("INSERT INTO decisions (title, decision, rationale, tags, session_id) VALUES ('Use PostgreSQL', 'Postgres', 'ACID', '[\"database\"]', 's1')").run();

    const results = getRelevantDecisions(db, { branch: null, modifiedFiles: [] });
    expect(results).toHaveLength(1);
    expect(results[0].matchReason).toBe('recent');
  });

  it('deduplicates across strategies', () => {
    db.prepare("INSERT INTO decisions (title, decision, rationale, tags, session_id) VALUES ('Use JWT', 'JWT auth', 'Scalable', '[\"auth\"]', 's1')").run();
    db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'src/auth.ts')").run();

    // This decision matches both by file AND by branch keyword — should appear only once
    const results = getRelevantDecisions(db, { branch: 'feature/auth', modifiedFiles: ['src/auth.ts'] });
    const jwtDecisions = results.filter(r => r.title === 'Use JWT');
    expect(jwtDecisions).toHaveLength(1);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      db.prepare(`INSERT INTO decisions (title, decision, rationale, tags, session_id) VALUES ('Decision ${i}', 'X', 'Y', '["test"]', 's1')`).run();
    }

    const results = getRelevantDecisions(db, { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('strips branch prefixes when extracting keywords', () => {
    db.prepare("INSERT INTO decisions (title, decision, rationale, tags, session_id) VALUES ('Use Redis', 'Redis caching', 'Fast', '[\"caching\"]', 's1')").run();

    const results = getRelevantDecisions(db, { branch: 'feature/caching-layer' });
    expect(results.some(r => r.matchReason.includes('branch:caching'))).toBe(true);
  });
});
