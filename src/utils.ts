import * as crypto from 'crypto';
import type Database from 'better-sqlite3';

export function generateSessionId(): string {
  return `session_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function sanitizeFtsQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '';
  const escaped = trimmed.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function generateSessionSummary(db: Database.Database, sessionId: string): string {
  const decisions = db.prepare(
    'SELECT title FROM decisions WHERE session_id = ? ORDER BY created_at'
  ).all(sessionId) as { title: string }[];

  if (decisions.length === 0) {
    return 'No decisions recorded';
  }

  return `${decisions.length} decision(s): ${decisions.map(d => d.title).join('; ')}`;
}
