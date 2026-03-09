import type Database from 'better-sqlite3';
import { execSync } from 'child_process';

export interface SessionReviewResult {
  decisionsThisSession: { id: number; title: string }[];
  decisionCount: number;
  filesChangedDuringSession: string[];
  filesWithoutDecisions: string[];
  filesWithExistingDecisions: { filePath: string; decisions: { id: number; title: string }[] }[];
  suggestions: string[];
}

export function handleReviewSession(
  db: Database.Database,
  sessionId: string,
  projectRoot: string,
): SessionReviewResult {
  // 1. Decisions this session
  const decisions = db.prepare(`
    SELECT id, title FROM decisions WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as { id: number; title: string }[];

  // 2. Files changed (uncommitted + staged)
  let changedFiles: string[] = [];
  try {
    const modified = execSync('git diff --name-only', { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const staged = execSync('git diff --cached --name-only', { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const all = [...(modified ? modified.split('\n') : []), ...(staged ? staged.split('\n') : [])];
    changedFiles = [...new Set(all)];
  } catch { /* not a git repo */ }

  // 3. Classify changed files
  const filesWithoutDecisions: string[] = [];
  const filesWithExistingDecisions: { filePath: string; decisions: { id: number; title: string }[] }[] = [];

  for (const filePath of changedFiles) {
    const existing = db.prepare(`
      SELECT d.id, d.title
      FROM decisions d
      JOIN decision_files df ON d.id = df.decision_id
      WHERE df.file_path LIKE ? AND d.status = 'active'
    `).all(`%${filePath}%`) as { id: number; title: string }[];

    if (existing.length > 0) {
      filesWithExistingDecisions.push({ filePath, decisions: existing });
    } else {
      filesWithoutDecisions.push(filePath);
    }
  }

  // 4. Build suggestions
  const suggestions: string[] = [];
  if (decisions.length === 0 && changedFiles.length > 0) {
    suggestions.push('No decisions were saved this session despite file changes. Consider documenting key choices.');
  }
  if (filesWithoutDecisions.length > 0) {
    suggestions.push(`Consider saving decisions for: ${filesWithoutDecisions.join(', ')}`);
  }
  for (const f of filesWithExistingDecisions) {
    suggestions.push(
      `${f.filePath} has existing decision(s): ${f.decisions.map(d => `#${d.id} "${d.title}"`).join(', ')} — consider updating if behavior changed`,
    );
  }

  return {
    decisionsThisSession: decisions,
    decisionCount: decisions.length,
    filesChangedDuringSession: changedFiles,
    filesWithoutDecisions,
    filesWithExistingDecisions,
    suggestions,
  };
}
