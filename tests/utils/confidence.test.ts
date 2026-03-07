import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { decayConfidence, getActiveDecisionsAboveConfidence } from '../../src/utils/confidence.js';

describe('Confidence decay', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-conf-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fresh "temporary" decision has confidence 1.0', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id)
      VALUES ('Temp fix', 'Quick workaround', 'Unblock deploy', '["temporary"]', 's1')
    `).run();

    const row = db.prepare('SELECT confidence FROM decisions WHERE id = 1').get() as { confidence: number };
    expect(row.confidence).toBe(1.0);
  });

  it('decays "temporary" decisions based on age', () => {
    // Insert a decision created 15 days ago
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, created_at)
      VALUES ('Old temp', 'Workaround', 'Testing', '["temporary"]', 's1', datetime('now', '-15 days'))
    `).run();

    decayConfidence(db);

    const row = db.prepare('SELECT confidence FROM decisions WHERE id = 1').get() as { confidence: number };
    expect(row.confidence).toBeCloseTo(0.5, 1);
  });

  it('decays "experimental" decisions based on age', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, created_at)
      VALUES ('Experiment', 'Try new approach', 'Testing', '["experimental"]', 's1', datetime('now', '-15 days'))
    `).run();

    decayConfidence(db);

    const row = db.prepare('SELECT confidence FROM decisions WHERE id = 1').get() as { confidence: number };
    expect(row.confidence).toBeCloseTo(0.5, 1);
  });

  it('30-day old "temporary" decision decays to 0', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, created_at)
      VALUES ('Very old temp', 'Workaround', 'Testing', '["temporary"]', 's1', datetime('now', '-31 days'))
    `).run();

    decayConfidence(db);

    const row = db.prepare('SELECT confidence FROM decisions WHERE id = 1').get() as { confidence: number };
    expect(row.confidence).toBe(0);
  });

  it('regular decisions never decay', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, created_at)
      VALUES ('Permanent', 'Use JWT', 'Scalable', '["auth"]', 's1', datetime('now', '-60 days'))
    `).run();

    decayConfidence(db);

    const row = db.prepare('SELECT confidence FROM decisions WHERE id = 1').get() as { confidence: number };
    expect(row.confidence).toBe(1.0);
  });

  it('returns count of updated decisions', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, created_at)
      VALUES ('Temp1', 'X', 'Y', '["temporary"]', 's1', datetime('now', '-5 days'))
    `).run();
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, created_at)
      VALUES ('Perm1', 'X', 'Y', '["auth"]', 's1', datetime('now', '-5 days'))
    `).run();

    const result = decayConfidence(db);
    expect(result.updated).toBe(1);
  });
});

describe('getActiveDecisionsAboveConfidence', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-conf2-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('excludes decisions below confidence threshold', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, confidence)
      VALUES ('High', 'X', 'Y', '["auth"]', 's1', 1.0)
    `).run();
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, confidence)
      VALUES ('Low', 'X', 'Y', '["temporary"]', 's1', 0.1)
    `).run();

    const results = getActiveDecisionsAboveConfidence(db, 0.3);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('High');
  });

  it('excludes deprecated decisions', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, status)
      VALUES ('Deprecated', 'X', 'Y', '["auth"]', 's1', 'deprecated')
    `).run();

    const results = getActiveDecisionsAboveConfidence(db);
    expect(results).toHaveLength(0);
  });
});
