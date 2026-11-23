import * as path from 'path';
import type Database from 'better-sqlite3';
import { getRelevantDecisions } from './session-intelligence.js';
import { semanticSearch } from './embeddings.js';

// Push-style retrieval: pick the few decisions that matter right now and render them as a compact,
// hard-capped block for a hook to inject. Budgets are in characters (~4 chars per token) so the
// cost of a push is predictable and small; the full record is one get_decisions call away.

export const SESSION_START_BUDGET = 3000; // ~750 tokens
export const FILE_BUDGET = 1500; // ~375 tokens
export const PROMPT_BUDGET = 1500; // ~375 tokens

const MIN_CONFIDENCE = 0.3; // below this a temporary/experimental decision has decayed away

export interface InjectionDecision {
  id: number;
  title: string;
  decision: string;
  rationale: string;
  tags: string[];
  reason: string;
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + '…';
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const tags = JSON.parse(raw);
    return Array.isArray(tags) ? tags.map(String) : [];
  } catch {
    return [];
  }
}

export function formatLine(d: InjectionDecision): string {
  const tags = d.tags.length > 0 ? ` [${d.tags.slice(0, 3).join(', ')}]` : '';
  return `- #${d.id}${tags} ${clip(d.title, 90)}: ${clip(d.decision, 200)} (why: ${clip(d.rationale, 140)})`;
}

export interface RenderedBlock {
  text: string;
  shown: InjectionDecision[];
}

/** Render as many decisions as fit in `budget` characters, in the order given. */
export function renderBlock(header: string, decisions: InjectionDecision[], budget: number): RenderedBlock | null {
  const footer = '\nFull detail for any #id: call the get_decisions tool. Treat these as settled unless the user says otherwise.';
  let text = header;
  const shown: InjectionDecision[] = [];
  for (const d of decisions) {
    const line = '\n' + formatLine(d);
    if (text.length + line.length + footer.length > budget) {
      if (shown.length === 0) {
        // Always show at least the top decision, shortened to fit rather than dropped.
        const room = budget - text.length - footer.length - 1;
        if (room > 60) {
          text += '\n' + clip(formatLine(d), room);
          shown.push(d);
        }
      }
      break;
    }
    text += line;
    shown.push(d);
  }
  if (shown.length === 0) return null;
  return { text: text + footer, shown };
}

/** Full records for the given ids, in the order given (active, non-decayed only). */
export function fetchDecisions(db: Database.Database, ids: number[], reasons: Map<number, string> = new Map()): InjectionDecision[] {
  if (ids.length === 0) return [];
  const rows = db.prepare(`
    SELECT id, title, decision, rationale, tags
    FROM decisions
    WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'active' AND COALESCE(confidence, 1.0) >= ?
  `).all(...ids, MIN_CONFIDENCE) as Array<{ id: number; title: string; decision: string; rationale: string; tags: string | null }>;
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.flatMap(id => {
    const r = byId.get(id);
    return r
      ? [{ id: r.id, title: r.title, decision: r.decision, rationale: r.rationale, tags: parseTags(r.tags), reason: reasons.get(id) ?? '' }]
      : [];
  });
}

export function selectForSessionStart(
  db: Database.Database,
  ctx: { branch: string | null; modifiedFiles: string[] },
): InjectionDecision[] {
  const relevant = getRelevantDecisions(db, { branch: ctx.branch, modifiedFiles: ctx.modifiedFiles, limit: 10 });
  const reasons = new Map(relevant.map(r => [r.id, r.matchReason]));
  return fetchDecisions(db, relevant.map(r => r.id), reasons);
}

function toRelative(filePath: string, projectRoot: string): string {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  const rel = path.relative(projectRoot, abs);
  return rel.startsWith('..') ? abs : rel;
}

/** Active decisions whose recorded files include `filePath` (relative or absolute either way). */
export function selectForFile(db: Database.Database, filePath: string, projectRoot: string): InjectionDecision[] {
  const rel = toRelative(filePath, projectRoot);
  const abs = path.join(projectRoot, rel);
  const base = path.basename(rel);
  const candidates = db.prepare(`
    SELECT d.id, df.file_path
    FROM decisions d
    JOIN decision_files df ON d.id = df.decision_id
    WHERE d.status = 'active' AND COALESCE(d.confidence, 1.0) >= ? AND df.file_path LIKE ?
    ORDER BY d.created_at DESC
  `).all(MIN_CONFIDENCE, `%${base}`) as Array<{ id: number; file_path: string }>;

  const matches = candidates.filter(c => {
    const recorded = c.file_path.replace(/^\.\//, '');
    return recorded === rel || recorded === abs || abs.endsWith('/' + recorded) || recorded.endsWith('/' + rel);
  });
  const ids = [...new Set(matches.map(m => m.id))];
  return fetchDecisions(db, ids, new Map(ids.map(id => [id, `file:${rel}`])));
}

const MIN_PROMPT_CHARS = 25;

/** Semantic matches for a prompt. Empty when the local embedder isn't available. */
export async function selectForPrompt(db: Database.Database, prompt: string, limit = 3): Promise<InjectionDecision[]> {
  const text = prompt.trim();
  if (text.length < MIN_PROMPT_CHARS || text.startsWith('/')) return [];
  const hits = await semanticSearch(db, text, limit);
  return fetchDecisions(db, hits.map(h => h.id), new Map(hits.map(h => [h.id, `prompt:${h.semantic_score.toFixed(2)}`])));
}

// --- Per-session dedup + ROI log ---

/** Decisions this hook event has not already shown in this session. */
export function filterUnseen(db: Database.Database, sessionId: string, event: string, decisions: InjectionDecision[]): InjectionDecision[] {
  if (decisions.length === 0) return [];
  const seen = new Set(
    (db.prepare('SELECT decision_id FROM injection_log WHERE session_id = ? AND event = ?').all(sessionId, event) as Array<{ decision_id: number }>)
      .map(r => r.decision_id),
  );
  return decisions.filter(d => !seen.has(d.id));
}

export function recordInjection(db: Database.Database, sessionId: string, event: string, shown: InjectionDecision[]): void {
  const insert = db.prepare('INSERT OR IGNORE INTO injection_log (session_id, decision_id, event, chars) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const d of shown) insert.run(sessionId, d.id, event, formatLine(d).length);
  })();
}

/** After compaction or /clear the model has lost the earlier injections, so allow them again. */
export function resetInjections(db: Database.Database, sessionId: string): void {
  db.prepare('DELETE FROM injection_log WHERE session_id = ?').run(sessionId);
}

export interface InjectionStats {
  decisionsInjected: number;
  sessions: number;
  charsInjected: number;
  estimatedTokensInjected: number;
  byEvent: Record<string, number>;
}

export function getInjectionStats(db: Database.Database, days = 30): InjectionStats {
  const rows = db.prepare(`
    SELECT event, COUNT(*) AS n, COALESCE(SUM(chars), 0) AS chars
    FROM injection_log
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY event
  `).all(days) as Array<{ event: string; n: number; chars: number }>;
  const total = db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS sessions FROM injection_log
    WHERE created_at >= datetime('now', '-' || ? || ' days')
  `).get(days) as { sessions: number };

  const charsInjected = rows.reduce((s, r) => s + r.chars, 0);
  return {
    decisionsInjected: rows.reduce((s, r) => s + r.n, 0),
    sessions: total.sessions,
    charsInjected,
    estimatedTokensInjected: estimateTokens(charsInjected),
    byEvent: Object.fromEntries(rows.map(r => [r.event, r.n])),
  };
}
