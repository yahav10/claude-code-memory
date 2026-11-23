import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'node:child_process';
import { initDatabase } from '../src/database.js';
import { runHook } from '../src/hooks.js';

let root: string;
const SESSION = 'sess-1';

function seed(): void {
  const db = initDatabase(path.join(root, '.claude', 'project-memory.db'));
  const res = db.prepare(
    "INSERT INTO decisions (title, decision, rationale, tags) VALUES ('Use JWT', 'Stateless JWT for auth', 'Services must stay stateless', '[\"auth\"]')",
  ).run();
  db.prepare('INSERT INTO decision_files (decision_id, file_path) VALUES (?, ?)').run(res.lastInsertRowid, 'src/auth.ts');
  db.close();
}

const parse = (out: string | null) => JSON.parse(out!).hookSpecificOutput;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-hooks-')));
  fs.mkdirSync(path.join(root, '.claude'));
  execSync('git init -q', { cwd: root });
  seed();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.CLAUDE_SESSION_MEMORY_PROMPT_RECALL;
});

describe('SessionStart', () => {
  it('injects relevant decisions as additionalContext', async () => {
    const out = parse(await runHook('SessionStart', { session_id: SESSION, cwd: root, source: 'startup' }));
    expect(out.hookEventName).toBe('SessionStart');
    expect(out.additionalContext).toContain('Use JWT');
    expect(out.additionalContext).toContain('get_decisions');
  });

  it('does not repeat itself within a session, but does after compaction', async () => {
    expect(await runHook('SessionStart', { session_id: SESSION, cwd: root, source: 'startup' })).not.toBeNull();
    expect(await runHook('SessionStart', { session_id: SESSION, cwd: root, source: 'resume' })).toBeNull();
    expect(await runHook('SessionStart', { session_id: SESSION, cwd: root, source: 'compact' })).not.toBeNull();
  });

  it('prints nothing when the project has no memory database', async () => {
    const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-bare-')));
    try {
      expect(await runHook('SessionStart', { session_id: SESSION, cwd: bare })).toBeNull();
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it('prints nothing when there are no decisions', async () => {
    const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-empty-')));
    fs.mkdirSync(path.join(empty, '.claude'));
    initDatabase(path.join(empty, '.claude', 'project-memory.db')).close();
    try {
      expect(await runHook('SessionStart', { session_id: SESSION, cwd: empty })).toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('PreToolUse', () => {
  const edit = (file: string, tool = 'Edit') => ({
    session_id: SESSION, cwd: root, tool_name: tool, tool_input: { file_path: file },
  });

  it('injects the decisions for the file about to be edited, once', async () => {
    const first = parse(await runHook('PreToolUse', edit(path.join(root, 'src/auth.ts'))));
    expect(first.hookEventName).toBe('PreToolUse');
    expect(first.additionalContext).toContain('src/auth.ts');
    expect(first.additionalContext).toContain('Use JWT');
    expect(await runHook('PreToolUse', edit(path.join(root, 'src/auth.ts')))).toBeNull();
  });

  it('still injects before an edit when session start already showed the same decision', async () => {
    expect(await runHook('SessionStart', { session_id: SESSION, cwd: root, source: 'startup' })).not.toBeNull();
    const out = parse(await runHook('PreToolUse', edit(path.join(root, 'src/auth.ts'))));
    expect(out.additionalContext).toContain('Use JWT');
  });

  it('stays quiet for files with no decisions and for read-only tools', async () => {
    expect(await runHook('PreToolUse', edit(path.join(root, 'src/unrelated.ts')))).toBeNull();
    expect(await runHook('PreToolUse', edit(path.join(root, 'src/auth.ts'), 'Read'))).toBeNull();
    expect(await runHook('PreToolUse', { session_id: SESSION, cwd: root, tool_name: 'Bash', tool_input: {} })).toBeNull();
  });
});

describe('UserPromptSubmit', () => {
  it('does nothing unless prompt recall is switched on', async () => {
    const prompt = 'How should authentication work for the new service endpoints?';
    expect(await runHook('UserPromptSubmit', { session_id: SESSION, cwd: root, prompt })).toBeNull();
  });
});

describe('compaction hooks', () => {
  it('PreCompact asks the summary to keep decisions', async () => {
    const out = await runHook('PreCompact', { session_id: SESSION, cwd: root });
    expect(out).toMatch(/decision/i);
  });

  it('PostCompact without a summary does nothing', async () => {
    expect(await runHook('PostCompact', { session_id: SESSION, cwd: root })).toBeNull();
  });
});

describe('failure handling', () => {
  it('never throws on a corrupt database', async () => {
    fs.writeFileSync(path.join(root, '.claude', 'project-memory.db'), 'not a database');
    await expect(runHook('SessionStart', { session_id: SESSION, cwd: root })).resolves.toBeNull();
  });
});
