import type Database from 'better-sqlite3';
import { sanitizeFtsQuery } from './utils.js';

export type QueryType =
  | 'WHY_DECISION'
  | 'FILE_IMPACT'
  | 'TAG_SEARCH'
  | 'RECENT'
  | 'COMPARISON'
  | 'DEPRECATED'
  | 'CURRENT_SESSION'
  | 'ALTERNATIVES'
  | 'CONSEQUENCES'
  | 'HYBRID_SEARCH';

interface QueryPattern {
  pattern: RegExp;
  type: QueryType;
  extractor?: (match: RegExpMatchArray) => string;
}

const QUERY_PATTERNS: QueryPattern[] = [
  {
    pattern: /why (?:did we |are we |do we )?(?:use|choose|using|chose|pick|select|go with)\s+(.+?)(?:\?|$)/i,
    type: 'WHY_DECISION',
    extractor: (m) => m[1].trim(),
  },
  {
    pattern: /(?:what|which|show|list) (?:decisions?|changes?) (?:for|about|in|affect|affecting)\s+(.+\.(?:ts|js|vue|py|java|go|rb|tsx|jsx|css|scss|json))/i,
    type: 'FILE_IMPACT',
    extractor: (m) => m[1].trim(),
  },
  {
    pattern: /(?:show|list|find) (?:all )?(?:decisions?|changes?) (?:about|related to|tagged|for)\s+([a-z]+)/i,
    type: 'TAG_SEARCH',
    extractor: (m) => m[1].trim(),
  },
  {
    pattern: /(?:what|show|list) (?:recent|latest|new|last) (?:decisions?|changes?)/i,
    type: 'RECENT',
  },
  {
    pattern: /(?:compare|difference between|vs\.?|versus)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)(?:\?|$)/i,
    type: 'COMPARISON',
    extractor: (m) => `${m[1].trim()}|${m[2].trim()}`,
  },
  {
    pattern: /(?:show|list|what) (?:deprecated|old|outdated|superseded) (?:decisions?|approaches?)/i,
    type: 'DEPRECATED',
  },
  {
    pattern: /(?:what|show) (?:decisions?|changes?) (?:from|in) (?:this|current|today'?s?) session/i,
    type: 'CURRENT_SESSION',
  },
  {
    pattern: /(?:what|show|list) (?:alternatives|options) (?:for|to|instead of)\s+(.+?)(?:\?|$)/i,
    type: 'ALTERNATIVES',
    extractor: (m) => m[1].trim(),
  },
  {
    pattern: /(?:what are|show) (?:the )?(?:consequences|trade-?offs|implications) (?:of|for)\s+(.+?)(?:\?|$)/i,
    type: 'CONSEQUENCES',
    extractor: (m) => m[1].trim(),
  },
];

export function classifyQuery(query: string): { type: QueryType; extracted?: string } {
  for (const { pattern, type, extractor } of QUERY_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      return {
        type,
        extracted: extractor ? extractor(match) : undefined,
      };
    }
  }
  return { type: 'HYBRID_SEARCH' };
}

export function executeQuery(
  db: Database.Database,
  query: string,
  limit: number = 5,
  sessionId?: string,
): any[] {
  const clamped = Math.max(1, Math.min(100, limit));
  const { type, extracted } = classifyQuery(query);

  switch (type) {
    case 'WHY_DECISION':
      return queryWhyDecision(db, extracted!, clamped);
    case 'FILE_IMPACT':
      return queryFileImpact(db, extracted!, clamped);
    case 'TAG_SEARCH':
      return queryByTag(db, extracted!, clamped);
    case 'RECENT':
      return queryRecent(db, clamped);
    case 'COMPARISON': {
      const [term1, term2] = extracted!.split('|');
      return queryComparison(db, term1, term2, clamped);
    }
    case 'DEPRECATED':
      return queryDeprecated(db, clamped);
    case 'CURRENT_SESSION':
      return queryCurrentSession(db, sessionId || '', clamped);
    case 'ALTERNATIVES':
      return queryAlternatives(db, extracted!, clamped);
    case 'CONSEQUENCES':
      return queryConsequences(db, extracted!, clamped);
    default:
      return hybridSearch(db, query, clamped);
  }
}

