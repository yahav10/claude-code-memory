import type Database from 'better-sqlite3';
import * as fs from 'fs';

// --- Types ---

export interface DashboardStats {
  totalDecisions: number;
  activeDecisions: number;
  deprecatedDecisions: number;
  supersededDecisions: number;
  totalSessions: number;
  lastActivity: string | null;
  topTags: { tag: string; count: number }[];
  recentDecisions: {
    id: number;
    title: string;
    status: string;
    tags: string[];
    created_at: string;
  }[];
}

export interface TimelinePoint {
  date: string;
  count: number;
}

export interface DecisionListItem {
  id: number;
  title: string;
  decision: string;
  status: string;
  tags: string[];
  created_at: string;
  session_id: string | null;
}

export interface DecisionListResult {
  decisions: DecisionListItem[];
  total: number;
}

export interface DecisionDetail {
  id: number;
  title: string;
  context: string | null;
  decision: string;
  rationale: string;
  alternatives: string[];
  consequences: string | null;
  status: string;
  superseded_by: number | null;
  created_at: string;
  created_by: string | null;
  session_id: string | null;
  tags: string[];
  files: string[];
}

export interface SessionListItem {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  decision_count: number;
}

export interface SessionListResult {
  sessions: SessionListItem[];
  total: number;
}

export interface SessionDetailResult {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  decision_count: number;
  decisions: {
    id: number;
    title: string;
    status: string;
    created_at: string;
    tags: string[];
  }[];
}

export interface DatabaseInfo {
  path: string;
  sizeBytes: number;
  decisionCount: number;
  sessionCount: number;
  fileCount: number;
  walEnabled: boolean;
}

export interface DecisionListOptions {
  offset: number;
  limit: number;
  status?: string[];
  tags?: string[];
  search?: string;
  sortBy?: 'created_at' | 'title';
  sortOrder?: 'ASC' | 'DESC';
}

export interface SessionListOptions {
  offset: number;
  limit: number;
  sortBy?: 'started_at' | 'decision_count';
  sortOrder?: 'ASC' | 'DESC';
}

// --- Helpers ---

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try { return JSON.parse(tagsJson); } catch { return []; }
}

function parseAlternatives(altJson: string | null): string[] {
  if (!altJson) return [];
  try { return JSON.parse(altJson); } catch { return []; }
}

// --- Dashboard ---

export function getDashboardStats(db: Database.Database): DashboardStats {
  const counts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'deprecated' THEN 1 ELSE 0 END) as deprecated,
      SUM(CASE WHEN status = 'superseded' THEN 1 ELSE 0 END) as superseded
    FROM decisions
  `).get() as { total: number; active: number; deprecated: number; superseded: number };

  const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;

  const lastActivity = db.prepare(
    'SELECT created_at FROM decisions ORDER BY created_at DESC LIMIT 1'
  ).get() as { created_at: string } | undefined;

  // Top tags
  const allDecisions = db.prepare('SELECT tags FROM decisions WHERE tags IS NOT NULL').all() as { tags: string }[];
  const tagCounts = new Map<string, number>();
  for (const row of allDecisions) {
    for (const tag of parseTags(row.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // Recent decisions
  const recent = db.prepare(
    'SELECT id, title, status, tags, created_at FROM decisions ORDER BY created_at DESC LIMIT 10'
  ).all() as { id: number; title: string; status: string; tags: string; created_at: string }[];

  return {
    totalDecisions: counts.total,
    activeDecisions: counts.active,
    deprecatedDecisions: counts.deprecated,
    supersededDecisions: counts.superseded,
    totalSessions: sessionCount,
    lastActivity: lastActivity?.created_at ?? null,
    topTags,
    recentDecisions: recent.map(r => ({ ...r, tags: parseTags(r.tags) })),
  };
}

// --- Activity Timeline ---

export function getActivityTimeline(db: Database.Database, days: number): TimelinePoint[] {
  return db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM decisions
    WHERE created_at >= DATE('now', '-' || ? || ' days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all(days) as TimelinePoint[];
}

// --- Decisions List ---

export function getDecisionsList(db: Database.Database, options: DecisionListOptions): DecisionListResult {
  const { offset, limit, status, tags, search, sortBy = 'created_at', sortOrder = 'DESC' } = options;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (status && status.length > 0) {
    conditions.push(`d.status IN (${status.map(() => '?').join(',')})`);
    params.push(...status);
  }

  if (search) {
    conditions.push(`(d.title LIKE ? OR d.decision LIKE ? OR d.rationale LIKE ?)`);
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = sortBy === 'title' ? 'ORDER BY d.title' : 'ORDER BY d.created_at';
  const dir = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const total = (db.prepare(`SELECT COUNT(*) as c FROM decisions d ${where}`).get(...params) as { c: number }).c;

  const rows = db.prepare(`
    SELECT d.id, d.title, d.decision, d.status, d.tags, d.created_at, d.session_id
    FROM decisions d
    ${where}
    ${order} ${dir}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as {
    id: number; title: string; decision: string; status: string;
    tags: string; created_at: string; session_id: string | null;
  }[];

  // Post-filter by tags if provided (JSON array stored in TEXT column)
  let decisions = rows.map(r => ({ ...r, tags: parseTags(r.tags) }));
  if (tags && tags.length > 0) {
    decisions = decisions.filter(d => tags.some(t => d.tags.includes(t)));
  }

  return { decisions, total };
}

