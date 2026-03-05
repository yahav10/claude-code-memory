import type Database from 'better-sqlite3';

interface ListRecentArgs {
  session?: string;
  limit?: number;
}

export function handleListRecent(
  db: Database.Database,
  currentSessionId: string,
  args: ListRecentArgs,
): { results: any[] } {
  const { session, limit = 10 } = args;
  const clamped = Math.max(1, Math.min(100, limit));

  if (session) {
    const results = db.prepare(`
      SELECT d.id, d.title, d.decision, d.created_at
      FROM decisions d
      WHERE d.session_id = ?
      ORDER BY d.created_at DESC
      LIMIT ?
    `).all(session, clamped);
    return { results };
  }

  const results = db.prepare(`
    SELECT d.id, d.title, d.decision, d.created_at, d.session_id
    FROM decisions d
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(clamped);
  return { results };
}
