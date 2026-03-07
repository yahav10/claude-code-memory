import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runWorkspaceSetup } from '../src/workspace-setup.js';

describe('workspace-setup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-ws-')));

    // Create workspace root .mcp.json
    fs.writeFileSync(
      path.join(tmpDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'project-memory': {
            command: 'npx',
            args: ['claude-code-memory', 'serve'],
            env: { PROJECT_ROOT: tmpDir },
          },
        },
      }),
    );

    // Create sub-projects: some with .git, some without
    for (const name of ['project-a', 'project-b', 'project-c']) {
      const dir = path.join(tmpDir, name);
      fs.mkdirSync(dir);
      fs.mkdirSync(path.join(dir, '.git'));
    }

    // A directory without .git (should be ignored)
    fs.mkdirSync(path.join(tmpDir, 'docs'));

    // A regular file (should be ignored)
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Workspace');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates symlinks for all git sub-projects', () => {
    const result = runWorkspaceSetup(tmpDir);

    expect(result.linked).toContain('project-a');
    expect(result.linked).toContain('project-b');
    expect(result.linked).toContain('project-c');
    expect(result.linked).not.toContain('docs');

    for (const name of ['project-a', 'project-b', 'project-c']) {
      const mcpPath = path.join(tmpDir, name, '.mcp.json');
      expect(fs.lstatSync(mcpPath).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(mcpPath)).toBe('../.mcp.json');
    }
  });

  it('does not create symlink for directories without .git', () => {
    runWorkspaceSetup(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'docs', '.mcp.json'))).toBe(false);
  });

  it('skips sub-projects that already have a symlink', () => {
    // First run
    runWorkspaceSetup(tmpDir);
    // Second run — should skip all
    const result = runWorkspaceSetup(tmpDir);

    expect(result.linked).toHaveLength(0);
    expect(result.skipped).toContain('project-a');
    expect(result.skipped).toContain('project-b');
    expect(result.skipped).toContain('project-c');
  });

  it('skips sub-projects with existing real .mcp.json unless --force', () => {
    // Create a real .mcp.json in project-a
    fs.writeFileSync(path.join(tmpDir, 'project-a', '.mcp.json'), '{}');

    const result = runWorkspaceSetup(tmpDir);
    expect(result.skipped).toContain('project-a');
    expect(result.linked).toContain('project-b');

    // The real file should still be there, not replaced
    expect(fs.lstatSync(path.join(tmpDir, 'project-a', '.mcp.json')).isSymbolicLink()).toBe(false);
  });

  it('overwrites existing real .mcp.json with --force', () => {
    fs.writeFileSync(path.join(tmpDir, 'project-a', '.mcp.json'), '{}');

    const result = runWorkspaceSetup(tmpDir, { force: true });
    expect(result.linked).toContain('project-a');
    expect(fs.lstatSync(path.join(tmpDir, 'project-a', '.mcp.json')).isSymbolicLink()).toBe(true);
  });

  it('dry-run makes no changes', () => {
    const result = runWorkspaceSetup(tmpDir, { dryRun: true });

    expect(result.linked).toHaveLength(3);
    // No symlinks should actually exist
    for (const name of ['project-a', 'project-b', 'project-c']) {
      expect(fs.existsSync(path.join(tmpDir, name, '.mcp.json'))).toBe(false);
    }
  });

  it('creates .mcp.json at workspace root if missing', () => {
    // Remove the root .mcp.json
    fs.unlinkSync(path.join(tmpDir, '.mcp.json'));

    const result = runWorkspaceSetup(tmpDir);
    expect(result.mcpCreated).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.mcp.json'))).toBe(true);

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers['project-memory'].env.PROJECT_ROOT).toBe(tmpDir);
  });

  it('throws for non-existent directory', () => {
    expect(() => runWorkspaceSetup('/no/such/path')).toThrow(/not a directory/i);
  });
});
