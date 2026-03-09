import type Database from 'better-sqlite3';
import { execSync } from 'child_process';

// --- Types ---

export interface LastSessionContext {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  branch: string | null;
  summary: string | null;
  decisionCount: number;
  decisions: { id: number; title: string; tags: string[] }[];
  affectedFiles: string[];
  hoursAgo: number;
}

export interface CurrentWorkContext {
  branch: string | null;
  modifiedFiles: string[];
  stagedFiles: string[];
  uncommittedChangeCount: number;
}

export interface RelevantDecision {
  id: number;
  title: string;
  decision: string;
  tags: string[];
  matchReason: string;
}

// --- Last Session ---

export function getLastSessionContext(db: Database.Database): LastSessionContext | null {
  const session = db.prepare(`
    SELECT id, started_at, ended_at, git_branch, summary, decision_count
    FROM sessions
    WHERE ended_at IS NOT NULL
    ORDER BY ended_at DESC
    LIMIT 1
  `).get() as { id: string; started_at: string; ended_at: string; git_branch: string | null; summary: string | null; decision_count: number } | undefined;

  if (!session) return null;

  const decisions = db.prepare(`
    SELECT d.id, d.title, d.tags
    FROM decisions d
    WHERE d.session_id = ?
    ORDER BY d.created_at DESC
  `).all(session.id) as { id: number; title: string; tags: string | null }[];

  const files = db.prepare(`
    SELECT DISTINCT df.file_path
    FROM decision_files df
    JOIN decisions d ON d.id = df.decision_id
    WHERE d.session_id = ?
  `).all(session.id) as { file_path: string }[];

  const endedMs = new Date(session.ended_at).getTime();
  const hoursAgo = Math.max(0, Math.round((Date.now() - endedMs) / (1000 * 60 * 60)));

  return {
    sessionId: session.id,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    branch: session.git_branch,
    summary: session.summary,
    decisionCount: session.decision_count,
    decisions: decisions.map(d => ({
      id: d.id,
      title: d.title,
      tags: d.tags ? JSON.parse(d.tags) : [],
    })),
    affectedFiles: files.map(f => f.file_path),
    hoursAgo,
  };
}

// --- Current Git Work ---

export function detectCurrentWork(projectRoot: string): CurrentWorkContext {
  const result: CurrentWorkContext = {
    branch: null,
    modifiedFiles: [],
    stagedFiles: [],
    uncommittedChangeCount: 0,
  };

  try {
    result.branch = execSync('git branch --show-current', { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim() || null;
  } catch { /* not a git repo */ }

  try {
    const modified = execSync('git diff --name-only', { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    result.modifiedFiles = modified ? modified.split('\n') : [];
  } catch { /* ignore */ }

  try {
    const staged = execSync('git diff --cached --name-only', { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    result.stagedFiles = staged ? staged.split('\n') : [];
  } catch { /* ignore */ }

  result.uncommittedChangeCount = result.modifiedFiles.length + result.stagedFiles.length;
  return result;
}

// --- Relevant Decisions ---

export function getRelevantDecisions(
  db: Database.Database,
  context: { branch?: string | null; modifiedFiles?: string[]; limit?: number },
): RelevantDecision[] {
  const limit = context.limit || 5;
  const allFiles = context.modifiedFiles || [];
  const results: RelevantDecision[] = [];
  const seenIds = new Set<number>();

  // Strategy 1: Decisions linked to currently modified files
  if (allFiles.length > 0) {
    for (const filePath of allFiles.slice(0, 20)) { // cap to avoid excessive queries
      const rows = db.prepare(`
        SELECT d.id, d.title, d.decision, d.tags, df.file_path
        FROM decisions d
        JOIN decision_files df ON d.id = df.decision_id
        WHERE d.status = 'active' AND df.file_path LIKE ?
        ORDER BY d.created_at DESC
        LIMIT 3
      `).all(`%${filePath}%`) as { id: number; title: string; decision: string; tags: string | null; file_path: string }[];

      for (const row of rows) {
        if (!seenIds.has(row.id) && results.length < limit) {
          seenIds.add(row.id);
          results.push({
            id: row.id,
            title: row.title,
            decision: row.decision,
            tags: row.tags ? JSON.parse(row.tags) : [],
            matchReason: `file:${row.file_path}`,
          });
        }
      }
    }
  }

  // Strategy 2: Match branch name keywords against tags
  if (context.branch && results.length < limit) {
    const keywords = context.branch
      .replace(/^(feature|fix|hotfix|bugfix|chore|release)\//i, '')
      .split(/[/\-_]/)
      .filter(k => k.length > 2);

    for (const keyword of keywords) {
      if (results.length >= limit) break;
      const rows = db.prepare(`
        SELECT d.id, d.title, d.decision, d.tags
        FROM decisions d
        WHERE d.status = 'active' AND d.tags LIKE ?
        ORDER BY d.created_at DESC
        LIMIT ?
      `).all(`%"${keyword}"%`, limit) as { id: number; title: string; decision: string; tags: string | null }[];

      for (const row of rows) {
        if (!seenIds.has(row.id) && results.length < limit) {
          seenIds.add(row.id);
          results.push({
            id: row.id,
            title: row.title,
            decision: row.decision,
            tags: row.tags ? JSON.parse(row.tags) : [],
            matchReason: `branch:${keyword}`,
          });
        }
      }
    }
  }

  // Strategy 3: Fallback to most recent active decisions
  if (results.length < limit) {
    const remaining = limit - results.length;
    const rows = db.prepare(`
      SELECT d.id, d.title, d.decision, d.tags
      FROM decisions d
      WHERE d.status = 'active'
      ORDER BY d.created_at DESC
      LIMIT ?
    `).all(remaining + seenIds.size) as { id: number; title: string; decision: string; tags: string | null }[];

    for (const row of rows) {
      if (!seenIds.has(row.id) && results.length < limit) {
        seenIds.add(row.id);
        results.push({
          id: row.id,
          title: row.title,
          decision: row.decision,
          tags: row.tags ? JSON.parse(row.tags) : [],
          matchReason: 'recent',
        });
      }
    }
  }

  return results.slice(0, limit);
}
