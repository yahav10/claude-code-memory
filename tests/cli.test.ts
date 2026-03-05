import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runInit, runExport, runImport } from '../src/cli.js';
import { initDatabase } from '../src/database.js';

describe('CLI init', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-cli-')));
    fs.mkdirSync(path.join(tmpDir, '.git'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .claude directory', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(true);
  });

  it('creates database file', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'project-memory.db'))).toBe(true);
  });

  it('creates .gitignore in .claude/', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    const gitignore = fs.readFileSync(path.join(tmpDir, '.claude', '.gitignore'), 'utf-8');
    expect(gitignore).toContain('*.db');
    expect(gitignore).toContain('*.db-wal');
  });

  it('creates .mcp.json for project scope', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    expect(fs.existsSync(path.join(tmpDir, '.mcp.json'))).toBe(true);

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers['project-memory']).toBeDefined();
    expect(config.mcpServers['project-memory'].command).toBe('npx');
  });

  it('creates memory-instructions.md', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'memory-instructions.md'))).toBe(true);
  });

  it('creates CLAUDE.md with project memory section', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('## Project Memory');
    expect(content).toContain('save_decision');
  });

  it('appends to existing CLAUDE.md without duplicating', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# My Project\n\nExisting content.\n');
    runInit(tmpDir, { scope: 'project', force: false });

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('## Project Memory');

    // Run again — should not duplicate
    runInit(tmpDir, { scope: 'project', force: true });
    const content2 = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    const matches = content2.match(/## Project Memory/g);
    expect(matches?.length).toBe(1);
  });

  it('detects existing init and refuses without --force', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    expect(() => runInit(tmpDir, { scope: 'project', force: false })).toThrow(/already initialized/i);
  });

  it('allows re-init with --force', () => {
    runInit(tmpDir, { scope: 'project', force: false });
    expect(() => runInit(tmpDir, { scope: 'project', force: true })).not.toThrow();
  });
});

describe('CLI export', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-export-')));
    fs.mkdirSync(path.join(tmpDir, '.git'));
    runInit(tmpDir, { scope: 'project', force: false });

    // Add test data
    const db = initDatabase(path.join(tmpDir, '.claude', 'project-memory.db'));
    db.prepare("INSERT INTO sessions (id) VALUES ('s1')").run();
    db.prepare(`
      INSERT INTO decisions (title, decision, rationale, session_id, tags)
      VALUES ('Use JWT', 'JWT tokens', 'Stateless', 's1', '["auth"]')
    `).run();
    db.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports to JSON', () => {
    const outPath = path.join(tmpDir, 'export.json');
    runExport(tmpDir, 'json', outPath);
    const data = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(data.version).toBe('1.0');
    expect(data.decisions.length).toBeGreaterThan(0);
  });

  it('exports to Markdown', () => {
    const outPath = path.join(tmpDir, 'export.md');
    runExport(tmpDir, 'markdown', outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content).toContain('Use JWT');
  });

  it('exports to CSV', () => {
    const outPath = path.join(tmpDir, 'export.csv');
    runExport(tmpDir, 'csv', outPath);
    const content = fs.readFileSync(outPath, 'utf-8');
    expect(content).toContain('id,title');
    expect(content).toContain('Use JWT');
  });
});

describe('CLI import', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-import-')));
    fs.mkdirSync(path.join(tmpDir, '.git'));
    runInit(tmpDir, { scope: 'project', force: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports from JSON export', () => {
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      decisions: [{
        title: 'Use JWT',
        decision: 'JWT tokens',
        rationale: 'Stateless',
        created_at: '2026-01-01 00:00:00',
        status: 'active',
      }],
      sessions: [],
    };
    const importPath = path.join(tmpDir, 'import.json');
    fs.writeFileSync(importPath, JSON.stringify(exportData));

    runImport(tmpDir, importPath);

    const db = initDatabase(path.join(tmpDir, '.claude', 'project-memory.db'));
    const count = db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });

  it('skips duplicates on re-import', () => {
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      decisions: [{
        title: 'Use JWT',
        decision: 'JWT tokens',
        rationale: 'Stateless',
        created_at: '2026-01-01 00:00:00',
        status: 'active',
      }],
      sessions: [],
    };
    const importPath = path.join(tmpDir, 'import.json');
    fs.writeFileSync(importPath, JSON.stringify(exportData));

    runImport(tmpDir, importPath);
    runImport(tmpDir, importPath);

    const db = initDatabase(path.join(tmpDir, '.claude', 'project-memory.db'));
    const count = db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });
});
