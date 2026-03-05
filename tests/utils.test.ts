import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateSessionId, sanitizeFtsQuery, generateSessionSummary } from '../src/utils.js';
import { initDatabase } from '../src/database.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('generateSessionId', () => {
  it('starts with "session_"', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^session_\d+_[a-f0-9]{8}$/);
  });

  it('generates unique IDs', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).not.toBe(id2);
  });
});

describe('sanitizeFtsQuery', () => {
  it('wraps simple query in double quotes', () => {
    expect(sanitizeFtsQuery('JWT authentication')).toBe('"JWT authentication"');
  });

  it('escapes internal double quotes', () => {
    expect(sanitizeFtsQuery('use "JWT" tokens')).toBe('"use ""JWT"" tokens"');
  });

  it('handles special FTS5 operators', () => {
    const result = sanitizeFtsQuery('C++ language');
    expect(result).toBe('"C++ language"');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeFtsQuery('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeFtsQuery('  JWT  ')).toBe('"JWT"');
  });
});

describe('generateSessionSummary', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-util-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns "No decisions recorded" for empty session', () => {
    const db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();

    expect(generateSessionSummary(db, 's1')).toBe('No decisions recorded');
    db.close();
  });

  it('returns count and titles for sessions with decisions', () => {
    const db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id)
      VALUES ('Use JWT', 'JWT tokens', 'Stateless', 's1')
    `).run();
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id)
      VALUES ('Use Pinia', 'Pinia store', 'Better TS', 's1')
    `).run();

    const summary = generateSessionSummary(db, 's1');
    expect(summary).toBe('2 decision(s): Use JWT; Use Pinia');
    db.close();
  });
});
