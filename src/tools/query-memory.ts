import type Database from 'better-sqlite3';
import { executeQuery } from '../queries.js';
import { logQuery } from '../utils/token-savings.js';
import { semanticSearch } from '../utils/embeddings.js';

interface QueryMemoryArgs {
  query: string;
  limit?: number;
}

export async function handleQueryMemory(
  db: Database.Database,
  sessionId: string,
  args: QueryMemoryArgs,
): Promise<{ results: any[]; query: string }> {
  const { query, limit = 5 } = args;

  if (!query || !query.trim()) {
    return { results: [], query };
  }

  // Keyword/classified results first — they match explicit intent (file paths, tags, "why X").
  const keyword = executeQuery(db, query, limit, sessionId);

  // Then fill remaining slots with semantic matches not already covered. Catches paraphrases
  // FTS misses ("why JWT?" → "stateless token auth"). No-op when embeddings are unavailable.
  const seen = new Set<number>(keyword.map((r: any) => r.id));
  const results = [...keyword];
  if (results.length < limit) {
    try {
      const semantic = await semanticSearch(db, query, limit);
      for (const hit of semantic) {
        if (seen.has(hit.id)) continue;
        seen.add(hit.id);
        results.push(hit);
        if (results.length >= limit) break;
      }
    } catch {
      // semantic search is best-effort; keyword results stand on their own
    }
  }

  logQuery(db, sessionId, query, results.length);
  return { results, query };
}
