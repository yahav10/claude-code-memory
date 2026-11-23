import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'node:child_process';
import {
  runInit,
  ensureHook,
  ensureSessionEndHook,
  installPushHooks,
  CAPTURE_COMMAND,
  CAPTURE_HOOK_TIMEOUT_SEC,
} from '../src/cli.js';

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

describe('SessionEnd capture hook', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-hook-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs the capture hook with a timeout above the 1.5s SessionEnd default', () => {
    ensureSessionEndHook(settingsPath);
    const hooks = readJson(settingsPath).hooks.SessionEnd;
    expect(hooks).toEqual([
      { hooks: [{ type: 'command', command: CAPTURE_COMMAND, timeout: CAPTURE_HOOK_TIMEOUT_SEC }] },
    ]);
  });

  it('is idempotent', () => {
    ensureSessionEndHook(settingsPath);
    ensureSessionEndHook(settingsPath);
    expect(readJson(settingsPath).hooks.SessionEnd).toHaveLength(1);
  });

  it('upgrades the pre-0.4.1 hook and keeps unrelated hooks and settings', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({
      model: 'opus',
      hooks: {
        SessionEnd: [
          { hooks: [{ type: 'command', command: 'npx claude-session-memory capture' }] },
          { hooks: [{ type: 'command', command: 'other-tool cleanup' }, { type: 'command', command: 'npx claude-session-memory capture' }] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 'notify' }] }],
      },
    }));

    ensureSessionEndHook(settingsPath);
    const settings = readJson(settingsPath);

    expect(settings.model).toBe('opus');
    expect(settings.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 'notify' }] }]);
    const commands = settings.hooks.SessionEnd.flatMap((g: any) => g.hooks.map((h: any) => h.command));
    expect(commands).toEqual(['other-tool cleanup', CAPTURE_COMMAND]);
    const ours = settings.hooks.SessionEnd.at(-1).hooks[0];
    expect(ours.timeout).toBe(CAPTURE_HOOK_TIMEOUT_SEC);
  });
});

describe('init --scope global', () => {
  let projectRoot: string;
  let fakeHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-proj-')));
    fs.mkdirSync(path.join(projectRoot, '.git'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-home-'));
    originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('registers a user-scope server through the registrar, not settings.json', () => {
    const calls: Array<{ name: string; config: any }> = [];
    runInit(projectRoot, {
      scope: 'global',
      force: false,
      registerUserMcp: (name, config) => calls.push({ name, config }),
    });

    const name = `project-memory-${path.basename(projectRoot)}`;
    expect(calls).toEqual([{
      name,
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['claude-session-memory', 'serve'],
        env: { PROJECT_ROOT: projectRoot },
      },
    }]);

    const settings = readJson(path.join(fakeHome, '.claude', 'settings.json'));
    expect(settings.mcpServers).toBeUndefined();
    expect(settings.hooks.SessionEnd).toHaveLength(1);
  });

  it('removes the dead mcpServers entry older versions wrote, keeping other servers', () => {
    const name = `project-memory-${path.basename(projectRoot)}`;
    const settingsPath = path.join(fakeHome, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      mcpServers: { [name]: { command: 'npx' }, unrelated: { command: 'x' } },
    }));

    runInit(projectRoot, { scope: 'global', force: false, registerUserMcp: () => {} });

    expect(readJson(settingsPath).mcpServers).toEqual({ unrelated: { command: 'x' } });
  });

  it('fails with a copy-pasteable manual command when registration fails', () => {
    expect(() => runInit(projectRoot, {
      scope: 'global',
      force: false,
      registerUserMcp: () => { throw new Error('spawn claude ENOENT'); },
    })).toThrow(/claude mcp add-json --scope user project-memory-/);
  });
});

