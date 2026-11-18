import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  runInit,
  ensureSessionEndHook,
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