// --- Decision Detail ---

export function getDecisionDetail(db: Database.Database, id: number): DecisionDetail | null {
  const row = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as {
    id: number; title: string; context: string | null; decision: string;
    rationale: string; alternatives: string | null; consequences: string | null;
    status: string; superseded_by: number | null; created_at: string;
    created_by: string | null; session_id: string | null; tags: string | null;
  } | undefined;

  if (!row) return null;

  const files = db.prepare(
    'SELECT file_path FROM decision_files WHERE decision_id = ?'
  ).all(id) as { file_path: string }[];

  return {
    ...row,
    tags: parseTags(row.tags),
    alternatives: parseAlternatives(row.alternatives),
    files: files.map(f => f.file_path),
  };
}

// --- Sessions ---

export function getSessionsList(db: Database.Database, options: SessionListOptions): SessionListResult {
  const { offset, limit, sortBy = 'started_at', sortOrder = 'DESC' } = options;

  const total = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;

  const order = sortBy === 'decision_count' ? 'ORDER BY s.decision_count' : 'ORDER BY s.started_at';
  const dir = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const sessions = db.prepare(`
    SELECT s.id, s.started_at, s.ended_at, s.summary, s.decision_count
    FROM sessions s
    ${order} ${dir}
    LIMIT ? OFFSET ?
  `).all(limit, offset) as SessionListItem[];

  return { sessions, total };
}

