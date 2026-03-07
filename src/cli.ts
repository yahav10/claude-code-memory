#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'node:readline';
import { fileURLToPath } from 'url';
import { initDatabase, findProjectRoot } from './database.js';
import { handleGetStats } from './tools/get-stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Init ---

interface InitOptions {
  scope: 'project' | 'global';
  force: boolean;
}

export function runInit(projectRoot: string, options: InitOptions): void {
  const claudeDir = path.join(projectRoot, '.claude');
  const dbPath = path.join(claudeDir, 'project-memory.db');
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');

  // Check existing init
  if (!options.force && fs.existsSync(dbPath) && fs.existsSync(mcpJsonPath)) {
    throw new Error('Already initialized. Use --force to reinitialize.');
  }

  // 1. Create .claude directory
  fs.mkdirSync(claudeDir, { recursive: true });

  // 2. Initialize database
  const db = initDatabase(dbPath);
  db.close();

  // 3. Create .gitignore
  const gitignorePath = path.join(claudeDir, '.gitignore');
  fs.writeFileSync(gitignorePath, '*.db\n*.db-journal\n*.db-wal\n*.db-shm\n');

  // 4. Write MCP server registration
  if (options.scope === 'project') {
    const mcpConfig: any = {};
    if (fs.existsSync(mcpJsonPath)) {
      try {
        Object.assign(mcpConfig, JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8')));
      } catch { /* start fresh */ }
    }
    if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    mcpConfig.mcpServers['project-memory'] = {
      command: 'npx',
      args: ['claude-code-memory', 'serve'],
      env: { PROJECT_ROOT: projectRoot },
    };
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  } else {
    const globalSettingsDir = path.join(process.env.HOME || '~', '.claude');
    fs.mkdirSync(globalSettingsDir, { recursive: true });
    const settingsPath = path.join(globalSettingsDir, 'settings.json');
    const settings: any = {};
    if (fs.existsSync(settingsPath)) {
      try {
        Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath, 'utf-8')));
      } catch { /* start fresh */ }
    }
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers[`project-memory-${path.basename(projectRoot)}`] = {
      command: 'npx',
      args: ['claude-code-memory', 'serve'],
      env: { PROJECT_ROOT: projectRoot },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  // 5. Create memory-instructions.md
  const templatePath = path.join(__dirname, '..', 'templates', 'memory-instructions.md');
  const instructionsPath = path.join(claudeDir, 'memory-instructions.md');
  fs.copyFileSync(templatePath, instructionsPath);

  // 6. Update CLAUDE.md
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  const snippetPath = path.join(__dirname, '..', 'templates', 'claude-md-snippet.md');
  const snippet = fs.readFileSync(snippetPath, 'utf-8');

  if (fs.existsSync(claudeMdPath)) {
    const existing = fs.readFileSync(claudeMdPath, 'utf-8');
    if (!existing.includes('## Project Memory')) {
      fs.appendFileSync(claudeMdPath, '\n\n' + snippet);
    }
  } else {
    fs.writeFileSync(claudeMdPath, `# ${path.basename(projectRoot)}\n\n${snippet}`);
  }
}

// --- Export ---

