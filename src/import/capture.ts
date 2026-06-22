import type Database from 'better-sqlite3';
import { parseSessionFile } from './jsonl-parser.js';
import { buildTranscript } from './transcript-builder.js';
import { extractDecisions } from './decision-extractor.js';
import { ensureEmbeddings } from '../utils/embeddings.js';

export interface CaptureResult {
  status: 'captured' | 'skipped' | 'no-session';
  sessionId?: string;
  decisionsExtracted: number;
}

/**
 * Capture a single just-ended Claude Code session into memory. Invoked by the SessionEnd hook
 * (see `capture` CLI command) so decisions get saved automatically without relying on the agent
 * to call save_decision. Idempotent: a session already in the DB is skipped.
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

  const already = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(meta.sessionId);
  if (already) return { status: 'skipped', sessionId: meta.sessionId, decisionsExtracted: 0 };

  db.prepare(`
    INSERT INTO sessions (id, started_at, ended_at, summary, decision_count, project_path, git_branch, message_count, tool_call_count, source)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'hook')
  `).run(
    meta.sessionId, meta.startedAt, meta.endedAt, meta.firstPrompt.slice(0, 200),
    meta.projectPath, meta.gitBranch, meta.messageCount, meta.toolCallCount,
  );

  let decisionsExtracted = 0;

  if (!skipExtraction && apiKey) {
    const transcript = await buildTranscript(transcriptPath);
    if (transcript.trim()) {
      const result = await extractDecisions(transcript, apiKey);

      const insertDecision = db.prepare(`
        INSERT INTO decisions (title, context, decision, rationale, alternatives, consequences, status, created_at, created_by, session_id, tags)
        VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, 'haiku-capture', ?, ?)
      `);
      const insertFile = db.prepare(
        'INSERT OR IGNORE INTO decision_files (decision_id, file_path) VALUES (?, ?)',
      );

      for (const d of result.decisions) {
        const res = insertDecision.run(
          d.title, d.context, d.decision, d.rationale,
          JSON.stringify(d.alternatives), d.consequences,
          meta.sessionId, JSON.stringify(d.tags),
        );
        for (const fp of d.files) insertFile.run(res.lastInsertRowid, fp);
      }

      db.prepare('UPDATE sessions SET summary = ?, decision_count = ? WHERE id = ?')
        .run(result.summary || null, result.decisions.length, meta.sessionId);
      decisionsExtracted = result.decisions.length;
    }

    // Index the new decisions for semantic search (best-effort, no-op without the embedder).
    await ensureEmbeddings(db).catch(() => 0);
  }

  return { status: 'captured', sessionId: meta.sessionId, decisionsExtracted };
}