export function getSessionDetail(db: Database.Database, sessionId: string): SessionDetailResult | null {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as {
    id: string; started_at: string; ended_at: string | null;
    summary: string | null; decision_count: number;
  } | undefined;

  if (!session) return null;

  const decisions = db.prepare(`
    SELECT id, title, status, created_at, tags
    FROM decisions WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as { id: number; title: string; status: string; created_at: string; tags: string }[];

  return {
    ...session,
    decisions: decisions.map(d => ({ ...d, tags: parseTags(d.tags) })),
  };
}

// --- Settings / Database Info ---

export function getDatabaseInfo(db: Database.Database, dbPath: string): DatabaseInfo {
  const decisionCount = (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }).c;
  const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
  const fileCount = (db.prepare('SELECT COUNT(*) as c FROM decision_files').get() as { c: number }).c;

  let sizeBytes = 0;
  try { sizeBytes = fs.statSync(dbPath).size; } catch { /* file may not exist */ }

  const walMode = (db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode;

  return {
    path: dbPath,
    sizeBytes,
    decisionCount,
    sessionCount,
    fileCount,
    walEnabled: walMode === 'wal',
  };
}

// --- Analytics: Decision Quality ---

export interface DecisionQualityMetrics {
  totalDecisions: number;
  alternativesCoverage: number;  // percentage 0-100
  avgRationaleLength: number;    // avg chars
  consequencesTracking: number;  // percentage 0-100
  revisitRate: number;           // percentage of deprecated+superseded
}

export function getDecisionQualityMetrics(db: Database.Database): DecisionQualityMetrics {
  const total = (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }).c;
  if (total === 0) {
    return { totalDecisions: 0, alternativesCoverage: 0, avgRationaleLength: 0, consequencesTracking: 0, revisitRate: 0 };
  }

  const withAlts = (db.prepare(
    "SELECT COUNT(*) as c FROM decisions WHERE alternatives IS NOT NULL AND alternatives != '[]' AND alternatives != ''"
  ).get() as { c: number }).c;

  const avgRationale = (db.prepare(
    'SELECT AVG(LENGTH(rationale)) as avg FROM decisions'
  ).get() as { avg: number }).avg;

  const withConsequences = (db.prepare(
    "SELECT COUNT(*) as c FROM decisions WHERE consequences IS NOT NULL AND consequences != ''"
  ).get() as { c: number }).c;

  const revisited = (db.prepare(
    "SELECT COUNT(*) as c FROM decisions WHERE status IN ('deprecated', 'superseded')"
  ).get() as { c: number }).c;

  return {
    totalDecisions: total,
    alternativesCoverage: Math.round((withAlts / total) * 100),
    avgRationaleLength: Math.round(avgRationale || 0),
    consequencesTracking: Math.round((withConsequences / total) * 100),
    revisitRate: Math.round((revisited / total) * 100),
  };
}

// --- Analytics: Work Patterns ---

export interface TagTrend {
  tag: string;
  month: string;  // YYYY-MM
  count: number;
}

export interface WorkPatternMetrics {
  totalSessions: number;
  avgDecisionsPerSession: number;
  zeroDecisionSessions: number;
  decisionDensity: { decisionCount: number; sessions: number }[];
  tagTrends: TagTrend[];
}

export function getWorkPatternMetrics(db: Database.Database): WorkPatternMetrics {
  const totalSessions = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
  const totalDecisions = (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }).c;

  const zeroDecisionSessions = (db.prepare(
    'SELECT COUNT(*) as c FROM sessions WHERE decision_count = 0'
  ).get() as { c: number }).c;

  const density = db.prepare(
    'SELECT decision_count as decisionCount, COUNT(*) as sessions FROM sessions GROUP BY decision_count ORDER BY decision_count ASC'
  ).all() as { decisionCount: number; sessions: number }[];

  // Tag trends by month
  const allDecisions = db.prepare(
    "SELECT tags, created_at FROM decisions WHERE tags IS NOT NULL AND created_at IS NOT NULL"
  ).all() as { tags: string; created_at: string }[];

  const trendMap = new Map<string, number>(); // "tag|YYYY-MM" -> count
  for (const row of allDecisions) {
    const month = row.created_at.slice(0, 7); // YYYY-MM
    for (const tag of parseTags(row.tags)) {
      const key = `${tag}|${month}`;
      trendMap.set(key, (trendMap.get(key) || 0) + 1);
    }
  }

  const tagTrends: TagTrend[] = [...trendMap.entries()]
    .map(([key, count]) => {
      const [tag, month] = key.split('|');
      return { tag, month, count };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || b.count - a.count);

  return {
    totalSessions,
    avgDecisionsPerSession: totalSessions > 0 ? totalDecisions / totalSessions : 0,
    zeroDecisionSessions,
    decisionDensity: density,
    tagTrends,
  };
}
