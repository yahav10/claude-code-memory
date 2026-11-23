import type Database from 'better-sqlite3';
import { parseSessionFile } from './jsonl-parser.js';
import { buildTranscript } from './transcript-builder.js';
import { extractDecisions, type ExtractionResult } from './decision-extractor.js';
import { ensureEmbeddings } from '../utils/embeddings.js';
import { findSimilarDecisions } from '../utils/jaccard.js';

export interface CaptureResult {
  status: 'captured' | 'skipped' | 'no-session';
  sessionId?: string;
  decisionsExtracted: number;
}

// Auto-supersede threshold used elsewhere (save_decision): above this a new decision restates an
// existing one, so we skip it instead of storing a duplicate. Compaction capture and SessionEnd
// capture can both see the same decision in one session, so this must be idempotent.
const DUPLICATE_THRESHOLD = 0.8;

/** Insert extracted decisions, skipping ones that restate an active decision. Returns the count stored. */
function storeDecisions(
  db: Database.Database,
  sessionId: string,
  result: ExtractionResult,
  createdBy: string,
): number {
  const insertDecision = db.prepare(`
    INSERT INTO decisions (title, context, decision, rationale, alternatives, consequences, status, created_at, created_by, session_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, ?, ?)
  `);
  const insertFile = db.prepare(
    'INSERT OR IGNORE INTO decision_files (decision_id, file_path) VALUES (?, ?)',
  );

  let stored = 0;
  for (const d of result.decisions) {
    if (findSimilarDecisions(db, d.title, d.decision, undefined, DUPLICATE_THRESHOLD).length > 0) continue;
    const res = insertDecision.run(
      d.title, d.context, d.decision, d.rationale,
      JSON.stringify(d.alternatives), d.consequences,
      createdBy, sessionId, JSON.stringify(d.tags),
    );
    for (const fp of d.files) insertFile.run(res.lastInsertRowid, fp);
    stored++;
  }
  return stored;
}

/**
 * Capture a single just-ended Claude Code session into memory. Invoked by the SessionEnd hook
 * (see `capture` CLI command) so decisions get saved automatically without relying on the agent
 * to call save_decision. Idempotent: a session already finished in the DB is skipped. A session row
 * left open by compaction capture (no ended_at) is completed here rather than skipped.
 *
 * Mirrors the per-session work in the import pipeline; kept standalone to stay simple and to run
 * fast in a hook context.
 */
export async function captureSession(opts: {
  db: Database.Database;
  transcriptPath: string;
  apiKey?: string;
  skipExtraction?: boolean;
}): Promise<CaptureResult> {
  const { db, transcriptPath, apiKey, skipExtraction = false } = opts;

  const meta = await parseSessionFile(transcriptPath);
  if (!meta) return { status: 'no-session', decisionsExtracted: 0 };

  const existing = db.prepare('SELECT ended_at FROM sessions WHERE id = ?').get(meta.sessionId) as
    { ended_at: string | null } | undefined;
  if (existing?.ended_at) return { status: 'skipped', sessionId: meta.sessionId, decisionsExtracted: 0 };

  if (existing) {
    db.prepare(`
      UPDATE sessions SET started_at = ?, ended_at = ?, summary = ?, project_path = ?, git_branch = ?,
        message_count = ?, tool_call_count = ?
      WHERE id = ?
    `).run(
      meta.startedAt, meta.endedAt, meta.firstPrompt.slice(0, 200), meta.projectPath, meta.gitBranch,
      meta.messageCount, meta.toolCallCount, meta.sessionId,
    );
  } else {
    db.prepare(`
      INSERT INTO sessions (id, started_at, ended_at, summary, decision_count, project_path, git_branch, message_count, tool_call_count, source)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'hook')
    `).run(
      meta.sessionId, meta.startedAt, meta.endedAt, meta.firstPrompt.slice(0, 200),
      meta.projectPath, meta.gitBranch, meta.messageCount, meta.toolCallCount,
    );
  }

  let decisionsExtracted = 0;

  if (!skipExtraction && apiKey) {
    const transcript = await buildTranscript(transcriptPath);
    if (transcript.trim()) {
      const result = await extractDecisions(transcript, apiKey);
      decisionsExtracted = storeDecisions(db, meta.sessionId, result, 'haiku-capture');

      db.prepare(`
        UPDATE sessions SET summary = COALESCE(?, summary),
          decision_count = (SELECT COUNT(*) FROM decisions WHERE session_id = ?)
        WHERE id = ?
      `).run(result.summary || null, meta.sessionId, meta.sessionId);
    }

    // Index the new decisions for semantic search (best-effort, no-op without the embedder).
    await ensureEmbeddings(db).catch(() => 0);
  }

  return { status: 'captured', sessionId: meta.sessionId, decisionsExtracted };
}

/**
 * Capture decisions from a compaction summary. Claude Code has already condensed the conversation,
 * so this is cheap and happens before detail is lost, instead of waiting for SessionEnd. The session
 * row is left open (no ended_at) so the final SessionEnd capture still runs; duplicates are skipped.
 */
export async function captureFromSummary(opts: {
  db: Database.Database;
  sessionId: string;
  summary: string;
  cwd?: string;
  apiKey?: string;
}): Promise<{ decisionsExtracted: number }> {
  const { db, sessionId, summary, cwd, apiKey } = opts;
  if (!apiKey || !summary.trim()) return { decisionsExtracted: 0 };

  db.prepare(`
    INSERT OR IGNORE INTO sessions (id, project_path, source) VALUES (?, ?, 'hook')
  `).run(sessionId, cwd ?? null);

  const result = await extractDecisions(`ASSISTANT: ${summary}`, apiKey);
  const decisionsExtracted = storeDecisions(db, sessionId, result, 'haiku-compact');

  db.prepare(`
    UPDATE sessions SET decision_count = (SELECT COUNT(*) FROM decisions WHERE session_id = ?) WHERE id = ?
  `).run(sessionId, sessionId);

  await ensureEmbeddings(db).catch(() => 0);
  return { decisionsExtracted };
}