export function runExport(projectRoot: string, format: string, outputPath?: string): void {
  const dbPath = path.join(projectRoot, '.claude', 'project-memory.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error('No project memory database found. Run "claude-code-memory init" first.');
  }

  const db = initDatabase(dbPath);

  const decisions = db.prepare(`
    SELECT d.*, GROUP_CONCAT(df.file_path, ';') as files
    FROM decisions d
    LEFT JOIN decision_files df ON d.id = df.decision_id
    GROUP BY d.id
    ORDER BY d.created_at
  `).all() as any[];

  const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at').all();

  const ext = format === 'markdown' ? 'md' : format;
  const outPath = outputPath || `project-memory-export.${ext}`;

  if (format === 'json') {
    const data = { version: '1.0', exported_at: new Date().toISOString(), decisions, sessions };
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  } else if (format === 'markdown') {
    let md = '# Project Memory Export\n\n';
    md += `Exported: ${new Date().toISOString()}\n\n`;

    for (const status of ['active', 'deprecated', 'superseded']) {
      const filtered = decisions.filter(d => d.status === status);
      if (filtered.length === 0) continue;
      md += `## ${status.charAt(0).toUpperCase() + status.slice(1)} Decisions\n\n`;
      for (const d of filtered) {
        md += `### ${d.title}\n`;
        md += `**Decision**: ${d.decision}\n`;
        md += `**Rationale**: ${d.rationale}\n`;
        if (d.alternatives) md += `**Alternatives**: ${d.alternatives}\n`;
        if (d.consequences) md += `**Consequences**: ${d.consequences}\n`;
        if (d.files) md += `**Files**: ${d.files}\n`;
        if (d.tags) md += `**Tags**: ${d.tags}\n`;
        md += `**Date**: ${d.created_at}\n\n`;
      }
    }
    fs.writeFileSync(outPath, md);
  } else if (format === 'csv') {
    const headers = 'id,title,context,decision,rationale,alternatives,consequences,status,tags,files,created_at,session_id';
    const rows = decisions.map(d => {
      const fields = [
        d.id, d.title, d.context || '', d.decision, d.rationale,
        (d.alternatives || '').replace(/"/g, '""'),
        d.consequences || '', d.status,
        (d.tags || '').replace(/"/g, '""'),
        d.files || '', d.created_at, d.session_id || '',
      ];
      return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',');
    });
    fs.writeFileSync(outPath, headers + '\n' + rows.join('\n'));
  }

  db.close();
  console.log(`Exported ${decisions.length} decisions to ${outPath}`);
}

// --- Import ---

export function runImport(projectRoot: string, filePath: string): void {
  const dbPath = path.join(projectRoot, '.claude', 'project-memory.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error('No project memory database found. Run "claude-code-memory init" first.');
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON file');
  }

  if (!data.version || !Array.isArray(data.decisions)) {
    throw new Error('Invalid export format: missing version or decisions array');
  }

  const db = initDatabase(dbPath);
  let imported = 0;
  let skipped = 0;

  // Import sessions
  if (Array.isArray(data.sessions)) {
    const insertSession = db.prepare(`
      INSERT OR IGNORE INTO sessions (id, started_at, ended_at, summary, decision_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const s of data.sessions) {
      insertSession.run(s.id, s.started_at, s.ended_at, s.summary, s.decision_count || 0);
    }
  }

  // Import decisions
  const findDuplicate = db.prepare(
    'SELECT id FROM decisions WHERE title = ? AND decision = ? AND created_at = ?'
  );
  const insertDecision = db.prepare(`
    INSERT INTO decisions (title, context, decision, rationale, alternatives, consequences, status, superseded_by, created_at, created_by, session_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFile = db.prepare(
    'INSERT OR IGNORE INTO decision_files (decision_id, file_path) VALUES (?, ?)'
  );

  for (const d of data.decisions) {
    const existing = findDuplicate.get(d.title, d.decision, d.created_at);
    if (existing) {
      skipped++;
      continue;
    }

    const result = insertDecision.run(
      d.title, d.context, d.decision, d.rationale, d.alternatives,
      d.consequences, d.status || 'active', d.superseded_by,
      d.created_at, d.created_by, d.session_id, d.tags,
    );

    // Import file links
    if (d.files && typeof d.files === 'string') {
      for (const fp of d.files.split(';')) {
        if (fp.trim()) insertFile.run(result.lastInsertRowid, fp.trim());
      }
    }

    imported++;
  }

  db.close();
  console.log(`Imported ${imported} decisions, skipped ${skipped} duplicates.`);
}

// --- Stats ---

export function runStats(projectRoot: string): void {
  const dbPath = path.join(projectRoot, '.claude', 'project-memory.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error('No project memory database found. Run "claude-code-memory init" first.');
  }

  const db = initDatabase(dbPath);
  const stats = handleGetStats(db);
  db.close();

  console.log('Project Memory Statistics');
  console.log('─'.repeat(40));
  let line = `Decisions:  ${stats.totalDecisions} total`;
  if (stats.totalDecisions > 0) {
    line += ` (${stats.active} active, ${stats.deprecated} deprecated, ${stats.superseded} superseded)`;
  }
  console.log(line);
  console.log(`Sessions:   ${stats.totalSessions}`);
  console.log(`Last activity: ${stats.lastActivity || 'none'}`);
  if (stats.topTags.length > 0) {
    console.log(`Top tags:   ${stats.topTags.map(t => `${t.tag} (${t.count})`).join(', ')}`);
  }
}

// --- CLI Entry Point ---

async function promptChoice(question: string, choices: string[], defaultIdx: number): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const choiceStr = choices.map((c, i) => `${i === defaultIdx ? `[${c}]` : c}`).join(' / ');
  return new Promise((resolve) => {
    rl.question(`${question} ${choiceStr}: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) return resolve(choices[defaultIdx]);
      const match = choices.find(c => c.toLowerCase().startsWith(trimmed));
      resolve(match || choices[defaultIdx]);
    });
  });
}

const program = new Command();

program
  .name('claude-code-memory')
  .description('Persistent project memory for Claude Code')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize project memory in the current project')
  .option('--force', 'Force reinitialize even if already set up', false)
  .option('--scope <scope>', 'MCP registration scope: project or global')
  .action(async (opts) => {
    const projectRoot = findProjectRoot();
    let scope = opts.scope;

    if (!scope) {
      scope = await promptChoice(
        'MCP server registration scope?',
        ['project', 'global'],
        0,
      );
    }

    try {
      runInit(projectRoot, { scope, force: opts.force });
      console.log('\nProject memory initialized successfully!');
      console.log(`  Database: ${path.join(projectRoot, '.claude', 'project-memory.db')}`);
      console.log(`  MCP config: ${scope === 'project' ? '.mcp.json' : '~/.claude/settings.json'}`);
      console.log('\n  Restart Claude Code to activate the memory system.');
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export decisions to a file')
  .option('--format <format>', 'Output format: json, markdown, csv', 'json')
  .option('--output <path>', 'Output file path')
  .action((opts) => {
    try {
      runExport(findProjectRoot(), opts.format, opts.output);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('import <file>')
  .description('Import decisions from a JSON export file')
  .action((file) => {
    try {
      runImport(findProjectRoot(), file);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show project memory statistics')
  .action(() => {
    try {
      runStats(findProjectRoot());
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('web')
  .description('Start the web dashboard')
  .option('-p, --port <number>', 'Server port', '3847')
  .option('--no-open', 'Do not auto-open browser')
  .action(async (opts) => {
    const { startWebServer } = await import('./web/server.js');

    const root = findProjectRoot();
    const dbPath = path.join(root, '.claude', 'project-memory.db');
    const db = initDatabase(dbPath);

    await startWebServer({ db, dbPath }, {
      port: parseInt(opts.port, 10),
      open: opts.open !== false,
    });
  });

program
  .command('import-sessions')
  .description('Import past Claude Code sessions from JSONL files')
  .option('--dry-run', 'Show what would be imported without writing to DB')
  .option('--skip-extraction', 'Only import session metadata, skip AI decision extraction')
  .option('--api-key <key>', 'Anthropic API key (defaults to ANTHROPIC_API_KEY)')
  .option('--concurrency <n>', 'Parallel AI extraction requests', '3')
  .action(async (opts) => {
    const root = findProjectRoot();
    const dbPath = path.join(root, '.claude', 'project-memory.db');
    const db = initDatabase(dbPath);

    const homeDir = process.env.HOME || os.homedir();
    const projectsDir = path.join(homeDir, '.claude', 'projects');

    if (opts.dryRun) {
      const { scanForSessions } = await import('./import/scanner.js');
      const existingRows = db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
      const importedIds = new Set(existingRows.map(r => r.id));
      const result = await scanForSessions(projectsDir, importedIds);

      console.log(`\nScan Results:`);
      console.log(`  Total sessions found: ${result.totalFound}`);
      console.log(`  New (not yet imported): ${result.newSessions}`);
      console.log(`  Already imported: ${result.alreadyImported}`);
      console.log(`\nProjects:`);
      for (const p of result.projects) {
        console.log(`  ${p.dirName}: ${p.sessionCount} sessions (${p.newCount} new)`);
      }
      db.close();
      return;
    }

    const { runImportPipeline } = await import('./import/pipeline.js');
    await runImportPipeline({
      db,
      projectsDir,
      skipExtraction: opts.skipExtraction,
      concurrency: parseInt(opts.concurrency, 10),
      apiKey: opts.apiKey,
      onProgress: (p) => {
        if (p.phase === 'scan') console.log(p.message);
        else if (p.phase === 'metadata') process.stdout.write(`\r  Importing sessions... ${p.current}/${p.total}`);
        else if (p.phase === 'extraction') process.stdout.write(`\r  Extracting decisions... ${p.current}/${p.total}`);
        else if (p.phase === 'done') {
          console.log(`\n\n  Import complete: ${p.sessionsImported} sessions, ${p.decisionsExtracted} decisions added.`);
        }
      },
    });

    db.close();
  });

program
  .command('workspace-setup [dir]')
  .description('Set up shared context memory across all sub-projects in a workspace')
  .option('--dry-run', 'Show what would be linked without making changes')
  .option('--force', 'Overwrite existing .mcp.json in sub-projects')
  .action(async (dir, opts) => {
    const { runWorkspaceSetup } = await import('./workspace-setup.js');
    try {
      runWorkspaceSetup(dir || process.cwd(), opts);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('sync-claudemd')
  .description('Sync active decisions into CLAUDE.md')
  .action(async () => {
    try {
      const root = findProjectRoot();
      const dbPath = path.join(root, '.claude', 'project-memory.db');
      if (!fs.existsSync(dbPath)) {
        throw new Error('No project memory database found. Run "claude-code-memory init" first.');
      }
      const db = initDatabase(dbPath);
      const { syncClaudeMd } = await import('./utils/claudemd-sync.js');
      const result = syncClaudeMd(root, db);
      db.close();

      console.log(`CLAUDE.md updated with ${result.decisionsCount} active decision(s)`);
      console.log(`  Path: ${path.join(root, 'CLAUDE.md')}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start the MCP server (called by Claude Code)')
  .action(async () => {
    // Dynamic import to avoid loading MCP SDK for other commands
    await import('./server.js');
  });

// Only parse when run as CLI entry point (not when imported in tests)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/cli.js') ||
  process.argv[1].endsWith('/claude-code-memory')
);
if (isMainModule) {
  program.parse();
}
