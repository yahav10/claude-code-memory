import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { MAX_IDS, formatFullDecision, formatIndexLine, handleGetDecisions } from '../../src/tools/get-decisions.js';

let tmpDir: string;
let db: Database.Database;

function add(title: string, status = 'active'): number {
  return Number(db.prepare(
    "INSERT INTO decisions (title, decision, rationale, alternatives, consequences, status) VALUES (?, 'Pick A', 'A is simpler', '[\"B\",\"C\"]', 'Less flexible', ?)",
  ).run(title, status).lastInsertRowid);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-getdec-'));
  db = initDatabase(path.join(tmpDir, 'test.db'));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('handleGetDecisions', () => {
  it('returns full records in the requested order and skips unknown ids', () => {
    const a = add('First');
    const b = add('Second');
    expect(handleGetDecisions(db, [b, 9999, a]).map(r => r.title)).toEqual(['Second', 'First']);
  });

  it('includes deprecated decisions when asked for by id', () => {
    const id = add('Old', 'deprecated');
    expect(handleGetDecisions(db, [id])[0].status).toBe('deprecated');
  });

  it('collapses duplicate ids and caps the number of records', () => {
    const ids = Array.from({ length: MAX_IDS + 5 }, (_, i) => add(`D${i}`));
    expect(handleGetDecisions(db, [ids[0], ids[0]])).toHaveLength(1);
    expect(handleGetDecisions(db, ids)).toHaveLength(MAX_IDS);
  });

  it('returns nothing for an empty list', () => {
    expect(handleGetDecisions(db, [])).toEqual([]);
  });
});

describe('formatting', () => {
  it('full format carries rationale, alternatives and consequences', () => {
    const id = add('Cache');
    const text = formatFullDecision(handleGetDecisions(db, [id])[0]);
    expect(text).toContain(`## Decision #${id}: Cache`);
    expect(text).toContain('**Rationale**: A is simpler');
    expect(text).toContain('**Alternatives**: B, C');
    expect(text).toContain('**Consequences**: Less flexible');
  });

  it('omits the alternatives line when there are none', () => {
    const id = Number(db.prepare("INSERT INTO decisions (title, decision, rationale, alternatives) VALUES ('NoAlt', 'd', 'r', '[]')").run().lastInsertRowid);
    expect(formatFullDecision(handleGetDecisions(db, [id])[0])).not.toContain('Alternatives');
  });

  it('flags non-active status in both formats', () => {
    const id = add('Old', 'superseded');
    const rec = handleGetDecisions(db, [id])[0];
    expect(formatFullDecision(rec)).toContain('**Status**: superseded');
    expect(formatIndexLine(rec)).toContain('(superseded)');
  });

  it('index line is a single short line, much smaller than the full record', () => {
    const id = add('Cache');
    const rec = { ...handleGetDecisions(db, [id])[0], decision: 'x'.repeat(500) };
    const line = formatIndexLine(rec);
    expect(line).not.toContain('\n');
    expect(line.length).toBeLessThan(260);
    expect(line.length).toBeLessThan(formatFullDecision(rec).length);
  });

  it('shows the semantic score when present', () => {
    expect(formatIndexLine({ id: 1, title: 't', decision: 'd', semantic_score: 0.4321 })).toContain('[match 0.43]');
  });
});
