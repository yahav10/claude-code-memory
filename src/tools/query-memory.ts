import type Database from 'better-sqlite3';
import { executeQuery } from '../queries.js';

interface QueryMemoryArgs {
  query: string;
  limit?: number;
}

export function handleQueryMemory(
  db: Database.Database,
  sessionId: string,
  args: QueryMemoryArgs,
): { results: any[]; query: string } {
  const { query, limit = 5 } = args;

  if (!query || !query.trim()) {
    return { results: [], query };
  }

  const results = executeQuery(db, query, limit, sessionId);
  return { results, query };
}
