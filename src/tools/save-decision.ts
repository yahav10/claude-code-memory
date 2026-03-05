import type Database from 'better-sqlite3';

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

export function handleSaveDecision(
  db: Database.Database,
  sessionId: string,
  args: SaveDecisionArgs,
): { id: number; title: string } {
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

  return { id: decisionId, title: args.title };
}