describe('push hooks', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-push-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const events = () => Object.keys(readJson(settingsPath).hooks).sort();

  it('installs session start, edit, and compaction hooks but not per-prompt recall by default', () => {
    installPushHooks(settingsPath, { promptRecall: false });
    expect(events()).toEqual(['PostCompact', 'PreCompact', 'PreToolUse', 'SessionStart']);
    const pre = readJson(settingsPath).hooks.PreToolUse[0];
    expect(pre.matcher).toBe('Edit|Write|MultiEdit|NotebookEdit');
    expect(pre.hooks[0].command).toContain('claude-session-memory hook PreToolUse');
  });

  it('adds the per-prompt hook only when asked', () => {
    installPushHooks(settingsPath, { promptRecall: true });
    expect(events()).toContain('UserPromptSubmit');
  });

  it('is idempotent and keeps other tools\' hooks', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard' }] }] },
    }));
    installPushHooks(settingsPath, { promptRecall: false });
    installPushHooks(settingsPath, { promptRecall: false });
    const pre = readJson(settingsPath).hooks.PreToolUse;
    expect(pre).toHaveLength(2);
    expect(pre[0].hooks[0].command).toBe('my-guard');
    expect(readJson(settingsPath).hooks.SessionStart).toHaveLength(1);
  });

  it('replaces only its own hook for an event, not a foreign one on the same event', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: { SessionStart: [{ hooks: [
        { type: 'command', command: 'npx claude-session-memory hook SessionStart' },
        { type: 'command', command: 'other-tool start' },
      ] }] },
    }));
    ensureHook(settingsPath, { event: 'SessionStart', command: 'npx -y claude-session-memory hook SessionStart', timeout: 15 });
    const commands = readJson(settingsPath).hooks.SessionStart.flatMap((g: any) => g.hooks.map((h: any) => h.command));
    expect(commands).toEqual(['other-tool start', 'npx -y claude-session-memory hook SessionStart']);
  });

  it('refuses to touch a settings file it cannot parse instead of overwriting the user\'s other settings', () => {
    const broken = '{ "permissions": { "allow": ["Bash(npm test)"], } }';
    fs.writeFileSync(settingsPath, broken);
    expect(() => installPushHooks(settingsPath, { promptRecall: false })).toThrow(/settings\.json|could not parse/i);
    expect(() => ensureSessionEndHook(settingsPath)).toThrow();
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(broken);
  });

  describe('hook command launcher', () => {
    const run = (path_: string, stdin: string) => {
      installPushHooks(settingsPath, { promptRecall: false });
      const cmd = readJson(settingsPath).hooks.PreToolUse[0].hooks[0].command as string;
      return spawnSync('/bin/sh', ['-c', cmd], { input: stdin, env: { PATH: path_ }, encoding: 'utf-8' });
    };
    const fakeBin = (dir: string, name: string, body: string) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    };

    it('uses a globally installed claude-session-memory directly, passing the payload through', () => {
      const bin = path.join(tmpDir, 'global-bin');
      fakeBin(bin, 'claude-session-memory', 'echo "GLOBAL $@ $(cat)"');
      fakeBin(bin, 'npx', 'echo NPX');
      const res = run(`${bin}:/usr/bin:/bin`, 'payload-1');
      expect(res.stdout.trim()).toBe('GLOBAL hook PreToolUse payload-1');
    });

    it('falls back to npx --prefer-offline when it is not installed globally', () => {
      const bin = path.join(tmpDir, 'npx-only');
      fakeBin(bin, 'npx', 'echo "NPX $@ $(cat)"');
      const res = run(`${bin}:/usr/bin:/bin`, 'payload-2');
      expect(res.stdout.trim()).toBe('NPX --prefer-offline -y claude-session-memory hook PreToolUse payload-2');
    });
  });

  it('init installs push hooks and records the prompt-recall setting', () => {
    const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-initpush-')));
    fs.mkdirSync(path.join(projectRoot, '.git'));
    try {
      runInit(projectRoot, { scope: 'project', force: false });
      const settings = readJson(path.join(projectRoot, '.claude', 'settings.json'));
      expect(Object.keys(settings.hooks).sort()).toEqual(['PostCompact', 'PreCompact', 'PreToolUse', 'SessionEnd', 'SessionStart']);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('init --no-push-hooks installs only the capture hook', () => {
    const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-initnopush-')));
    fs.mkdirSync(path.join(projectRoot, '.git'));
    try {
      runInit(projectRoot, { scope: 'project', force: false, pushHooks: false });
      expect(Object.keys(readJson(path.join(projectRoot, '.claude', 'settings.json')).hooks)).toEqual(['SessionEnd']);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