function queryWhyDecision(db: Database.Database, tech: string, limit: number): any[] {
  return db.prepare(`
    SELECT d.*, GROUP_CONCAT(df.file_path, ', ') as affected_files
    FROM decisions d
    LEFT JOIN decision_files df ON d.id = df.decision_id
    WHERE d.status = 'active'
      AND (d.title LIKE ? OR d.decision LIKE ? OR d.rationale LIKE ?)
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(`%${tech}%`, `%${tech}%`, `%${tech}%`, limit);
}

function queryFileImpact(db: Database.Database, filePath: string, limit: number): any[] {
  return db.prepare(`
    SELECT d.id, d.title, d.decision, d.rationale, d.created_at
    FROM decisions d
    JOIN decision_files df ON d.id = df.decision_id
    WHERE df.file_path LIKE ? AND d.status = 'active'
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(`%${filePath}%`, limit);
}

function queryByTag(db: Database.Database, tag: string, limit: number): any[] {
  return db.prepare(`
    SELECT d.id, d.title, d.decision, d.rationale, d.tags, d.created_at
    FROM decisions d
    WHERE d.status = 'active' AND d.tags LIKE ?
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(`%"${tag}"%`, limit);
}

function queryRecent(db: Database.Database, limit: number): any[] {
  return db.prepare(`
    SELECT d.id, d.title, d.decision, d.rationale, d.status, d.created_at, d.session_id
    FROM decisions d
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(limit);
}

function queryComparison(db: Database.Database, term1: string, term2: string, limit: number): any[] {
  const results1 = queryWhyDecision(db, term1, limit).map(r => ({ ...r, matched_term: term1 }));
  const results2 = queryWhyDecision(db, term2, limit).map(r => ({ ...r, matched_term: term2 }));

  const seen = new Set<number>();
  const merged = [...results1, ...results2].filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return merged
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

function queryDeprecated(db: Database.Database, limit: number): any[] {
  return db.prepare(`
    SELECT d.id, d.title, d.decision, d.status, d.superseded_by, d.created_at
    FROM decisions d
    WHERE d.status IN ('deprecated', 'superseded')
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(limit);
}

function queryCurrentSession(db: Database.Database, sessionId: string, limit: number): any[] {
  return db.prepare(`
    SELECT d.id, d.title, d.decision, d.rationale, d.created_at
    FROM decisions d
    WHERE d.session_id = ?
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(sessionId, limit);
}

function queryAlternatives(db: Database.Database, tech: string, limit: number): any[] {
  return db.prepare(`
    SELECT d.id, d.title, d.decision, d.alternatives, d.rationale, d.created_at
    FROM decisions d
    WHERE d.status = 'active'
      AND (d.title LIKE ? OR d.decision LIKE ?)
      AND d.alternatives IS NOT NULL
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(`%${tech}%`, `%${tech}%`, limit);
}

function queryConsequences(db: Database.Database, tech: string, limit: number): any[] {
  return db.prepare(`
    SELECT d.id, d.title, d.decision, d.consequences, d.created_at
    FROM decisions d
    WHERE d.status = 'active'
      AND (d.title LIKE ? OR d.decision LIKE ?)
      AND d.consequences IS NOT NULL
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all(`%${tech}%`, `%${tech}%`, limit);
}

function hybridSearch(db: Database.Database, query: string, limit: number): any[] {
  const sanitized = sanitizeFtsQuery(query);
  if (!sanitized) return [];

  try {
    const results = db.prepare(`
      SELECT d.id, d.title, d.decision, d.rationale, d.created_at, rank
      FROM decisions_fts
      JOIN decisions d ON decisions_fts.rowid = d.id
      WHERE decisions_fts MATCH ? AND d.status = 'active'
      ORDER BY rank
      LIMIT ?
    `).all(sanitized, limit);

    if (results.length > 0) return results;
  } catch {
    // FTS5 match can fail on edge-case inputs, fall through to OR search
  }

  // Fallback: split into terms, join with OR
  const terms = query.split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return [];

  const orQuery = terms.map(t => sanitizeFtsQuery(t)).filter(Boolean).join(' OR ');
  if (!orQuery) return [];

  try {
    return db.prepare(`
      SELECT d.id, d.title, d.decision, d.rationale, d.created_at
      FROM decisions_fts
      JOIN decisions d ON decisions_fts.rowid = d.id
      WHERE decisions_fts MATCH ? AND d.status = 'active'
      ORDER BY rank
      LIMIT ?
    `).all(orQuery, limit);
  } catch {
    return [];
  }
}
