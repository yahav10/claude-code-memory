import type Database from 'better-sqlite3';

export interface LazySession {
  readonly id: string;
  /** True once the session row exists (i.e. a tool was actually used). */
  readonly started: boolean;
  /** Create the session row on first use. Safe to call from every tool handler. */
  ensure(): void;
}

/**
 * Claude Code starts the MCP server for every session, including ones that never touch memory.
 * Creating the row eagerly left one empty session per launch (thousands in long-lived projects),
 * which skewed stats and buried real sessions. The row is now created on first tool use.
 */
export function createLazySession(
  db: Database.Database,
  id: string,
  getContext: () => { branch: string | null; projectPath: string | null },
): LazySession {
  let started = false;
  return {
    id,
    get started() {
      return started;
    },
    ensure() {
      if (started) return;
      db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').run(id);
      try {
        const { branch, projectPath } = getContext();
        if (branch || projectPath) {
          db.prepare('UPDATE sessions SET git_branch = ?, project_path = ? WHERE id = ?')
            .run(branch, projectPath, id);
        }
      } catch { /* git context is non-critical */ }
      started = true;
    },
  };
}
