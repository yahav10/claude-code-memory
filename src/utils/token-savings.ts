import type Database from 'better-sqlite3';

const TOKENS_PER_SUCCESSFUL_QUERY = 300;
const MINUTES_PER_SUCCESSFUL_QUERY = 2;
const COST_PER_TOKEN = 0.000003; // ~$3/1M input tokens at Sonnet pricing

export interface TokenSavingsResult {
  totalQueries: number;
  successfulQueries: number;
  estimatedTokensSaved: number;
  estimatedMinutesSaved: number;
  estimatedCostSaved: number;
}

export function logQuery(
  db: Database.Database,
  sessionId: string,
  query: string,
  resultCount: number,
): void {
  const tokensSaved = resultCount > 0 ? TOKENS_PER_SUCCESSFUL_QUERY : 0;
  db.prepare(
    'INSERT INTO query_log (session_id, query, result_count, estimated_tokens_saved) VALUES (?, ?, ?, ?)',
  ).run(sessionId, query, resultCount, tokensSaved);
}

export function getTokenSavings(db: Database.Database, days: number = 30): TokenSavingsResult {
  const row = db.prepare(`
    SELECT
      COUNT(*) as totalQueries,
      SUM(CASE WHEN result_count > 0 THEN 1 ELSE 0 END) as successfulQueries,
      SUM(estimated_tokens_saved) as estimatedTokensSaved
    FROM query_log
    WHERE created_at >= datetime('now', '-' || ? || ' days')
  `).get(days) as { totalQueries: number; successfulQueries: number; estimatedTokensSaved: number };

  const successfulQueries = row.successfulQueries || 0;
  const estimatedTokensSaved = row.estimatedTokensSaved || 0;

  return {
    totalQueries: row.totalQueries || 0,
    successfulQueries,
    estimatedTokensSaved,
    estimatedMinutesSaved: successfulQueries * MINUTES_PER_SUCCESSFUL_QUERY,
    estimatedCostSaved: parseFloat((estimatedTokensSaved * COST_PER_TOKEN).toFixed(4)),
  };
}
