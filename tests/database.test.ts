import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase, findProjectRoot, getDbPath } from '../src/database.js';

describe('initDatabase', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates database file and initializes schema', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('decisions');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('decision_files');

    db.close();
  });

  it('creates FTS5 virtual table', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];

    expect(tables.map(t => t.name)).toContain('decisions_fts');

    db.close();
  });

  it('enables WAL journal mode', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);

    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');

    db.close();
  });

  it('creates parent directories if missing', () => {
    const dbPath = path.join(tmpDir, 'nested', 'dir', 'test.db');
    const db = initDatabase(dbPath);

    expect(fs.existsSync(dbPath)).toBe(true);

    db.close();
  });

  it('is idempotent — running twice does not error', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db1 = initDatabase(dbPath);
    db1.close();

    const db2 = initDatabase(dbPath);
    const tables = db2.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('decisions');

    db2.close();
  });

  it('FTS5 trigger syncs on insert', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);

    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();

    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id)
      VALUES ('Use JWT', 'JWT tokens', 'Stateless auth', 's1')
    `).run();

    const results = db.prepare(`
      SELECT * FROM decisions_fts WHERE decisions_fts MATCH 'JWT'
    `).all();

    expect(results.length).toBe(1);

    db.close();
  });

  it('FTS5 trigger syncs on delete', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);

    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id)
      VALUES ('Use JWT', 'JWT tokens', 'Stateless auth', 's1')
    `).run();

    db.prepare("DELETE FROM decisions WHERE title = 'Use JWT'").run();

    const results = db.prepare(`
      SELECT * FROM decisions_fts WHERE decisions_fts MATCH 'JWT'
    `).all();

    expect(results.length).toBe(0);

    db.close();
  });

  it('FTS5 trigger syncs on update', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);

    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id)
      VALUES ('Use Postgres', 'Postgres database', 'Relational data', 's1')
    `).run();

    // Update both title and decision so no field still contains 'Postgres'
    db.prepare(`
      UPDATE decisions SET title = 'Use MongoDB', decision = 'MongoDB database'
      WHERE title = 'Use Postgres'
    `).run();

    const postgresResults = db.prepare(
      "SELECT * FROM decisions_fts WHERE decisions_fts MATCH 'Postgres'"
    ).all();
    const mongoResults = db.prepare(
      "SELECT * FROM decisions_fts WHERE decisions_fts MATCH 'MongoDB'"
    ).all();

    expect(postgresResults.length).toBe(0);
    expect(mongoResults.length).toBe(1);

    db.close();
  });

  it('migrates sessions table with new columns', () => {
    const db = initDatabase(path.join(tmpDir, 'migrate-test.db'));
    const columns = db.pragma('table_info(sessions)') as Array<{ name: string }>;
    const names = columns.map(c => c.name);
    expect(names).toContain('project_path');
    expect(names).toContain('git_branch');
    expect(names).toContain('message_count');
    expect(names).toContain('tool_call_count');
    expect(names).toContain('source');
    db.close();
  });
});

describe('findProjectRoot', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-root-')));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds directory with .git', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const nested = path.join(tmpDir, 'a', 'b');
    fs.mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    expect(findProjectRoot()).toBe(tmpDir);
  });

  it('finds directory with package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    const nested = path.join(tmpDir, 'src');
    fs.mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    expect(findProjectRoot()).toBe(tmpDir);
  });

  it('returns cwd as fallback', () => {
    process.chdir(tmpDir);
    expect(findProjectRoot()).toBe(tmpDir);
  });
});
