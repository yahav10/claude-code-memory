import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { handleReviewSession } from '../../src/tools/review-session.js';

describe('review_session', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-rev-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty review when no decisions and no file changes', () => {
    const result = handleReviewSession(db, 's1', tmpDir);
    expect(result.decisionCount).toBe(0);
    expect(result.decisionsThisSession).toEqual([]);
    expect(result.filesChangedDuringSession).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('lists decisions saved this session', () => {
    db.prepare("INSERT INTO decisions (title, decision, rationale, session_id) VALUES ('Use JWT', 'JWT', 'Scalable', 's1')").run();
    db.prepare("INSERT INTO decisions (title, decision, rationale, session_id) VALUES ('Use Postgres', 'PG', 'ACID', 's1')").run();

    const result = handleReviewSession(db, 's1', tmpDir);
    expect(result.decisionCount).toBe(2);
    expect(result.decisionsThisSession).toHaveLength(2);
    expect(result.decisionsThisSession[0].title).toBe('Use JWT');
  });

  it('identifies changed files without decisions', () => {
    // Create a git repo with uncommitted changes
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'modified');

    const result = handleReviewSession(db, 's1', tmpDir);
    expect(result.filesChangedDuringSession).toContain('file.txt');
    expect(result.filesWithoutDecisions).toContain('file.txt');
  });

  it('identifies changed files with existing decisions', () => {
    // Create git repo with uncommitted changes
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'auth.ts'), 'original');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'auth.ts'), 'modified');

    // Add a decision linked to auth.ts
    db.prepare("INSERT INTO decisions (title, decision, rationale, session_id, status) VALUES ('Use JWT', 'JWT', 'Scalable', 's1', 'active')").run();
    db.prepare("INSERT INTO decision_files (decision_id, file_path) VALUES (1, 'auth.ts')").run();

    const result = handleReviewSession(db, 's1', tmpDir);
    expect(result.filesWithExistingDecisions).toHaveLength(1);
    expect(result.filesWithExistingDecisions[0].filePath).toBe('auth.ts');
    expect(result.filesWithExistingDecisions[0].decisions[0].title).toBe('Use JWT');
    expect(result.suggestions.some(s => s.includes('auth.ts') && s.includes('existing decision'))).toBe(true);
  });

  it('suggests saving when files changed but no decisions saved', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'modified');

    const result = handleReviewSession(db, 's1', tmpDir);
    expect(result.suggestions.some(s => s.includes('No decisions were saved'))).toBe(true);
  });

  it('handles non-git directory gracefully', () => {
    const nonGitDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-nogit-')));
    const result = handleReviewSession(db, 's1', nonGitDir);
    expect(result.filesChangedDuringSession).toEqual([]);
    expect(result.suggestions).toEqual([]);
    fs.rmSync(nonGitDir, { recursive: true, force: true });
  });
});
