import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type Database from 'better-sqlite3';
import { initDatabase } from '../../src/database.js';
import { handleSaveDecision } from '../../src/tools/save-decision.js';
import { generateDecisionsSection, syncClaudeMd } from '../../src/utils/claudemd-sync.js';

describe('generateDecisionsSection', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-sync-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates correct markdown from decisions', () => {
    handleSaveDecision(db, 's1', {
      title: 'Use JWT for auth',
      decision: 'JWT tokens for stateless auth',
      rationale: 'Scalable',
      tags: ['auth', 'security'],
    });
    handleSaveDecision(db, 's1', {
      title: 'Use PostgreSQL',
      decision: 'PostgreSQL for persistence',
      rationale: 'ACID compliance',
      tags: ['database'],
    });

    const section = generateDecisionsSection(db);
    expect(section).toContain('<!-- DECISIONS:START -->');
    expect(section).toContain('<!-- DECISIONS:END -->');
    expect(section).toContain('## Architectural Decisions');
    expect(section).toContain('2 active decisions');
    expect(section).toContain('### Auth');
    expect(section).toContain('**Use JWT for auth**');
    expect(section).toContain('[auth, security]');
    expect(section).toContain('### Database');
    expect(section).toContain('**Use PostgreSQL**');
  });

  it('groups untagged decisions under General', () => {
    handleSaveDecision(db, 's1', {
      title: 'No tags decision',
      decision: 'Something',
      rationale: 'Reason',
    });

    const section = generateDecisionsSection(db);
    expect(section).toContain('### General');
  });

  it('excludes low-confidence decisions', () => {
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, tags, session_id, confidence)
      VALUES ('Faded', 'Old thing', 'Was needed', '["temporary"]', 's1', 0.1)
    `).run();
    handleSaveDecision(db, 's1', {
      title: 'Active',
      decision: 'Current thing',
      rationale: 'Needed now',
      tags: ['auth'],
    });

    const section = generateDecisionsSection(db);
    expect(section).not.toContain('Faded');
    expect(section).toContain('Active');
    expect(section).toContain('1 active decision');
  });

  it('excludes deprecated and superseded decisions', () => {
    handleSaveDecision(db, 's1', {
      title: 'Active one',
      decision: 'Good',
      rationale: 'Yes',
    });
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id, status)
      VALUES ('Deprecated', 'Old', 'No longer', 's1', 'deprecated')
    `).run();

    const section = generateDecisionsSection(db);
    expect(section).toContain('Active one');
    expect(section).not.toContain('Deprecated');
  });

  it('returns minimal section for empty decisions', () => {
    const section = generateDecisionsSection(db);
    expect(section).toContain('<!-- DECISIONS:START -->');
    expect(section).toContain('No active decisions recorded yet');
    expect(section).toContain('<!-- DECISIONS:END -->');
  });
});

describe('syncClaudeMd', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-claudemd-')));
    db = initDatabase(path.join(tmpDir, 'test.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates CLAUDE.md if none exists', () => {
    handleSaveDecision(db, 's1', {
      title: 'Use JWT',
      decision: 'JWT auth',
      rationale: 'Scalable',
      tags: ['auth'],
    });

    const result = syncClaudeMd(tmpDir, db);
    expect(result.updated).toBe(true);
    expect(result.decisionsCount).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- DECISIONS:START -->');
    expect(content).toContain('Use JWT');
    expect(content).toContain('<!-- DECISIONS:END -->');
  });

  it('injects between markers in existing CLAUDE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# My Project\n\nManual content.\n\n<!-- DECISIONS:START -->\nold stuff\n<!-- DECISIONS:END -->\n\nMore manual content.\n',
    );

    handleSaveDecision(db, 's1', {
      title: 'New decision',
      decision: 'Something new',
      rationale: 'Because',
    });

    syncClaudeMd(tmpDir, db);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('Manual content.');
    expect(content).toContain('More manual content.');
    expect(content).toContain('New decision');
    expect(content).not.toContain('old stuff');
  });

  it('appends markers if CLAUDE.md has no markers', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# My Project\n\nExisting content.\n');

    handleSaveDecision(db, 's1', {
      title: 'Use Prisma',
      decision: 'Prisma ORM',
      rationale: 'TypeScript',
      tags: ['database'],
    });

    syncClaudeMd(tmpDir, db);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('Existing content.');
    expect(content).toContain('<!-- DECISIONS:START -->');
    expect(content).toContain('Use Prisma');
  });
});
