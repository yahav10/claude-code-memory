import type Database from 'better-sqlite3';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'using', 'with', 'for',
  'to', 'in', 'on', 'of', 'and', 'that', 'this', 'it', 'be', 'as', 'at',
  'by', 'from', 'or', 'not', 'but', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'we',
  'our', 'they', 'them', 'its', 'use', 'used', 'all', 'each',
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarDecision {
  id: number;
  title: string;
  similarity: number;
}

export function findSimilarDecisions(
  db: Database.Database,
  title: string,
  decision: string,
  excludeId?: number,
  threshold = 0.6,
): SimilarDecision[] {
  const newTokens = tokenize(`${title} ${decision}`);
  if (newTokens.size === 0) return [];

  const rows = db.prepare(
    'SELECT id, title, decision FROM decisions WHERE status = ?',
  ).all('active') as Array<{ id: number; title: string; decision: string }>;

  const matches: SimilarDecision[] = [];
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    const existingTokens = tokenize(`${row.title} ${row.decision}`);
    const similarity = jaccardSimilarity(newTokens, existingTokens);
    if (similarity >= threshold) {
      matches.push({ id: row.id, title: row.title, similarity });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
