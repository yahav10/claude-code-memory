import type Database from 'better-sqlite3';
import { findSimilarDecisions, type SimilarDecision } from '../utils/jaccard.js';

interface SaveDecisionArgs {
  title: string;
  decision: string;
  rationale: string;
  context?: string;
  alternatives?: string[];
  consequences?: string;
  files?: string[];
  tags?: string[];
}

export interface SaveDecisionResult {
  id: number;
  title: string;
  similarDecisions?: SimilarDecision[];
  autoSuperseded?: number[];
}

export function handleSaveDecision(
  db: Database.Database,
  sessionId: string,
  args: SaveDecisionArgs,
): SaveDecisionResult {
  const result = db.prepare(`
    INSERT INTO decisions (title, context, decision, rationale, alternatives, consequences, session_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    args.title,
    args.context || null,
    args.decision,
    args.rationale,
    args.alternatives ? JSON.stringify(args.alternatives) : null,
    args.consequences || null,
    sessionId,
    args.tags ? JSON.stringify(args.tags) : null,
  );

  const decisionId = result.lastInsertRowid as number;

  if (args.files && args.files.length > 0) {
    const insertFile = db.prepare(
      'INSERT OR IGNORE INTO decision_files (decision_id, file_path) VALUES (?, ?)',
    );
    for (const filePath of args.files) {
      insertFile.run(decisionId, filePath);
    }
  }

  db.prepare('UPDATE sessions SET decision_count = decision_count + 1 WHERE id = ?').run(sessionId);

  // Dedup: check for similar existing decisions
  const similar = findSimilarDecisions(db, args.title, args.decision, decisionId);
  const autoSuperseded: number[] = [];

  // Auto-supersede decisions with very high similarity (>0.8)
  for (const match of similar) {
    if (match.similarity > 0.8) {
      db.prepare(
        'UPDATE decisions SET status = ?, superseded_by = ? WHERE id = ?',
      ).run('superseded', decisionId, match.id);
      autoSuperseded.push(match.id);
    }
  }

  const warnings = similar.filter(m => m.similarity <= 0.8);

  return {
    id: decisionId,
    title: args.title,
    similarDecisions: warnings.length > 0 ? warnings : undefined,
    autoSuperseded: autoSuperseded.length > 0 ? autoSuperseded : undefined,
  };
}
