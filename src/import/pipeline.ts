import type Database from 'better-sqlite3';
import { scanForSessions } from './scanner.js';
import { parseSessionFile } from './jsonl-parser.js';
import { buildTranscript } from './transcript-builder.js';
import { extractDecisions } from './decision-extractor.js';

export interface ImportProgress {
  phase: 'scan' | 'metadata' | 'extraction' | 'done';
  current?: number;
  total?: number;
  message?: string;
  sessionsImported?: number;
  decisionsExtracted?: number;
}

export interface ImportOptions {
  db: Database.Database;
  projectsDir: string;
  skipExtraction?: boolean;
  concurrency?: number;
  apiKey?: string;
  onProgress?: (progress: ImportProgress) => void;
}

export async function runImportPipeline(options: ImportOptions): Promise<void> {
  const {
    db,
    projectsDir,
    skipExtraction = false,
    concurrency = 3,
    apiKey,
    onProgress = () => {},
  } = options;

  // Get already-imported session IDs
  const existingRows = db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
  const importedIds = new Set(existingRows.map(r => r.id));

  // Phase 1: Scan
  onProgress({ phase: 'scan', message: `Scanning ${projectsDir}...` });
  const scanResult = await scanForSessions(projectsDir, importedIds);
  onProgress({
    phase: 'scan',
    message: `Found ${scanResult.totalFound} sessions (${scanResult.newSessions} new, ${scanResult.alreadyImported} already imported)`,
  });

  if (scanResult.newSessions === 0) {
    onProgress({ phase: 'done', sessionsImported: 0, decisionsExtracted: 0, message: 'Nothing new to import' });
    return;
  }

  // Phase 2: Import metadata
  const insertSession = db.prepare(`
    INSERT OR IGNORE INTO sessions (id, started_at, ended_at, summary, decision_count, project_path, git_branch, message_count, tool_call_count, source)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'imported')
  `);

  let sessionsImported = 0;
  const newSessionFiles: Array<{ filePath: string; sessionId: string }> = [];

  for (let i = 0; i < scanResult.files.length; i++) {
    const { filePath, sessionId } = scanResult.files[i];
    onProgress({ phase: 'metadata', current: i + 1, total: scanResult.files.length, message: `Parsing ${sessionId.slice(0, 8)}...` });

    const meta = await parseSessionFile(filePath);
    if (!meta) continue;

    insertSession.run(
      meta.sessionId,
      meta.startedAt,
      meta.endedAt,
      meta.firstPrompt.slice(0, 200), // initial summary = first prompt
      meta.projectPath,
      meta.gitBranch,
      meta.messageCount,
      meta.toolCallCount,
    );
    sessionsImported++;
    newSessionFiles.push({ filePath, sessionId: meta.sessionId });
  }

  // Phase 3: AI extraction
  let decisionsExtracted = 0;

  if (!skipExtraction && newSessionFiles.length > 0) {
    const insertDecision = db.prepare(`
      INSERT INTO decisions (title, context, decision, rationale, alternatives, consequences, status, created_at, created_by, session_id, tags)
      VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, 'haiku-import', ?, ?)
    `);
    const insertFile = db.prepare(
      'INSERT OR IGNORE INTO decision_files (decision_id, file_path) VALUES (?, ?)'
    );
    const updateSummary = db.prepare('UPDATE sessions SET summary = ?, decision_count = ? WHERE id = ?');

    // Process with concurrency limit
    for (let i = 0; i < newSessionFiles.length; i += concurrency) {
      const batch = newSessionFiles.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async ({ filePath, sessionId }, batchIdx) => {
          const globalIdx = i + batchIdx;
          onProgress({
            phase: 'extraction',
            current: globalIdx + 1,
            total: newSessionFiles.length,
            message: `Extracting decisions from ${sessionId.slice(0, 8)}...`,
          });

          const transcript = await buildTranscript(filePath);
          if (!transcript.trim()) return { sessionId, count: 0, summary: '' };

          const result = await extractDecisions(transcript, apiKey);

          for (const d of result.decisions) {
            const res = insertDecision.run(
              d.title, d.context, d.decision, d.rationale,
              JSON.stringify(d.alternatives), d.consequences,
              sessionId, JSON.stringify(d.tags),
            );
            for (const fp of d.files) {
              insertFile.run(res.lastInsertRowid, fp);
            }
          }

          updateSummary.run(result.summary || null, result.decisions.length, sessionId);
          return { sessionId, count: result.decisions.length, summary: result.summary };
        }),
      );

      for (const r of results) {
        decisionsExtracted += r.count;
      }
    }
  }

  onProgress({
    phase: 'done',
    sessionsImported,
    decisionsExtracted,
    message: `Import complete: ${sessionsImported} sessions, ${decisionsExtracted} decisions`,
  });
}
