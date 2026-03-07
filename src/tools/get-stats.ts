import type Database from 'better-sqlite3';

interface MemoryStats {
  totalDecisions: number;
  active: number;
  deprecated: number;
  superseded: number;
  lowConfidence: number;
  totalSessions: number;
  topTags: { tag: string; count: number }[];
  lastActivity: string | null;
}

export function handleGetStats(db: Database.Database): MemoryStats {
  const total = db.prepare('SELECT COUNT(*) as count FROM decisions').get() as { count: number };
  const active = db.prepare("SELECT COUNT(*) as count FROM decisions WHERE status = 'active'").get() as { count: number };
  const deprecated = db.prepare("SELECT COUNT(*) as count FROM decisions WHERE status = 'deprecated'").get() as { count: number };
  const superseded = db.prepare("SELECT COUNT(*) as count FROM decisions WHERE status = 'superseded'").get() as { count: number };
  const lowConfidence = db.prepare("SELECT COUNT(*) as count FROM decisions WHERE status = 'active' AND confidence < 0.3").get() as { count: number };
  const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  const lastDecision = db.prepare('SELECT created_at FROM decisions ORDER BY created_at DESC LIMIT 1').get() as { created_at: string } | undefined;

  // Aggregate tags from JSON arrays
  const allDecisions = db.prepare('SELECT tags FROM decisions WHERE tags IS NOT NULL').all() as { tags: string }[];
  const tagCounts = new Map<string, number>();
  for (const row of allDecisions) {
    try {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    } catch {
      // skip malformed JSON
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalDecisions: total.count,
    active: active.count,
    deprecated: deprecated.count,
    superseded: superseded.count,
    lowConfidence: lowConfidence.count,
    totalSessions: sessions.count,
    topTags,
    lastActivity: lastDecision?.created_at || null,
  };
}
