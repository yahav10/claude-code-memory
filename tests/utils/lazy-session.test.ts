import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { createLazySession } from '../../src/utils/lazy-session.js';
import { getModel, DEFAULT_MODEL } from '../../src/utils/model.js';

describe('createLazySession', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-lazy-'));
    db = initDatabase(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const count = () => (db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;

  it('creates no session row until a tool is used', () => {
    const session = createLazySession(db, 's1', () => ({ branch: 'main', projectPath: '/p' }));
    expect(count()).toBe(0);
    expect(session.started).toBe(false);
  });

  it('creates the row once, with git context, on first ensure()', () => {
    let contextCalls = 0;
    const session = createLazySession(db, 's1', () => {
      contextCalls++;
      return { branch: 'feat/x', projectPath: '/p' };
    });
    session.ensure();
    session.ensure();

    expect(count()).toBe(1);
    expect(contextCalls).toBe(1);
    expect(session.started).toBe(true);
    expect(db.prepare('SELECT git_branch, project_path FROM sessions WHERE id = ?').get('s1'))
      .toEqual({ git_branch: 'feat/x', project_path: '/p' });
  });

  it('still creates the row when git context fails', () => {
    const session = createLazySession(db, 's1', () => { throw new Error('not a git repo'); });
    session.ensure();
    expect(count()).toBe(1);
  });
});

describe('getModel', () => {
  const original = process.env.CLAUDE_SESSION_MEMORY_MODEL;
  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_SESSION_MEMORY_MODEL;
    else process.env.CLAUDE_SESSION_MEMORY_MODEL = original;
  });

  it('defaults to the bundled model', () => {
    delete process.env.CLAUDE_SESSION_MEMORY_MODEL;
    expect(getModel()).toBe(DEFAULT_MODEL);
  });

  it('honors CLAUDE_SESSION_MEMORY_MODEL', () => {
    process.env.CLAUDE_SESSION_MEMORY_MODEL = ' claude-sonnet-5-5 ';
    expect(getModel()).toBe('claude-sonnet-5-5');
  });
});
