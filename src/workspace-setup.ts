import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceSetupOptions {
  dryRun?: boolean;
  force?: boolean;
}

export interface WorkspaceSetupResult {
  linked: string[];
  skipped: string[];
  mcpCreated: boolean;
}

export function runWorkspaceSetup(
  workspaceDir: string,
  options: WorkspaceSetupOptions = {},
): WorkspaceSetupResult {
  const absDir = path.resolve(workspaceDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }

  const mcpPath = path.join(absDir, '.mcp.json');
  let mcpCreated = false;

  // Ensure .mcp.json exists at workspace root
  if (!fs.existsSync(mcpPath)) {
    if (options.dryRun) {
      console.log(`Would create ${mcpPath}`);
      mcpCreated = true;
    } else {
      const config = {
        mcpServers: {
          'project-memory': {
            command: 'npx',
            args: ['claude-code-memory', 'serve'],
            env: { PROJECT_ROOT: absDir },
          },
        },
      };
      fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
      mcpCreated = true;
      console.log(`Created ${mcpPath}`);
    }
  }

  // Find sub-projects with .git
  const entries = fs.readdirSync(absDir);
  const linked: string[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(absDir, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;
    if (!fs.existsSync(path.join(entryPath, '.git'))) continue;

    const subMcpPath = path.join(entryPath, '.mcp.json');

    // Already a symlink — skip
    if (fs.existsSync(subMcpPath) && fs.lstatSync(subMcpPath).isSymbolicLink()) {
      skipped.push(entry);
      continue;
    }

    // Real file exists — skip unless force
    if (fs.existsSync(subMcpPath)) {
      if (!options.force) {
        skipped.push(entry);
        if (!options.dryRun) {
          console.log(`  Skipped ${entry}/ (has own .mcp.json, use --force to overwrite)`);
        }
        continue;
      }
      if (!options.dryRun) {
        fs.unlinkSync(subMcpPath);
      }
    }

    if (options.dryRun) {
      console.log(`  Would link: ${entry}/.mcp.json → ../.mcp.json`);
    } else {
      fs.symlinkSync('../.mcp.json', subMcpPath);
      console.log(`  Linked: ${entry}/`);
    }
    linked.push(entry);
  }

  // Summary
  console.log(`\n${options.dryRun ? 'Dry run — ' : ''}${linked.length} sub-projects linked, ${skipped.length} skipped`);

  return { linked, skipped, mcpCreated };
}
