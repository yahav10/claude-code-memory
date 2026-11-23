import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import {
  FILE_BUDGET,
  filterUnseen,
  formatLine,
  getInjectionStats,
  recordInjection,
  renderBlock,
  resetInjections,
  selectForFile,
  selectForPrompt,
  selectForSessionStart,
  type InjectionDecision,
} from '../../src/utils/injection.js';

let tmpDir: string;
let db: Database.Database;

function addDecision(opts: {
  title: string;
  decision?: string;
  rationale?: string;
  files?: string[];
  status?: string;
  confidence?: number;
  tags?: string[];
}): number {
  const res = db.prepare(`
    INSERT INTO decisions (title, decision, rationale, status, confidence, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    opts.title, opts.decision ?? `${opts.title} decision`, opts.rationale ?? 'because',
    opts.status ?? 'active', opts.confidence ?? 1.0, JSON.stringify(opts.tags ?? []),
  );
  for (const f of opts.files ?? []) {
    db.prepare('INSERT INTO decision_files (decision_id, file_path) VALUES (?, ?)').run(res.lastInsertRowid, f);
  }
  return Number(res.lastInsertRowid);
}

const fake = (id: number, extra: Partial<InjectionDecision> = {}): InjectionDecision => ({
  id, title: `Decision ${id}`, decision: 'Use X', rationale: 'Because Y', tags: [], reason: '', ...extra,
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-inj-'));
  db = initDatabase(path.join(tmpDir, 'test.db'));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('renderBlock', () => {
  it('stays within the character budget and drops what does not fit', () => {
    const many = Array.from({ length: 40 }, (_, i) => fake(i + 1, { decision: 'x'.repeat(200) }));
    const block = renderBlock('Header:', many, 1500)!;
    expect(block.text.length).toBeLessThanOrEqual(1500);
    expect(block.shown.length).toBeGreaterThan(0);
    expect(block.shown.length).toBeLessThan(many.length);
    expect(block.text).toContain('get_decisions');
  });

  it('shortens a single oversized decision instead of dropping it', () => {
    const block = renderBlock('H:', [fake(1, { decision: 'y'.repeat(5000) })], 600)!;
    expect(block.shown).toHaveLength(1);
    expect(block.text.length).toBeLessThanOrEqual(600);
  });

  it('returns null when there is nothing to show', () => {
    expect(renderBlock('H:', [], 1000)).toBeNull();
  });

  it('puts the id in every line so the agent can call get_decisions', () => {
    expect(formatLine(fake(42))).toContain('#42');
  });
});

describe('selectForFile', () => {
  const root = '/proj';

  it('matches a decision recorded with a relative path when the edit uses an absolute one', () => {
    const id = addDecision({ title: 'Auth', files: ['src/auth/login.ts'] });
    expect(selectForFile(db, '/proj/src/auth/login.ts', root).map(d => d.id)).toEqual([id]);
  });

  it('matches a decision recorded with an absolute path', () => {
    const id = addDecision({ title: 'Auth', files: ['/proj/src/auth/login.ts'] });
    expect(selectForFile(db, 'src/auth/login.ts', root).map(d => d.id)).toEqual([id]);
  });

  it('does not match a different file that merely shares the basename', () => {
    addDecision({ title: 'Other', files: ['src/other/login.ts'] });
    expect(selectForFile(db, '/proj/src/auth/login.ts', root)).toEqual([]);
  });

  it('ignores deprecated, superseded and decayed decisions', () => {
    addDecision({ title: 'Old', files: ['a.ts'], status: 'deprecated' });
    addDecision({ title: 'Gone', files: ['a.ts'], status: 'superseded' });
    addDecision({ title: 'Faded', files: ['a.ts'], confidence: 0.1 });
    const live = addDecision({ title: 'Live', files: ['a.ts'] });
    expect(selectForFile(db, '/proj/a.ts', root).map(d => d.id)).toEqual([live]);
  });

  it('returns each decision once even when it lists several files', () => {
    const id = addDecision({ title: 'Multi', files: ['a.ts', 'src/a.ts'] });
    expect(selectForFile(db, '/proj/src/a.ts', root).map(d => d.id)).toEqual([id]);
  });
});

describe('selectForSessionStart', () => {
  it('prefers decisions on modified files, then recent ones, and skips decayed ones', () => {
    const onFile = addDecision({ title: 'On file', files: ['src/x.ts'] });
    addDecision({ title: 'Faded', confidence: 0.1 });
    const recent = addDecision({ title: 'Recent' });
    const ids = selectForSessionStart(db, { branch: null, modifiedFiles: ['src/x.ts'] }).map(d => d.id);
    expect(ids[0]).toBe(onFile);
    expect(ids).toContain(recent);
    expect(ids).toHaveLength(2);
  });
});

describe('selectForPrompt', () => {
  it('skips short prompts and slash commands without touching the embedder', async () => {
    addDecision({ title: 'Anything' });
    expect(await selectForPrompt(db, 'fix it')).toEqual([]);
    expect(await selectForPrompt(db, '/compact with a very long argument list here')).toEqual([]);
  });
});

describe('dedup and stats', () => {
  it('shows a decision once per session, but again in another session', () => {
    const d = fake(1);
    expect(filterUnseen(db, 's1', 'SessionStart', [d])).toHaveLength(1);
    recordInjection(db, 's1', 'SessionStart', [d]);
    expect(filterUnseen(db, 's1', 'SessionStart', [d])).toHaveLength(0);
    expect(filterUnseen(db, 's2', 'SessionStart', [d])).toHaveLength(1);
  });

  it('dedups per hook event: shown at session start still shows before an edit', () => {
    const d = fake(1);
    recordInjection(db, 's1', 'SessionStart', [d]);
    expect(filterUnseen(db, 's1', 'PreToolUse', [d])).toHaveLength(1);
    recordInjection(db, 's1', 'PreToolUse', [d]);
    expect(filterUnseen(db, 's1', 'PreToolUse', [d])).toHaveLength(0);
  });

  it('lets decisions show again after a reset (compaction or /clear)', () => {
    const d = fake(1);
    recordInjection(db, 's1', 'SessionStart', [d]);
    resetInjections(db, 's1');
    expect(filterUnseen(db, 's1', 'SessionStart', [d])).toHaveLength(1);
  });

  it('recording the same event twice does not double count', () => {
    const d = fake(1);
    recordInjection(db, 's1', 'SessionStart', [d]);
    recordInjection(db, 's1', 'SessionStart', [d]);
    expect(getInjectionStats(db).decisionsInjected).toBe(1);
  });

  it('reports injected decisions, sessions, events and an estimated token cost', () => {
    recordInjection(db, 's1', 'SessionStart', [fake(1), fake(2)]);
    recordInjection(db, 's2', 'PreToolUse', [fake(3)]);
    const stats = getInjectionStats(db);
    expect(stats.decisionsInjected).toBe(3);
    expect(stats.sessions).toBe(2);
    expect(stats.byEvent).toEqual({ SessionStart: 2, PreToolUse: 1 });
    expect(stats.estimatedTokensInjected).toBeGreaterThan(0);
  });

  it('keeps a file-scoped block under its budget constant', () => {
    expect(FILE_BUDGET).toBeLessThan(2000);
  });
});
