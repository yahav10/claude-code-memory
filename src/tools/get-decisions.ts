import type Database from 'better-sqlite3';

export interface DecisionRecord {
  id: number;
  title: string;
  decision: string;
  rationale: string;
  alternatives: string | null;
  consequences: string | null;
  status: string;
  created_at: string;
  affected_files: string | null;
  [key: string]: unknown;
}

export const MAX_IDS = 10;

/** Full records for specific ids, in the order requested. Unknown ids are skipped. */
export function handleGetDecisions(db: Database.Database, ids: number[]): DecisionRecord[] {
  const wanted = [...new Set(ids)].slice(0, MAX_IDS);
  if (wanted.length === 0) return [];
  const rows = db.prepare(`
    SELECT d.id, d.title, d.decision, d.rationale, d.alternatives, d.consequences, d.status, d.created_at,
           GROUP_CONCAT(df.file_path, ', ') AS affected_files
    FROM decisions d
    LEFT JOIN decision_files df ON d.id = df.decision_id
    WHERE d.id IN (${wanted.map(() => '?').join(',')})
    GROUP BY d.id
  `).all(...wanted) as DecisionRecord[];
  const byId = new Map(rows.map(r => [r.id, r]));
  return wanted.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
}

/** The full, human-readable form of a decision (shared by query_memory detail=full and get_decisions). */
export function formatFullDecision(r: Record<string, any>): string {
  let text = `## Decision #${r.id}: ${r.title}\n`;
  if (r.status && r.status !== 'active') text += `**Status**: ${r.status}\n`;
  text += `**Decision**: ${r.decision}\n`;
  text += `**Rationale**: ${r.rationale}\n`;
  if (r.alternatives) {
    try {
      const alts = JSON.parse(r.alternatives);
      if (Array.isArray(alts) && alts.length > 0) text += `**Alternatives**: ${alts.join(', ')}\n`;
    } catch { /* skip */ }
  }
  if (r.consequences) text += `**Consequences**: ${r.consequences}\n`;
  if (r.affected_files) text += `**Files**: ${r.affected_files}\n`;
  text += `**Created**: ${r.created_at}\n\n`;
  return text;
}

function oneLine(text: string, max: number): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + '…';
}

/** Compact search result: enough to pick the right decision without paying for every full record. */
export function formatIndexLine(r: Record<string, any>): string {
  const status = r.status && r.status !== 'active' ? ` (${r.status})` : '';
  const score = typeof r.semantic_score === 'number' ? ` [match ${r.semantic_score.toFixed(2)}]` : '';
  return `- #${r.id} ${oneLine(r.title, 90)}${status}: ${oneLine(r.decision, 140)}${score}`;
}
