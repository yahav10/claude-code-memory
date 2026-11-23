import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { initDatabase, findProjectRootFrom } from './database.js';
import { detectCurrentWork } from './utils/session-intelligence.js';
import {
  FILE_BUDGET,
  PROMPT_BUDGET,
  SESSION_START_BUDGET,
  filterUnseen,
  recordInjection,
  renderBlock,
  resetInjections,
  selectForFile,
  selectForPrompt,
  selectForSessionStart,
} from './utils/injection.js';

// Claude Code hook entry points. Each runs as a short-lived process: read the payload, query the
// local DB, print JSON for Claude Code. They must never throw or block a session, so every path
// returns null (no output) on any problem.

export type HookEvent = 'SessionStart' | 'PreToolUse' | 'UserPromptSubmit' | 'PreCompact' | 'PostCompact';
export const HOOK_EVENTS: HookEvent[] = ['SessionStart', 'PreToolUse', 'UserPromptSubmit', 'PreCompact', 'PostCompact'];

export interface HookPayload {
  session_id?: string;
  cwd?: string;
  source?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
  prompt?: string;
  compact_summary?: string;
}

// Tools that modify a file; reading shouldn't trigger a push.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PROMPT_RECALL_TIMEOUT_MS = 10_000;

function additionalContext(event: HookEvent, text: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

function openProjectDb(payload: HookPayload): { db: Database.Database; root: string } | null {
  const root = process.env.PROJECT_ROOT || findProjectRootFrom(payload.cwd || process.cwd());
  const dbPath = path.join(root, '.claude', 'project-memory.db');
  if (!fs.existsSync(dbPath)) return null; // project not initialized
  return { db: initDatabase(dbPath), root };
}

function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value;
}

export function promptRecallEnabled(db: Database.Database): boolean {
  return process.env.CLAUDE_SESSION_MEMORY_PROMPT_RECALL === '1' || getSetting(db, 'prompt_recall') === 'on';
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

export async function runHook(event: HookEvent, payload: HookPayload, opts: { foreground?: boolean } = {}): Promise<string | null> {
  try {
    const project = openProjectDb(payload);
    if (!project) return null;
    const { db, root } = project;
    const sessionId = payload.session_id || 'no-session';

    try {
      switch (event) {
        case 'SessionStart': {
          // After compaction or /clear the model has lost earlier injections, so allow them again.
          if (payload.source === 'compact' || payload.source === 'clear') resetInjections(db, sessionId);
          const work = detectCurrentWork(root);
          const candidates = filterUnseen(db, sessionId, 'SessionStart', selectForSessionStart(db, {
            branch: work.branch,
            modifiedFiles: [...work.modifiedFiles, ...work.stagedFiles],
          }));
          const block = renderBlock('Project memory: decisions already made for this project. Honor them:', candidates, SESSION_START_BUDGET);
          if (!block) return null;
          recordInjection(db, sessionId, 'SessionStart', block.shown);
          return additionalContext(event, block.text);
        }

        case 'PreToolUse': {
          if (!payload.tool_name || !EDIT_TOOLS.has(payload.tool_name)) return null;
          const file = payload.tool_input?.file_path || payload.tool_input?.notebook_path;
          if (!file) return null;
          const candidates = filterUnseen(db, sessionId, 'PreToolUse', selectForFile(db, file, root));
          const rel = path.relative(root, path.isAbsolute(file) ? file : path.join(root, file));
          const block = renderBlock(`Decisions recorded for ${rel}. Respect them in this edit:`, candidates, FILE_BUDGET);
          if (!block) return null;
          recordInjection(db, sessionId, 'PreToolUse', block.shown);
          return additionalContext(event, block.text);
        }

        case 'UserPromptSubmit': {
          if (!payload.prompt || !promptRecallEnabled(db)) return null;
          const hits = await withTimeout(selectForPrompt(db, payload.prompt), PROMPT_RECALL_TIMEOUT_MS, []);
          const candidates = filterUnseen(db, sessionId, 'UserPromptSubmit', hits);
          const block = renderBlock('Project memory: decisions related to this request:', candidates, PROMPT_BUDGET);
          if (!block) return null;
          recordInjection(db, sessionId, 'UserPromptSubmit', block.shown);
          return additionalContext(event, block.text);
        }

        case 'PreCompact':
          // Plain stdout becomes extra instructions for the compaction summary.
          return 'When summarizing, keep every architectural or technical decision made in this conversation: what was chosen, why, and which alternatives were rejected.';

        case 'PostCompact': {
          const summary = payload.compact_summary;
          if (!summary) return null;
          if (!opts.foreground) {
            // Extraction calls an LLM; never make Claude Code wait for it.
            spawnDetachedHook('PostCompact', payload);
            return null;
          }
          const apiKey = getSetting(db, 'anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
          const { captureFromSummary } = await import('./import/capture.js');
          await captureFromSummary({ db, sessionId, summary, cwd: payload.cwd, apiKey });
          return null;
        }
      }
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function spawnDetachedHook(event: HookEvent, payload: HookPayload): void {
  const cli = fileURLToPath(new URL('./cli.js', import.meta.url));
  const child = spawn(process.execPath, [cli, 'hook', event, '--foreground'], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  child.stdin?.end(JSON.stringify(payload));
  child.unref();
}
