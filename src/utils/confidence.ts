import type Database from 'better-sqlite3';

/**
 * Decay confidence for decisions tagged "temporary" or "experimental".
 * Linear decay over 30 days: confidence = max(0, 1.0 - age_days/30).
 * Other decisions are never decayed.
 */
export function decayConfidence(db: Database.Database): { updated: number } {
  const result = db.prepare(`
    UPDATE decisions
    SET confidence = MAX(0, 1.0 - (julianday('now') - julianday(created_at)) / 30.0)
    WHERE status = 'active'
      AND (tags LIKE '%"temporary"%' OR tags LIKE '%"experimental"%')
      AND confidence > 0
  `).run();

  return { updated: result.changes };
}

/**
 * Get active decisions with confidence above a threshold.
 */
export function getActiveDecisionsAboveConfidence(
  db: Database.Database,
  minConfidence = 0.3,
): Array<{
  id: number;
  title: string;
  decision: string;
  rationale: string;
  tags: string | null;
  confidence: number;
  created_at: string;
}> {
  return db.prepare(`
    SELECT id, title, decision, rationale, tags, confidence, created_at
    FROM decisions
    WHERE status = 'active' AND confidence >= ?
    ORDER BY confidence DESC, created_at DESC
  `).all(minConfidence) as any[];
}
